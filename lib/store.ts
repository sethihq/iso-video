import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  Project,
  Screen,
  Scene,
  IsometricTransform,
  MotionSettings,
  TransitionSettings,
  ProjectSettings,
  CapturedPage,
  AudioTrack,
  SectionType,
  SectionKind,
  GlobalCameraSettings,
  DOFSettings,
  SectionCameraSettings,
  createEmptyProject,
  createScene,
  DEFAULT_TRANSITION,
  DEFAULT_SECTION_CAMERA,
  DEFAULT_GLOBAL_CAMERA,
  DEFAULT_DOF,
} from './types';
import { DEFAULT_STYLE, getPresetById } from './presets';
import { usePlaybackStore } from './playback';
import { createBlobUrl, createProjectStorage, dataUrlToBlobUrl, revokeBlobUrl } from './persist';
import { getSceneTimings, sceneRestTime } from './render/frame';

// Convert SectionKind to SectionType (maps extra types to 'custom')
function toSectionType(kind: SectionKind): SectionType {
  const validTypes: SectionType[] = ['hero', 'features', 'pricing', 'cta', 'footer', 'custom'];
  return validTypes.includes(kind as SectionType) ? (kind as SectionType) : 'custom';
}

interface EditorState {
  // Project
  project: Project;

  // Selection
  selectedSceneId: string | null;
  selectedScreenId: string | null;

  // UI State
  isCapturing: boolean;
  isExporting: boolean;
  isExportOpen: boolean;
  exportProgress: number;
  capturedPage: CapturedPage | null;

  // New simplified flow state
  selectedStyleId: string;
  baseDuration: number; // Base duration in ms (modified by style)
  selectedSectionIds: string[]; // Which sections are selected for video
  isManualMode: boolean; // Manual upload mode vs URL capture

  // Actions - Project
  setUrl: (url: string) => void;
  updateSettings: (settings: Partial<ProjectSettings>) => void;
  resetProject: () => void;

  // Actions - Screens
  addScreen: (screen: Screen) => void;
  addScreens: (screens: Screen[]) => void;
  removeScreen: (screenId: string) => void;
  clearScreens: () => void;

  // Actions - Scenes
  addScene: (screenId: string) => void;
  addSceneFromScreen: (screen: Screen) => void;
  removeScene: (sceneId: string) => void;
  reorderScenes: (scenes: Scene[]) => void;
  selectScene: (sceneId: string | null) => void;
  updateSceneTransform: (sceneId: string, transform: Partial<IsometricTransform>) => void;
  updateSceneMotion: (sceneId: string, motion: Partial<MotionSettings>) => void;
  updateSceneTransition: (sceneId: string, transition: Partial<TransitionSettings>) => void;
  updateSceneDuration: (sceneId: string, duration: number) => void;
  applyPresetToScene: (sceneId: string, transform: IsometricTransform) => void;

  // Actions - UI
  setCapturing: (capturing: boolean) => void;
  setExporting: (exporting: boolean) => void;
  setExportOpen: (open: boolean) => void;
  setExportProgress: (progress: number) => void;
  setCapturedPage: (page: CapturedPage | null) => void;

  // Actions - Audio
  addAudioTrack: (track: AudioTrack) => void;
  addAudioFile: (file: File) => Promise<void>;
  removeAudioTrack: (trackId: string) => void;
  updateAudioTrack: (trackId: string, updates: Partial<AudioTrack>) => void;

  // Actions - Simplified Flow
  setSelectedStyle: (styleId: string) => void;
  setBaseDuration: (duration: number) => void;
  toggleSectionSelection: (sectionId: string) => void;
  selectAllSections: () => void;
  deselectAllSections: () => void;
  generateVideoFromSections: () => void;
  setManualMode: (manual: boolean) => void;
  addManualScreens: (files: File[]) => Promise<void>;

  // Actions - Camera & DOF
  updateGlobalCamera: (camera: Partial<GlobalCameraSettings>) => void;
  updateDOFSettings: (dof: Partial<DOFSettings>) => void;
  updateSceneCamera: (sceneId: string, camera: Partial<SectionCameraSettings>) => void;
  calculateSceneZDepths: () => void;
}

