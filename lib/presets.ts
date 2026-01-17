import {
  SectionKind,
  VideoStylePreset,
  SectionCameraSettings,
  DEFAULT_TRANSFORM,
  DEFAULT_SECTION_CAMERA,
  DEFAULT_GLOBAL_CAMERA,
  DEFAULT_DOF,
} from './types';

// Smart duration based on section type
export function getSmartDuration(sectionType: SectionKind, baseDuration: number = 3000): number {
  const multipliers: Record<SectionKind, number> = {
    hero: 1.3,       // More time for first impression
    features: 1.2,   // Features need explanation time
    pricing: 1.1,    // Important but scannable
    testimonials: 1.0,
    cta: 0.8,        // Short and punchy
    footer: 0.7,     // Quick glimpse
    content: 1.0,
  };
  return Math.round(baseDuration * (multipliers[sectionType] || 1));
}

// Product Hunt Style - Subtle, professional, smooth
export const PRODUCT_HUNT_STYLE: VideoStylePreset = {
  id: 'product-hunt',
  name: 'Product Hunt',
  description: 'Subtle tilts, smooth fades - perfect for launches',

  getTransform: (index, total, sectionType) => {
    // Gentle alternating angles
    const isEven = index % 2 === 0;
    const baseRotateY = isEven ? -12 : 12;

    // Hero gets special treatment - more centered
    if (sectionType === 'hero') {
      return {
        ...DEFAULT_TRANSFORM,
        rotateX: 8,
        rotateY: -8,
        rotateZ: 0,
        perspective: 1400,
        scale: 1,
        translateX: 0,
        translateY: 0,
        translateZ: 0,
      };
    }

    // CTA - flat and prominent
    if (sectionType === 'cta') {
      return {
        ...DEFAULT_TRANSFORM,
        rotateX: 5,
        rotateY: 0,
        rotateZ: 0,
        perspective: 1600,
        scale: 1,
        translateX: 0,
        translateY: 0,
        translateZ: 0,
      };
    }

    return {
      ...DEFAULT_TRANSFORM,
      rotateX: 10,
      rotateY: baseRotateY,
      rotateZ: 0,
      perspective: 1200,
      scale: 1,
      translateX: 0,
      translateY: 0,
      translateZ: 0,
    };
  },

  getMotion: (index, total) => {
    const isFirst = index === 0;
    const isLast = index === total - 1;

    return {
      entry: isFirst ? 'zoom-in' : 'fade',
      exit: isLast ? 'fade' : 'fade',
      entryDuration: isFirst ? 700 : 500,
      exitDuration: 400,
      easing: 'ease-out',
    };
  },

  getDuration: (sectionType, baseDuration) => getSmartDuration(sectionType, baseDuration),

  // Camera system: Gentle top-to-bottom flow
  getCameraSettings: (index, total, _sectionType): SectionCameraSettings => {
    const isFirst = index === 0;
    const isLast = index === total - 1;

    return {
      moveDirection: 'top-to-bottom',
      // Subtle horizontal drift for visual interest
      moveOffsetX: isFirst ? 0 : (index % 2 === 0 ? 15 : -15),
      moveOffsetY: 0,
      transitionDuration: isFirst ? 1000 : isLast ? 600 : 800,
    };
  },

  globalCamera: {
    ...DEFAULT_GLOBAL_CAMERA,
    rotateX: -40,
    rotateY: 25,
    perspective: 1400,
    zSpacing: 700,
  },

  globalDOF: {
    ...DEFAULT_DOF,
    enabled: true,
    aperture: 2.0,
    maxBlur: 6,
  },
};

// Dynamic Showcase - More movement, alternating angles
export const DYNAMIC_STYLE: VideoStylePreset = {
  id: 'dynamic',
  name: 'Dynamic',
  description: 'Bold angles, zoom effects - eye-catching showcase',

  getTransform: (index, total, sectionType) => {
    const isEven = index % 2 === 0;
    const progress = index / Math.max(1, total - 1);

    // Rotate through different perspectives
    const rotateY = isEven ? -20 + (progress * 10) : 20 - (progress * 10);
    const rotateX = 12 + (Math.sin(index * 0.5) * 5);

    if (sectionType === 'hero') {
      return {
        ...DEFAULT_TRANSFORM,
        rotateX: 15,
        rotateY: -25,
        rotateZ: 2,
        perspective: 1000,
        scale: 1,
        translateX: 0,
        translateY: 0,
        translateZ: 0,
      };
    }

    return {
      ...DEFAULT_TRANSFORM,
      rotateX: rotateX,
      rotateY: rotateY,
      rotateZ: isEven ? 1 : -1,
      perspective: 1100,
      scale: 1,
      translateX: 0,
      translateY: 0,
      translateZ: 0,
    };
  },

  getMotion: (index, total) => {
    const isFirst = index === 0;
    const isLast = index === total - 1;
    const isEven = index % 2 === 0;

    return {
      entry: isFirst ? 'zoom-in' : isEven ? 'slide-left' : 'slide-right',
      exit: isLast ? 'zoom-out' : isEven ? 'slide-right' : 'slide-left',
      entryDuration: 600,
      exitDuration: 500,
      easing: 'ease-in-out',
    };
  },

  getDuration: (sectionType, baseDuration) => getSmartDuration(sectionType, baseDuration * 0.9),

  // Camera system: Alternating left/right with dramatic moves
  getCameraSettings: (index, _total, _sectionType): SectionCameraSettings => {
    const isFirst = index === 0;
    const isEven = index % 2 === 0;

    return {
      moveDirection: isFirst ? 'top-to-bottom' : (isEven ? 'left-to-right' : 'right-to-left'),
      // Larger offsets for dramatic effect
      moveOffsetX: isFirst ? 0 : (isEven ? 40 : -40),
      moveOffsetY: isFirst ? -30 : (index % 3 === 0 ? 20 : -10),
      transitionDuration: isFirst ? 800 : 600,
    };
  },

  globalCamera: {
    ...DEFAULT_GLOBAL_CAMERA,
    rotateX: -50,
    rotateY: 35,
    perspective: 1000,
    zSpacing: 900,
  },

  globalDOF: {
    ...DEFAULT_DOF,
    enabled: true,
    aperture: 3.5,
    maxBlur: 10,
  },
};

