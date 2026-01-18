// Core types for the Isometric Video Generator

export interface Project {
  id: string;
  url: string;
  screens: Screen[];
  scenes: Scene[];
  audioTracks: AudioTrack[];
  settings: ProjectSettings;
  createdAt: number;
  updatedAt: number;
}

export interface Screen {
  id: string;
  url: string;
  scrollY: number;
  imageUrl: string;
  thumbnail: string;
  width: number;
  height: number;
  section?: SectionType;
  crop?: CropRegion;
}

export interface CropRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CapturedPage {
  url: string;
  fullPageImage: string;
  thumbnail: string;
  width: number;
  height: number;
  pageHeight?: number;
  deviceScaleFactor?: number;
  sections: DetectedSection[];
}

export type SectionKind = 'hero' | 'features' | 'pricing' | 'testimonials' | 'cta' | 'footer' | 'content';

export interface DetectedSection {
  id: string;
  type: SectionKind;
  label: string;
  confidence: number; // 0-1
  bounds: CropRegion;
  thumbnail?: string;           // Smaller preview image for UI lists
  sectionImage?: string;        // Full-quality cropped image for video rendering
  pixelBounds?: CropRegion;     // Actual pixel dimensions in screenshot
  suggestedDuration: number;    // ms
}

export interface VideoStylePreset {
  id: string;
  name: string;
  description: string;
  getTransform: (index: number, total: number, sectionType: SectionKind) => IsometricTransform;
  getMotion: (index: number, total: number, sectionType: SectionKind) => MotionSettings;
  getDuration: (sectionType: SectionKind, baseDuration: number) => number;
  // Camera system extensions
  getCameraSettings?: (index: number, total: number, sectionType: SectionKind) => SectionCameraSettings;
  globalCamera?: Partial<GlobalCameraSettings>;
  globalDOF?: Partial<DOFSettings>;
}

export type SectionType = 'hero' | 'features' | 'pricing' | 'cta' | 'footer' | 'custom';

export interface Scene {
  id: string;
  screenId: string;
  duration: number; // ms
  transform: IsometricTransform;
  motion: MotionSettings;
  transition: TransitionSettings;
  order: number;
  // Camera system extensions
  camera?: SectionCameraSettings;
  zDepth?: number; // Calculated Z position in 3D space
}

export interface IsometricTransform {
  rotateX: number; // -60 to 60
  rotateY: number; // -60 to 60
  rotateZ: number; // -45 to 45
  perspective: number; // 500-2000
  scale: number; // 0.3-2
  translateX: number; // px
  translateY: number; // px
  translateZ: number; // px
}

export interface MotionSettings {
  entry: AnimationType;
  exit: AnimationType;
  entryDuration: number; // ms
  exitDuration: number; // ms
  easing: EasingType;
}

export type AnimationType = 'none' | 'fade' | 'slide-up' | 'slide-down' | 'slide-left' | 'slide-right' | 'zoom-in' | 'zoom-out' | 'rotate';

export type EasingType = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'spring';

export interface TransitionSettings {
  type: TransitionType;
  duration: number; // ms
}

export type TransitionType = 'cut' | 'crossfade' | 'slide' | 'zoom' | 'wipe';

// ============================================
// Camera & Depth of Field Types
// ============================================

// Camera movement direction for section transitions
export type CameraMoveDirection =
  | 'top-to-bottom'
  | 'bottom-to-top'
  | 'left-to-right'
  | 'right-to-left'
  | 'none';

// Per-section camera settings
export interface SectionCameraSettings {
  moveDirection: CameraMoveDirection;
  moveOffsetX: number;        // -200 to 200 px - horizontal camera offset
  moveOffsetY: number;        // -200 to 200 px - vertical camera offset
  transitionDuration: number; // ms - time to move to this section
}

