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

// Convert SectionKind to SectionType (maps extra types to 'custom')
function toSectionType(kind: SectionKind): SectionType {
  const validTypes: SectionType[] = ['hero', 'features', 'pricing', 'cta', 'footer', 'custom'];
  return validTypes.includes(kind as SectionType) ? (kind as SectionType) : 'custom';
}
import { DEFAULT_STYLE, getPresetById } from './presets';

interface EditorState {
  // Project
  project: Project;

  // Selection
  selectedSceneId: string | null;
  selectedScreenId: string | null;

  // Playback
  isPlaying: boolean;
  currentTime: number; // ms

  // UI State
  isCapturing: boolean;
  isExporting: boolean;
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

  // Actions - Playback
  play: () => void;
  pause: () => void;
  stop: () => void;
  seek: (time: number) => void;

  // Actions - UI
  setCapturing: (capturing: boolean) => void;
  setExporting: (exporting: boolean) => void;
  setExportProgress: (progress: number) => void;
  setCapturedPage: (page: CapturedPage | null) => void;
  createScreenFromCrop: (crop: { x: number; y: number; width: number; height: number }, name?: string) => void;

  // Actions - Audio
  addAudioTrack: (track: AudioTrack) => void;
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

export const useEditorStore = create<EditorState>()(
  persist(
    (set, get) => ({
      // Initial state
      project: createEmptyProject(),
      selectedSceneId: null,
      selectedScreenId: null,
      isPlaying: false,
      currentTime: 0,
      isCapturing: false,
      isExporting: false,
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

      resetProject: () =>
        set({
          project: createEmptyProject(),
          selectedSceneId: null,
          selectedScreenId: null,
          isPlaying: false,
          currentTime: 0,
        }),

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

      removeScene: (sceneId) =>
        set((state) => {
          const newScenes = state.project.scenes
            .filter((s) => s.id !== sceneId)
            .map((s, i) => ({ ...s, order: i }));
          return {
            project: {
              ...state.project,
              scenes: newScenes,
              updatedAt: Date.now(),
            },
            selectedSceneId:
              state.selectedSceneId === sceneId
                ? newScenes[0]?.id ?? null
                : state.selectedSceneId,
          };
        }),

      reorderScenes: (scenes) =>
        set((state) => ({
          project: {
            ...state.project,
            scenes: scenes.map((s, i) => ({ ...s, order: i })),
            updatedAt: Date.now(),
          },
        })),

      selectScene: (sceneId) => set({ selectedSceneId: sceneId }),

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

      // Playback actions
      play: () => set({ isPlaying: true }),
      pause: () => set({ isPlaying: false }),
      stop: () => set({ isPlaying: false, currentTime: 0 }),
      seek: (time) => set({ currentTime: time }),

      // UI actions
      setCapturing: (capturing) => set({ isCapturing: capturing }),
      setExporting: (exporting) => set({ isExporting: exporting }),
      setExportProgress: (progress) => set({ exportProgress: progress }),
      setCapturedPage: (page) => set({ capturedPage: page }),
      createScreenFromCrop: (crop, name) => {
        const state = get();
        const capturedPage = state.capturedPage;
        if (!capturedPage) return;

        const screenId = `screen-${Date.now()}`;
        const screen: Screen = {
          id: screenId,
          url: capturedPage.url,
          scrollY: crop.y,
          imageUrl: capturedPage.fullPageImage,
          thumbnail: capturedPage.thumbnail,
          width: crop.width,
          height: crop.height,
          section: (name as Screen['section']) || 'custom',
          crop: crop,
        };

        set((state) => ({
          project: {
            ...state.project,
            screens: [...state.project.screens, screen],
            updatedAt: Date.now(),
          },
        }));

        // Also add as a scene
        const { addScene } = get();
        addScene(screenId);
      },

      // Audio actions
      addAudioTrack: (track) =>
        set((state) => ({
          project: {
            ...state.project,
            audioTracks: [...state.project.audioTracks, track],
            updatedAt: Date.now(),
          },
        })),

      removeAudioTrack: (trackId) =>
        set((state) => ({
          project: {
            ...state.project,
            audioTracks: state.project.audioTracks.filter((t) => t.id !== trackId),
            updatedAt: Date.now(),
          },
        })),

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

        // Create screens and scenes from selected sections
        const screens: Screen[] = [];
        const scenes: Scene[] = [];

        selectedSections.forEach((section, index) => {
          const screenId = `screen-${Date.now()}-${index}`;
          const sceneId = `scene-${Date.now()}-${index}`;

          // Use high-quality sectionImage for rendering, fall back to thumbnail
          const highQualityImage = section.sectionImage || section.thumbnail || capturedPage.thumbnail;
          const previewThumb = section.thumbnail || capturedPage.thumbnail;

          // Use pixel bounds if available for accurate dimensions
          const pixelBounds = section.pixelBounds || section.bounds;

          const screen: Screen = {
            id: screenId,
            url: capturedPage.url,
            scrollY: section.bounds.y,
            imageUrl: highQualityImage,  // Full quality for video
            thumbnail: previewThumb,      // Smaller for UI previews
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
            zDepth: -index * state.project.settings.globalCamera.zSpacing,
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
          currentTime: 0,
          isPlaying: false,
        }));

        // Auto-play after a short delay
        setTimeout(() => {
          get().play();
        }, 300);

        // Calculate Z depths after generating
        setTimeout(() => {
          get().calculateSceneZDepths();
        }, 50);
      },

      setManualMode: (manual) => set({ isManualMode: manual }),

      addManualScreens: async (files: File[]) => {
        const state = get();
        const style = getPresetById(state.selectedStyleId);
        const screens: Screen[] = [];
        const scenes: Scene[] = [];

        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const imageUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.readAsDataURL(file);
          });

          // Get image dimensions
          const img = new Image();
          await new Promise<void>((resolve) => {
            img.onload = () => resolve();
            img.src = imageUrl;
          });

          const screenId = `screen-${Date.now()}-${i}`;
          const sceneId = `scene-${Date.now()}-${i}`;

          const screen: Screen = {
            id: screenId,
            url: 'manual-upload',
            scrollY: 0,
            imageUrl,
            thumbnail: imageUrl,
            width: img.width,
            height: img.height,
            section: 'custom',
          };

          const totalSections = files.length;
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
            zDepth: -i * state.project.settings.globalCamera.zSpacing,
          };

          screens.push(screen);
          scenes.push(scene);
        }