// Minimal Style - Clean, flat, simple
export const MINIMAL_STYLE: VideoStylePreset = {
  id: 'minimal',
  name: 'Minimal',
  description: 'Clean and flat - professional simplicity',

  getTransform: (index) => {
    // Very subtle angles
    const isEven = index % 2 === 0;

    return {
      ...DEFAULT_TRANSFORM,
      rotateX: 3,
      rotateY: isEven ? -5 : 5,
      rotateZ: 0,
      perspective: 2000,
      scale: 1,
      translateX: 0,
      translateY: 0,
      translateZ: 0,
    };
  },

  getMotion: () => {
    return {
      entry: 'fade',
      exit: 'fade',
      entryDuration: 400,
      exitDuration: 400,
      easing: 'ease-out',
    };
  },

  getDuration: (sectionType, baseDuration) => getSmartDuration(sectionType, baseDuration * 0.85),

  // Camera system: Minimal movement, just top-to-bottom
  getCameraSettings: (): SectionCameraSettings => {
    return {
      moveDirection: 'top-to-bottom',
      moveOffsetX: 0,
      moveOffsetY: 0,
      transitionDuration: 600,
    };
  },

  globalCamera: {
    ...DEFAULT_GLOBAL_CAMERA,
    rotateX: -30,
    rotateY: 15,
    perspective: 2000,
    zSpacing: 500,
  },

  globalDOF: {
    ...DEFAULT_DOF,
    enabled: true,
    aperture: 1.4,
    maxBlur: 4,
  },
};

// Social Media Style - Square-friendly, bold, attention-grabbing
export const SOCIAL_STYLE: VideoStylePreset = {
  id: 'social',
  name: 'Social',
  description: 'Bold movements for social media - Instagram, Twitter',

  getTransform: (index, total, sectionType) => {
    const isEven = index % 2 === 0;

    if (sectionType === 'hero') {
      return {
        ...DEFAULT_TRANSFORM,
        rotateX: 12,
        rotateY: -30,
        rotateZ: 3,
        perspective: 900,
        scale: 1,
        translateX: 0,
        translateY: 0,
        translateZ: 0,
      };
    }

    return {
      ...DEFAULT_TRANSFORM,
      rotateX: 15,
      rotateY: isEven ? -25 : 25,
      rotateZ: isEven ? 2 : -2,
      perspective: 950,
      scale: 1,
      translateX: 0,
      translateY: 0,
      translateZ: 0,
    };
  },

  getMotion: (index) => {
    const isFirst = index === 0;

    return {
      entry: isFirst ? 'zoom-in' : 'slide-up',
      exit: 'slide-up',
      entryDuration: 500,
      exitDuration: 400,
      easing: 'spring',
    };
  },

  getDuration: (sectionType, baseDuration) => getSmartDuration(sectionType, baseDuration * 0.75),

  // Camera system: Fast, dramatic transitions for social media
  getCameraSettings: (index, total, _sectionType): SectionCameraSettings => {
    const isFirst = index === 0;
    const isLast = index === total - 1;

    // Fast vertical movements with horizontal pops
    return {
      moveDirection: isFirst ? 'top-to-bottom' : 'bottom-to-top',
      moveOffsetX: (index % 3 === 0) ? 50 : (index % 3 === 1) ? -50 : 0,
      moveOffsetY: isFirst ? -40 : (isLast ? 30 : 0),
      transitionDuration: isFirst ? 600 : 450, // Fast transitions
    };
  },

  globalCamera: {
    ...DEFAULT_GLOBAL_CAMERA,
    rotateX: -55,
    rotateY: 40,
    perspective: 900,
    zSpacing: 1000,
  },

  globalDOF: {
    ...DEFAULT_DOF,
    enabled: true,
    aperture: 4.0,
    maxBlur: 12,
  },
};

// All available presets
export const VIDEO_STYLE_PRESETS: VideoStylePreset[] = [
  PRODUCT_HUNT_STYLE,
  DYNAMIC_STYLE,
  MINIMAL_STYLE,
  SOCIAL_STYLE,
];

export const DEFAULT_STYLE = PRODUCT_HUNT_STYLE;

// Get preset by ID
export function getPresetById(id: string): VideoStylePreset {
  return VIDEO_STYLE_PRESETS.find(p => p.id === id) || DEFAULT_STYLE;
}