// Global camera settings (applied to entire video)
export interface GlobalCameraSettings {
  rotateX: number;     // Default isometric angle X (-45 default)
  rotateY: number;     // Default isometric angle Y (30 default)
  perspective: number; // Global perspective distance (1200 default)
  zSpacing: number;    // Z distance between sections (800 default)
}

// Depth of Field settings
export interface DOFSettings {
  enabled: boolean;
  aperture: number;    // 1-10 - controls blur intensity
  maxBlur: number;     // 0-20 px - maximum blur amount
}

export interface ProjectSettings {
  aspectRatio: AspectRatio;
  resolution: Resolution;
  fps: 30 | 60;
  backgroundColor: string;
  effects: EffectSettings;
  globalCamera: GlobalCameraSettings;
  dof: DOFSettings;
}

export interface AudioTrack {
  id: string;
  name: string;
  url: string; // Data URL or blob URL
  duration: number; // ms
  startTime: number; // ms - where in timeline it starts
  volume: number; // 0-1
  waveform?: number[]; // Normalized amplitude data for visualization
}

export type AspectRatio = '16:9' | '1:1' | '9:16' | '4:3';
export type Resolution = '720p' | '1080p' | '4k';

export interface EffectSettings {
  colorCorrection: boolean;
  saturation: number; // -100 to 100
  contrast: number; // -100 to 100
  brightness: number; // -100 to 100
  grain: number; // 0-100
  vignette: number; // 0-100
  blur: number; // 0-20
}

// Presets
export interface IsometricPreset {
  id: string;
  name: string;
  transform: IsometricTransform;
}

export const ISOMETRIC_PRESETS: IsometricPreset[] = [
  {
    id: 'left-45',
    name: 'Left 45°',
    transform: {
      rotateX: 15,
      rotateY: -45,
      rotateZ: 0,
      perspective: 1000,
      scale: 1,
      translateX: 0,
      translateY: 0,
      translateZ: 0,
    },
  },
  {
    id: 'right-45',
    name: 'Right 45°',
    transform: {
      rotateX: 15,
      rotateY: 45,
      rotateZ: 0,
      perspective: 1000,
      scale: 1,
      translateX: 0,
      translateY: 0,
      translateZ: 0,
    },
  },
  {
    id: 'top-down',
    name: 'Top Down',
    transform: {
      rotateX: 45,
      rotateY: 0,
      rotateZ: -45,
      perspective: 1200,
      scale: 1,
      translateX: 0,
      translateY: 0,
      translateZ: 0,
    },
  },
  {
    id: 'flat',
    name: 'Flat',
    transform: {
      rotateX: 0,
      rotateY: 0,
      rotateZ: 0,
      perspective: 1000,
      scale: 1,
      translateX: 0,
      translateY: 0,
      translateZ: 0,
    },
  },
  {
    id: 'hero',
    name: 'Hero',
    transform: {
      rotateX: 10,
      rotateY: -20,
      rotateZ: 0,
      perspective: 1500,
      scale: 1,
      translateX: 0,
      translateY: 0,
      translateZ: 0,
    },
  },
  {
    id: 'showcase',
    name: 'Showcase',
    transform: {
      rotateX: 5,
      rotateY: -15,
      rotateZ: 2,
      perspective: 1800,
      scale: 1,
      translateX: 0,
      translateY: 0,
      translateZ: 0,
    },
  },
];

export const DEFAULT_TRANSFORM: IsometricTransform = ISOMETRIC_PRESETS[0].transform;

export const DEFAULT_MOTION: MotionSettings = {
  entry: 'fade',
  exit: 'fade',
  entryDuration: 500,
  exitDuration: 500,
  easing: 'ease-out',
};

export const DEFAULT_TRANSITION: TransitionSettings = {
  type: 'crossfade',
  duration: 300,
};

// Camera & DOF defaults
export const DEFAULT_GLOBAL_CAMERA: GlobalCameraSettings = {
  rotateX: -45,
  rotateY: 30,
  perspective: 1200,
  zSpacing: 800,
};