        set((state) => ({
          project: {
            ...state.project,
            screens: [...state.project.screens, ...screens],
            scenes: [...state.project.scenes, ...scenes],
            updatedAt: Date.now(),
          },
          selectedSceneId: scenes[0]?.id || state.selectedSceneId,
        }));

        // Auto-play after adding
        setTimeout(() => {
          get().play();
        }, 300);
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
      // Only persist minimal settings, NOT screens/images (too large for localStorage)
      partialize: (state) => ({
        project: {
          ...state.project,
          // Exclude screens and scenes - they contain large base64 images
          screens: [],
          scenes: [],
        },
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

        return {
          ...currentState,
          ...persisted,
          project: {
            ...currentState.project,
            ...persisted.project,
            settings: mergedSettings,
          },
        };
      },
    }
  )
);

// Selectors
export const useSelectedScene = () => {
  const { project, selectedSceneId } = useEditorStore();
  return project.scenes.find((s) => s.id === selectedSceneId) ?? null;
};

export const useSelectedScreen = () => {
  const { project, selectedSceneId } = useEditorStore();
  const scene = project.scenes.find((s) => s.id === selectedSceneId);
  if (!scene) return null;
  return project.screens.find((s) => s.id === scene.screenId) ?? null;
};

export const useTotalDuration = () => {
  const { project } = useEditorStore();
  return project.scenes.reduce((acc, scene) => acc + scene.duration, 0);
};

export const useSceneAtTime = (time: number) => {
  const { project } = useEditorStore();
  let currentTime = 0;
  for (const scene of project.scenes) {
    if (time >= currentTime && time < currentTime + scene.duration) {
      return { scene, sceneTime: time - currentTime };
    }
    currentTime += scene.duration;
  }
  return null;
};