const STORE_VERSION = 1;

let autoPlayTimer: ReturnType<typeof setTimeout> | null = null;

// Start a freshly generated video from the top after the UI settles
function autoPlayFromStart() {
  if (autoPlayTimer) clearTimeout(autoPlayTimer);
  const playback = usePlaybackStore.getState();
  playback.pause();
  playback.seek(0);
  autoPlayTimer = setTimeout(() => {
    autoPlayTimer = null;
    usePlaybackStore.getState().play();
  }, 300);
}

function revokeScreenUrls(screens: Screen[]) {
  for (const screen of screens) {
    revokeBlobUrl(screen.imageUrl);
    revokeBlobUrl(screen.thumbnail);
  }
}

const THUMBNAIL_WIDTH = 480;
const THUMBNAIL_MAX_HEIGHT = 960;

// A small top crop for the timeline and lists, instead of the full upload
async function createThumbnail(bitmap: ImageBitmap): Promise<Blob> {
  const ratio = Math.min(1, THUMBNAIL_WIDTH / bitmap.width);
  const width = Math.max(1, Math.round(bitmap.width * ratio));
  const height = Math.max(1, Math.round(bitmap.height * ratio));
  const canvas = new OffscreenCanvas(width, Math.min(height, THUMBNAIL_MAX_HEIGHT));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is not available');
  context.drawImage(bitmap, 0, 0, width, height);
  return canvas.convertToBlob({ type: 'image/webp', quality: 0.85 });
}

function readAudioDuration(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const audio = new Audio();
    const timeout = setTimeout(() => fail(new Error('Timed out reading the audio file')), 10000);
    const cleanup = () => {
      clearTimeout(timeout);
      audio.onloadedmetadata = null;
      audio.onerror = null;
    };
    function fail(error: Error) {
      cleanup();
      reject(error);
    }
    audio.onloadedmetadata = () => {
      cleanup();
      if (Number.isFinite(audio.duration)) resolve(audio.duration * 1000);
      else reject(new Error('Could not read the audio length'));
    };
    audio.onerror = () => fail(new Error('This audio format is not supported'));
    audio.preload = 'metadata';
    audio.src = url;
  });
}

