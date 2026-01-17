'use client';

import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Screen, Scene, DEFAULT_SECTION_CAMERA } from '@/lib/types';
import { useEditorStore } from '@/lib/store';

interface CinematicRendererProps {
  scenes: Scene[];
  screens: Screen[];
  currentSceneIndex: number;
  sceneProgress: number;
}

export function CinematicRenderer({
  scenes,
  screens,
  currentSceneIndex,
  sceneProgress,
}: CinematicRendererProps) {
  const currentScene = scenes[currentSceneIndex];
  const currentScreen = currentScene
    ? screens.find(s => s.id === currentScene.screenId)
    : null;

  if (!currentScene || !currentScreen) {
    return (
      <div className="flex items-center justify-center w-full h-full text-muted-foreground bg-muted">
        No scene to display
      </div>
    );
  }

  return (
    <div className="absolute inset-0 overflow-hidden bg-background">
      <AnimatePresence mode="popLayout">
        <FullScreenSection
          key={currentScene.id}
          scene={currentScene}
          screen={currentScreen}
          progress={sceneProgress}
        />
      </AnimatePresence>
    </div>
  );
}

interface FullScreenSectionProps {
  scene: Scene;
  screen: Screen;
  progress: number;
}

function FullScreenSection({
  scene,
  screen,
  progress,
}: FullScreenSectionProps) {
  const transform = scene.transform;
  const camera = scene.camera || DEFAULT_SECTION_CAMERA;

  // Calculate scroll position - smooth linear interpolation
  const scrollY = useMemo(() => {
    // How much to scroll (percentage of overflow)
    const scrollRange = 25; // Scroll through 25% of the image

    if (camera.moveDirection === 'bottom-to-top') {
      return scrollRange * (1 - progress);
    } else if (camera.moveDirection === 'none') {
      return scrollRange / 2; // Center
    }
    // Default: top-to-bottom
    return scrollRange * progress;
  }, [progress, camera.moveDirection]);

  const scrollX = useMemo(() => {
    const panRange = 10;
    if (camera.moveDirection === 'left-to-right') {
      return panRange * progress;
    } else if (camera.moveDirection === 'right-to-left') {
      return panRange * (1 - progress);
    }
    return 0;
  }, [progress, camera.moveDirection]);

  // 3D transform for isometric look
  const transform3D = useMemo(() => `
    perspective(${transform.perspective}px)
    rotateX(${transform.rotateX}deg)
    rotateY(${transform.rotateY}deg)
    rotateZ(${transform.rotateZ}deg)
    scale(${transform.scale * 1.2})
  `, [transform]);

  return (
    <motion.div
      className="absolute inset-0"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5, ease: 'easeInOut' }}
    >
      {/* 3D Transform Container */}
      <div
        className="absolute inset-0 flex items-center justify-center"
        style={{
          transform: transform3D,
          transformOrigin: 'center center',
        }}
      >
        {/* Shadow */}
        <div
          className="absolute rounded-2xl"
          style={{
            width: '95%',
            height: '90%',
            background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.6) 0%, transparent 70%)',
            transform: 'translateZ(-80px) translateY(5%)',
            filter: 'blur(40px)',
          }}
        />

        {/* Image Container - Edge to Edge */}
        <div
          className="relative overflow-hidden rounded-lg shadow-2xl"
          style={{
            width: '95%',
            height: '90%',
            boxShadow: '0 50px 100px -20px rgba(0,0,0,0.6)',
          }}
        >
          {/* Scrolling Image */}
          <div
            className="absolute"
            style={{
              width: '100%',
              height: '140%', // Taller to allow scrolling
              top: `-${scrollY}%`,
              left: `-${scrollX}%`,
              transition: 'top 0.05s linear, left 0.05s linear',
            }}
          >
            {screen.imageUrl ? (
              <img
                src={screen.imageUrl}
                alt=""
                className="w-full h-full object-cover"
                style={{ objectPosition: 'top center' }}
                draggable={false}
              />
            ) : (
              <div className="flex items-center justify-center h-full bg-muted">
                <span className="text-muted-foreground">No image</span>
              </div>
            )}
          </div>

          {/* Subtle vignette */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              boxShadow: 'inset 0 0 100px rgba(0,0,0,0.3)',
            }}
          />
        </div>
      </div>
    </motion.div>
  );
}

// Hook to get props from store
export function useCinematicRendererProps() {
  const { project, currentTime } = useEditorStore();
  const { scenes, screens } = project;

  const { currentSceneIndex, sceneProgress } = useMemo(() => {
    let accumulatedTime = 0;
    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const sceneEndTime = accumulatedTime + scene.duration;
      if (currentTime >= accumulatedTime && currentTime < sceneEndTime) {
        return {
          currentSceneIndex: i,
          sceneProgress: (currentTime - accumulatedTime) / scene.duration,
        };
      }
      accumulatedTime += scene.duration;
    }
    if (scenes.length > 0 && currentTime >= accumulatedTime) {
      return { currentSceneIndex: scenes.length - 1, sceneProgress: 1 };
    }
    return { currentSceneIndex: 0, sceneProgress: 0 };
  }, [scenes, currentTime]);

  return {
    scenes,
    screens,
    currentSceneIndex,
    sceneProgress,
  };
}
