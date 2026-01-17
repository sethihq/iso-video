'use client';

import { useMemo } from 'react';
import { motion, AnimatePresence, Variants, Transition } from 'framer-motion';
import { Screen, Scene, AnimationType, EasingType } from '@/lib/types';

interface SceneRendererProps {
  currentScene: Scene | null;
  currentScreen: Screen | null;
  previousScene: Scene | null;
  previousScreen: Screen | null;
  sceneProgress: number;
  isTransitioning: boolean;
  transitionProgress: number;
}

const EASING_MAP: Record<EasingType, [number, number, number, number] | 'spring'> = {
  'linear': [0, 0, 1, 1],
  'ease-in': [0.4, 0, 1, 1],
  'ease-out': [0, 0, 0.2, 1],
  'ease-in-out': [0.4, 0, 0.2, 1],
  'spring': 'spring',
};

function getAnimationVariants(type: AnimationType, isEntry: boolean): Variants {
  const direction = isEntry ? 1 : -1;

  const variants: Record<AnimationType, Variants> = {
    'none': {
      initial: {},
      animate: {},
      exit: {},
    },
    'fade': {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
    },
    'slide-up': {
      initial: { opacity: 0, y: 100 * direction },
      animate: { opacity: 1, y: 0 },
      exit: { opacity: 0, y: -100 * direction },
    },
    'slide-down': {
      initial: { opacity: 0, y: -100 * direction },
      animate: { opacity: 1, y: 0 },
      exit: { opacity: 0, y: 100 * direction },
    },
    'slide-left': {
      initial: { opacity: 0, x: 100 * direction },
      animate: { opacity: 1, x: 0 },
      exit: { opacity: 0, x: -100 * direction },
    },
    'slide-right': {
      initial: { opacity: 0, x: -100 * direction },
      animate: { opacity: 1, x: 0 },
      exit: { opacity: 0, x: 100 * direction },
    },
    'zoom-in': {
      initial: { opacity: 0, scale: 0.8 },
      animate: { opacity: 1, scale: 1 },
      exit: { opacity: 0, scale: 1.2 },
    },
    'zoom-out': {
      initial: { opacity: 0, scale: 1.2 },
      animate: { opacity: 1, scale: 1 },
      exit: { opacity: 0, scale: 0.8 },
    },
    'rotate': {
      initial: { opacity: 0, rotateY: -90 * direction },
      animate: { opacity: 1, rotateY: 0 },
      exit: { opacity: 0, rotateY: 90 * direction },
    },
  };

  return variants[type] || variants['fade'];
}

function getTransition(scene: Scene, isExit: boolean): Transition {
  const duration = isExit ? scene.motion.exitDuration : scene.motion.entryDuration;
  const easing = EASING_MAP[scene.motion.easing];

  if (easing === 'spring') {
    return {
      type: 'spring',
      stiffness: 300,
      damping: 30,
      duration: duration / 1000,
    };
  }

  return {
    duration: duration / 1000,
    ease: easing,
  };
}

export function SceneRenderer({
  currentScene,
  currentScreen,
  previousScene,
  previousScreen,
  sceneProgress,
  isTransitioning,
  transitionProgress: _transitionProgress,
}: SceneRendererProps) {
  // Unused but kept for API compatibility
  void _transitionProgress;

  if (!currentScene || !currentScreen) {
    return null;
  }

  const entryVariants = getAnimationVariants(currentScene.motion.entry, true);
  const exitVariants = getAnimationVariants(currentScene.motion.exit, false);

  return (
    <div className="relative w-full h-full flex items-center justify-center">
      <AnimatePresence mode="sync">
        {/* Previous scene (exiting) */}
        {isTransitioning && previousScene && previousScreen && (
          <motion.div
            key={`prev-${previousScene.id}`}
            className="absolute inset-0 flex items-center justify-center"
            variants={exitVariants}
            initial="animate"
            exit="exit"
            transition={getTransition(previousScene, true)}
          >
            <IsometricScreen
              screen={previousScreen}
              scene={previousScene}
              progress={1}
            />
          </motion.div>
        )}

        {/* Current scene (entering) */}
        <motion.div
          key={`current-${currentScene.id}`}
          className="absolute inset-0 flex items-center justify-center"
          variants={entryVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={getTransition(currentScene, false)}
        >
          <IsometricScreen
            screen={currentScreen}
            scene={currentScene}
            progress={sceneProgress}
          />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// Responsive screen dimensions
const MAX_WIDTH = 700;
const MAX_HEIGHT = 500;

interface IsometricScreenProps {
  screen: Screen;
  scene: Scene;
  progress?: number;
}

function IsometricScreen({ screen, scene }: IsometricScreenProps) {
  const transform = scene.transform;

  // Calculate responsive dimensions
  const dimensions = useMemo(() => {
    const aspectRatio = screen.width / (screen.height || 1);
    let width = Math.min(screen.width, MAX_WIDTH);
    let height = width / aspectRatio;

    if (height > MAX_HEIGHT) {
      height = MAX_HEIGHT;
      width = height * aspectRatio;
    }

    return { width: Math.round(width), height: Math.round(height) };
  }, [screen.width, screen.height]);

  const transformStyle = useMemo(() => `
    rotateX(${transform.rotateX}deg)
    rotateY(${transform.rotateY}deg)
    rotateZ(${transform.rotateZ}deg)
    scale(${transform.scale})
    translate3d(${transform.translateX}px, ${transform.translateY}px, ${transform.translateZ}px)
  `, [transform]);

  return (
    <div
      className="relative flex items-center justify-center"
      style={{
        perspective: `${transform.perspective}px`,
        perspectiveOrigin: 'center center',
        minWidth: dimensions.width + 100,
        minHeight: dimensions.height + 100,
      }}
    >
      {/* Shadow */}
      <motion.div
        className="absolute blur-3xl opacity-25 rounded-xl"
        style={{
          width: dimensions.width,
          height: dimensions.height,
          transformStyle: 'preserve-3d',
          background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.6) 0%, transparent 70%)',
        }}
        animate={{
          transform: `${transformStyle} translateY(20px) translateZ(-60px)`,
        }}
        transition={{ duration: 0.4, ease: [0, 0, 0.2, 1] }}
      />

      {/* Main Screen - Edge to Edge */}
      <motion.div
        className="relative overflow-hidden rounded-lg shadow-2xl"
        style={{
          transformStyle: 'preserve-3d',
          width: dimensions.width,
          height: dimensions.height,
          boxShadow: '0 50px 100px -20px rgba(0,0,0,0.5)',
        }}
        animate={{ transform: transformStyle }}
        transition={{ duration: 0.4, ease: [0, 0, 0.2, 1] }}
      >
        {/* Screen Content - Edge to Edge */}
        {screen.imageUrl ? (
          <img
            src={screen.imageUrl}
            alt="Screenshot"
            className="w-full h-full object-cover object-top"
            draggable={false}
          />
        ) : (
          <div
            className="flex items-center justify-center bg-muted"
            style={{ height: dimensions.height }}
          >
            <span className="text-muted-foreground text-sm">No image</span>
          </div>
        )}

        {/* Subtle vignette */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            boxShadow: 'inset 0 0 80px rgba(0,0,0,0.2)',
          }}
        />
      </motion.div>
    </div>
  );
}