export const DEFAULT_DOF: DOFSettings = {
  enabled: true,
  aperture: 2.8,
  maxBlur: 8,
};

export const DEFAULT_SECTION_CAMERA: SectionCameraSettings = {
  moveDirection: 'top-to-bottom',
  moveOffsetX: 0,
  moveOffsetY: 0,
  transitionDuration: 800,
};

export const DEFAULT_SETTINGS: ProjectSettings = {
  aspectRatio: '16:9',
  resolution: '1080p',
  fps: 30,
  backgroundColor: '#0a0a0a',
  effects: {
    colorCorrection: false,
    saturation: 0,
    contrast: 0,
    brightness: 0,
    grain: 0,
    vignette: 0,
    blur: 0,
  },
  globalCamera: { ...DEFAULT_GLOBAL_CAMERA },
  dof: { ...DEFAULT_DOF },
};

export function createEmptyProject(): Project {
  return {
    id: `project-${Date.now()}`,
    url: '',
    screens: [],
    scenes: [],
    audioTracks: [],
    settings: { ...DEFAULT_SETTINGS },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function createScene(screenId: string, order: number): Scene {
  return {
    id: `scene-${Date.now()}-${order}`,
    screenId,
    duration: 3000,
    transform: { ...DEFAULT_TRANSFORM },
    motion: { ...DEFAULT_MOTION },
    transition: { ...DEFAULT_TRANSITION },
    order,
  };
}

// ============================================
// Export Types
// ============================================

export type ExportFormat = 'mp4' | 'webm' | 'gif';
export type ExportQuality = 'low' | 'medium' | 'high' | 'ultra';

export interface ExportPreset {
  id: string;
  name: string;
  platform: string;
  aspectRatio: AspectRatio;
  resolution: Resolution;
  fps: 30 | 60;
  format: ExportFormat;
  quality: ExportQuality;
}

export interface ExportSettings {
  format: ExportFormat;
  quality: ExportQuality;
  resolution: Resolution;
  aspectRatio: AspectRatio;
  fps: 30 | 60;
  includeAudio: boolean;
}

export const EXPORT_PRESETS: ExportPreset[] = [
  {
    id: 'twitter-landscape',
    name: 'Twitter/X Landscape',
    platform: 'Twitter',
    aspectRatio: '16:9',
    resolution: '1080p',
    fps: 30,
    format: 'mp4',
    quality: 'high',
  },
  {
    id: 'twitter-square',
    name: 'Twitter/X Square',
    platform: 'Twitter',
    aspectRatio: '1:1',
    resolution: '1080p',
    fps: 30,
    format: 'mp4',
    quality: 'high',
  },
  {
    id: 'instagram-square',
    name: 'Instagram Feed',
    platform: 'Instagram',
    aspectRatio: '1:1',
    resolution: '1080p',
    fps: 30,
    format: 'mp4',
    quality: 'high',
  },
  {
    id: 'instagram-story',
    name: 'Instagram Story',
    platform: 'Instagram',
    aspectRatio: '9:16',
    resolution: '1080p',
    fps: 30,
    format: 'mp4',
    quality: 'high',
  },
  {
    id: 'youtube',
    name: 'YouTube',
    platform: 'YouTube',
    aspectRatio: '16:9',
    resolution: '1080p',
    fps: 60,
    format: 'mp4',
    quality: 'ultra',
  },
  {
    id: 'producthunt',
    name: 'Product Hunt',
    platform: 'Product Hunt',
    aspectRatio: '16:9',
    resolution: '720p',
    fps: 30,
    format: 'gif',
    quality: 'medium',
  },
];

export const DEFAULT_EXPORT_SETTINGS: ExportSettings = {
  format: 'mp4',
  quality: 'high',
  resolution: '1080p',
  aspectRatio: '16:9',
  fps: 30,
  includeAudio: true,
};