export const useEditorStore = create<EditorState>()(
  persist(
    (set, get) => ({
      // Initial state
      project: createEmptyProject(),
      selectedSceneId: null,
      selectedScreenId: null,
      isCapturing: false,
      isExporting: false,
      isExportOpen: false,
      exportProgress: 0,
      capturedPage: null,
      selectedStyleId: DEFAULT_STYLE.id,
      baseDuration: 3000,
      selectedSectionIds: [],
      isManualMode: false,

      // Project actions
      setUrl: (url) =>
        set((state) => ({
          project: { ...state.project, url, updatedAt: Date.now() },
        })),

      updateSettings: (settings) =>
        set((state) => ({
          project: {
            ...state.project,
            settings: { ...state.project.settings, ...settings },
            updatedAt: Date.now(),
          },
        })),

      resetProject: () => {
        revokeScreenUrls(get().project.screens);
        usePlaybackStore.getState().stop();
        set({
          project: createEmptyProject(),
          selectedSceneId: null,
          selectedScreenId: null,
        });
      },

      // Screen actions
      addScreen: (screen) =>
        set((state) => ({
          project: {
            ...state.project,
            screens: [...state.project.screens, screen],
            updatedAt: Date.now(),
          },
        })),

      addScreens: (screens) =>
        set((state) => ({
          project: {
            ...state.project,
            screens: [...state.project.screens, ...screens],
            updatedAt: Date.now(),
          },
        })),

      removeScreen: (screenId) =>
        set((state) => ({
          project: {
            ...state.project,
            screens: state.project.screens.filter((s) => s.id !== screenId),
            scenes: state.project.scenes.filter((s) => s.screenId !== screenId),
            updatedAt: Date.now(),
          },
        })),

      clearScreens: () =>
        set((state) => ({
          project: {
            ...state.project,
            screens: [],
            scenes: [],
            updatedAt: Date.now(),
          },
          selectedSceneId: null,
          selectedScreenId: null,
        })),

      // Scene actions
      addScene: (screenId) =>
        set((state) => {
          const order = state.project.scenes.length;
          const scene = createScene(screenId, order);
          return {
            project: {
              ...state.project,
              scenes: [...state.project.scenes, scene],
              updatedAt: Date.now(),
            },
            selectedSceneId: scene.id,
          };
        }),

      addSceneFromScreen: (screen) => {
        const { addScreen, addScene } = get();
        addScreen(screen);
        addScene(screen.id);
      },

      removeScene: (sceneId) => {
        const { project, selectedSceneId } = get();
        const removed = project.scenes.find((s) => s.id === sceneId);
        const newScenes = project.scenes
          .filter((s) => s.id !== sceneId)
          .map((s, i) => ({ ...s, order: i }));
        // Drop the screenshot too unless another scene still shows it
        const orphaned = removed && !newScenes.some((s) => s.screenId === removed.screenId)
          ? project.screens.filter((s) => s.id === removed.screenId)
          : [];
        set({
          project: {
            ...project,
            scenes: newScenes,
            screens: project.screens.filter((s) => !orphaned.includes(s)),
            updatedAt: Date.now(),
          },
          selectedSceneId:
            selectedSceneId === sceneId ? newScenes[0]?.id ?? null : selectedSceneId,
        });
        revokeScreenUrls(orphaned);
      },

      reorderScenes: (scenes) =>
        set((state) => ({
          project: {
            ...state.project,
            scenes: scenes.map((s, i) => ({ ...s, order: i })),
            updatedAt: Date.now(),
          },
        })),

      selectScene: (sceneId) => {
        set({ selectedSceneId: sceneId });
        if (!sceneId) return;

        // Show the selected scene, so edits to it are visible right away
        const { scenes } = get().project;
        const index = scenes.findIndex((s) => s.id === sceneId);
        if (index < 0) return;
        const { timings } = getSceneTimings(scenes);
        const playback = usePlaybackStore.getState();
        const { start, end } = timings[index];
        if (playback.currentTime < start || playback.currentTime >= end) {
          playback.seek(sceneRestTime(scenes, index));
        }
      },

      updateSceneTransform: (sceneId, transform) =>
        set((state) => ({
          project: {
            ...state.project,
            scenes: state.project.scenes.map((s) =>
              s.id === sceneId
                ? { ...s, transform: { ...s.transform, ...transform } }
                : s
            ),
            updatedAt: Date.now(),
          },
        })),

      updateSceneMotion: (sceneId, motion) =>
        set((state) => ({
          project: {
            ...state.project,
            scenes: state.project.scenes.map((s) =>
              s.id === sceneId
                ? { ...s, motion: { ...s.motion, ...motion } }
                : s
            ),
            updatedAt: Date.now(),
          },
        })),

      updateSceneTransition: (sceneId, transition) =>
        set((state) => ({
          project: {
            ...state.project,
            scenes: state.project.scenes.map((s) =>
              s.id === sceneId
                ? { ...s, transition: { ...s.transition, ...transition } }
                : s
            ),
            updatedAt: Date.now(),
          },
        })),

      updateSceneDuration: (sceneId, duration) =>
        set((state) => ({
          project: {
            ...state.project,
            scenes: state.project.scenes.map((s) =>
              s.id === sceneId ? { ...s, duration } : s
            ),
            updatedAt: Date.now(),
          },
        })),

      applyPresetToScene: (sceneId, transform) =>
        set((state) => ({
          project: {
            ...state.project,
            scenes: state.project.scenes.map((s) =>
              s.id === sceneId ? { ...s, transform: { ...transform } } : s
            ),
            updatedAt: Date.now(),
          },
        })),

      // UI actions
      setCapturing: (capturing) => set({ isCapturing: capturing }),
      setExporting: (exporting) => set({ isExporting: exporting }),
      setExportOpen: (open) => set({ isExportOpen: open }),
      setExportProgress: (progress) => set({ exportProgress: progress }),
      setCapturedPage: (page) => set({ capturedPage: page }),

      // Audio actions
      addAudioTrack: (track) =>
        set((state) => ({
          project: {
            ...state.project,
            audioTracks: [...state.project.audioTracks, track],
            updatedAt: Date.now(),
          },
        })),

      addAudioFile: async (file) => {
        const url = createBlobUrl(file);
        try {
          const duration = await readAudioDuration(url);
          get().addAudioTrack({
            id: `audio-${Date.now()}`,
            name: file.name,
            url,
            duration,
            startTime: 0,
            volume: 0.8,
          });
        } catch (error) {
          revokeBlobUrl(url);
          throw error;
        }
      },

      removeAudioTrack: (trackId) => {
        const track = get().project.audioTracks.find((t) => t.id === trackId);
        set((state) => ({
          project: {
            ...state.project,
            audioTracks: state.project.audioTracks.filter((t) => t.id !== trackId),
            updatedAt: Date.now(),
          },
        }));
        if (track) revokeBlobUrl(track.url);
      },

      updateAudioTrack: (trackId, updates) =>
        set((state) => ({
          project: {
            ...state.project,
            audioTracks: state.project.audioTracks.map((t) =>
              t.id === trackId ? { ...t, ...updates } : t
            ),
            updatedAt: Date.now(),
          },
        })),

      // Simplified flow actions
      setSelectedStyle: (styleId) => set({ selectedStyleId: styleId }),

      setBaseDuration: (duration) => set({ baseDuration: duration }),

      toggleSectionSelection: (sectionId) =>
        set((state) => ({
          selectedSectionIds: state.selectedSectionIds.includes(sectionId)
            ? state.selectedSectionIds.filter((id) => id !== sectionId)
            : [...state.selectedSectionIds, sectionId],
        })),

      selectAllSections: () =>
        set((state) => ({
          selectedSectionIds: state.capturedPage?.sections.map((s) => s.id) || [],
        })),

      deselectAllSections: () => set({ selectedSectionIds: [] }),

      generateVideoFromSections: () => {
        const state = get();
        const { capturedPage, selectedSectionIds, selectedStyleId, baseDuration } = state;

        if (!capturedPage || selectedSectionIds.length === 0) return;

        const style = getPresetById(selectedStyleId);
        const selectedSections = capturedPage.sections.filter((s) =>
          selectedSectionIds.includes(s.id)
        );

        // Sort sections by their vertical position (bounds.y)
        selectedSections.sort((a, b) => a.bounds.y - b.bounds.y);

        const totalSections = selectedSections.length;
        const zSpacing = state.project.settings.globalCamera.zSpacing;

        // Create screens and scenes from selected sections
        const screens: Screen[] = [];
        const scenes: Scene[] = [];

        selectedSections.forEach((section, index) => {
          const screenId = `screen-${Date.now()}-${index}`;
          const sceneId = `scene-${Date.now()}-${index}`;

          // Use high-quality sectionImage for rendering, fall back to thumbnail.
          // Decoded to object URLs once, so they persist as Blobs.
          const highQualityImage = section.sectionImage || section.thumbnail || capturedPage.thumbnail;
          const previewThumb = section.thumbnail || capturedPage.thumbnail;

          // Use pixel bounds if available for accurate dimensions
          const pixelBounds = section.pixelBounds || section.bounds;

          const screen: Screen = {
            id: screenId,
            url: capturedPage.url,
            scrollY: section.bounds.y,
            imageUrl: dataUrlToBlobUrl(highQualityImage),  // Full quality for video
            thumbnail: dataUrlToBlobUrl(previewThumb),      // Smaller for UI previews
            width: pixelBounds.width,
            height: pixelBounds.height,
            section: toSectionType(section.type),
            crop: section.bounds,
          };

          // Get smart values from style preset
          const transform = style.getTransform(index, totalSections, section.type);
          const motion = style.getMotion(index, totalSections, section.type);
          const duration = style.getDuration(section.type, baseDuration);

          // Get camera settings from preset (if available) or use defaults
          const camera = style.getCameraSettings
            ? style.getCameraSettings(index, totalSections, section.type)
            : { ...DEFAULT_SECTION_CAMERA };

          // Create scene with smart defaults including camera
          const scene: Scene = {
            id: sceneId,
            screenId,
            duration,
            transform,
            motion,
            transition: { ...DEFAULT_TRANSITION },
            order: index,
            camera,
            zDepth: -index * zSpacing,
          };

          screens.push(screen);
          scenes.push(scene);
        });

        // Apply preset's global camera and DOF settings if available
        const newGlobalCamera = style.globalCamera
          ? { ...state.project.settings.globalCamera, ...style.globalCamera }
          : state.project.settings.globalCamera;

        const newDOF = style.globalDOF
          ? { ...state.project.settings.dof, ...style.globalDOF }
          : state.project.settings.dof;

        const previousScreens = state.project.screens;
        set((state) => ({
          project: {
            ...state.project,
            screens,
            scenes,
            settings: {
              ...state.project.settings,
              globalCamera: newGlobalCamera,
              dof: newDOF,
            },
            updatedAt: Date.now(),
          },
          selectedSceneId: scenes[0]?.id || null,
        }));
        revokeScreenUrls(previousScreens);

        autoPlayFromStart();
      },

      setManualMode: (manual) => set({ isManualMode: manual }),

      // Uploaded screenshots replace the current video, like a new capture
      addManualScreens: async (files: File[]) => {
        const state = get();
        const style = getPresetById(state.selectedStyleId);
        const zSpacing = state.project.settings.globalCamera.zSpacing;

        // One file at a time: a full-page screenshot decodes to hundreds of MB
        const images: { file: File; thumbnail: Blob; width: number; height: number }[] = [];
        for (const file of files) {
          let bitmap: ImageBitmap | null = null;
          try {
            bitmap = await createImageBitmap(file);
            const thumbnail = await createThumbnail(bitmap).catch(() => file);
            images.push({ file, thumbnail, width: bitmap.width, height: bitmap.height });
          } catch {
            // Skip files the browser can't decode (HEIC in Chrome, for example)
          } finally {
            bitmap?.close();
          }
        }
        if (images.length === 0) {
          throw new Error("Couldn't read these images. Try PNG, JPG or WebP.");
        }

        const screens: Screen[] = [];
        const scenes: Scene[] = [];
        const totalSections = images.length;

        for (let i = 0; i < images.length; i++) {
          const { file, thumbnail, width, height } = images[i];

          const screenId = `screen-${Date.now()}-${i}`;
          const sceneId = `scene-${Date.now()}-${i}`;

          const screen: Screen = {
            id: screenId,
            url: 'manual-upload',
            scrollY: 0,
            imageUrl: createBlobUrl(file),
            thumbnail: createBlobUrl(thumbnail),
            width,
            height,
            section: 'custom',
          };

          const transform = style.getTransform(i, totalSections, 'content');
          const motion = style.getMotion(i, totalSections, 'content');
          const duration = style.getDuration('content', state.baseDuration);
          const camera = style.getCameraSettings
            ? style.getCameraSettings(i, totalSections, 'content')
            : { ...DEFAULT_SECTION_CAMERA };

          const scene: Scene = {
            id: sceneId,
            screenId,
            duration,
            transform,
            motion,
            transition: { ...DEFAULT_TRANSITION },
            order: i,
            camera,
            zDepth: -i * zSpacing,
          };

          screens.push(screen);
          scenes.push(scene);
        }

        const previousScreens = get().project.screens;
        set((state) => ({
          project: {
            ...state.project,
            screens,
            scenes,
            updatedAt: Date.now(),
          },
          selectedSceneId: scenes[0]?.id || null,
        }));
        revokeScreenUrls(previousScreens);

        autoPlayFromStart();
      },

      // Camera & DOF actions
      updateGlobalCamera: (camera) =>
        set((state) => ({
          project: {
            ...state.project,
            settings: {
              ...state.project.settings,
              globalCamera: { ...state.project.settings.globalCamera, ...camera },
            },
            updatedAt: Date.now(),
          },
        })),

      updateDOFSettings: (dof) =>
        set((state) => ({
          project: {
            ...state.project,
            settings: {
              ...state.project.settings,
              dof: { ...state.project.settings.dof, ...dof },
            },
            updatedAt: Date.now(),
          },
        })),

      updateSceneCamera: (sceneId, camera) =>
        set((state) => ({
          project: {
            ...state.project,
            scenes: state.project.scenes.map((s) =>
              s.id === sceneId
                ? {
                    ...s,
                    camera: { ...(s.camera || DEFAULT_SECTION_CAMERA), ...camera },
                  }
                : s
            ),
            updatedAt: Date.now(),
          },
        })),

      calculateSceneZDepths: () =>
        set((state) => {
          const globalCamera = state.project.settings.globalCamera || DEFAULT_GLOBAL_CAMERA;
          const { zSpacing } = globalCamera;
          const scenes = state.project.scenes.map((scene, index) => ({
            ...scene,
            zDepth: -index * zSpacing, // Negative Z = further from camera
          }));
          return {
            project: {
              ...state.project,
              scenes,
              updatedAt: Date.now(),
            },
          };
        }),
    }),
    {
      name: 'iso-video-editor',
      version: STORE_VERSION,
      // IndexedDB keeps screenshots and music as Blobs, so the whole project survives a reload
      storage: createProjectStorage(STORE_VERSION),
      // Hydrated after mount (see EditorRuntime) so server and client markup match
      skipHydration: true,
      partialize: (state) => ({
        project: state.project,
        selectedSceneId: state.selectedSceneId,
        selectedStyleId: state.selectedStyleId,
        baseDuration: state.baseDuration,
      }),
      // Merge persisted state with defaults to handle new fields
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<EditorState> | undefined;
        if (!persisted) return currentState;

        // Ensure project settings have all required fields with defaults
        const mergedSettings = {
          ...currentState.project.settings,
          ...persisted.project?.settings,
          globalCamera: {
            ...DEFAULT_GLOBAL_CAMERA,
            ...persisted.project?.settings?.globalCamera,
          },
          dof: {
            ...DEFAULT_DOF,
            ...persisted.project?.settings?.dof,
          },
        };

        const project: Project = {
          ...currentState.project,
          ...persisted.project,
          screens: persisted.project?.screens ?? [],
          scenes: persisted.project?.scenes ?? [],
          audioTracks: (persisted.project?.audioTracks ?? []).filter((t) => t.url),
          settings: mergedSettings,
        };

        return {
          ...currentState,
          ...persisted,
          project,
          selectedSceneId: project.scenes.some((s) => s.id === persisted.selectedSceneId)
            ? persisted.selectedSceneId ?? null
            : project.scenes[0]?.id ?? null,
        };
      },
    }
  )
);

// Keep the playback clock's duration in sync with the timeline
const totalDurationOf = (project: Project) => getSceneTimings(project.scenes).total;
usePlaybackStore.getState().setDuration(totalDurationOf(useEditorStore.getState().project));
useEditorStore.subscribe((state, prev) => {
  if (state.project.scenes !== prev.project.scenes) {
    usePlaybackStore.getState().setDuration(totalDurationOf(state.project));
  }
});

// Selectors
export const useSelectedScene = () =>
  useEditorStore((state) =>
    state.project.scenes.find((s) => s.id === state.selectedSceneId) ?? null
  );

export const useSelectedScreen = () =>
  useEditorStore((state) => {
    const scene = state.project.scenes.find((s) => s.id === state.selectedSceneId);
    if (!scene) return null;
    return state.project.screens.find((s) => s.id === scene.screenId) ?? null;
  });

export const useTotalDuration = () =>
  useEditorStore((state) => totalDurationOf(state.project));
