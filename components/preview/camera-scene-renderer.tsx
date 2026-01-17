'use client';

import { useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Screen, Scene, GlobalCameraSettings, DOFSettings, DEFAULT_GLOBAL_CAMERA, DEFAULT_DOF } from '@/lib/types';
import { useEditorStore } from '@/lib/store';

interface CameraSceneRendererProps {
  scenes: Scene[];
  screens: Screen[];
  currentSceneIndex: number;
  sceneProgress: number; // 0-1 progress through current scene
  globalCamera: GlobalCameraSettings;
  dof: DOFSettings;
}

// Responsive screen dimensions
const MAX_WIDTH = 600;
const MAX_HEIGHT = 400;

// Easing functions for smooth camera movement
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function easeInOutCubic(t: number): number {
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// Calculate blur based on distance from focal plane
function calculateBlur(
  distanceFromFocus: number,
  zSpacing: number,
  aperture: number,
  maxBlur: number,
  enabled: boolean
): number {
  if (!enabled || zSpacing === 0) return 0;
  const normalizedDistance = Math.abs(distanceFromFocus) / zSpacing;
  return Math.min(normalizedDistance * aperture * maxBlur, maxBlur);
}

// Get camera position based on scene progress
interface CameraState {
  targetZ: number;
  targetX: number;
  targetY: number;
  transitionPhase: 'enter' | 'hold' | 'exit';
}

function getCameraState(
  scenes: Scene[],
  currentIndex: number,
  progress: number,
  globalCamera: GlobalCameraSettings
): CameraState {
  if (scenes.length === 0 || currentIndex < 0) {
    return { targetZ: 0, targetX: 0, targetY: 0, transitionPhase: 'hold' };
  }

  const currentScene = scenes[currentIndex];
  const currentZ = currentScene.zDepth ?? -currentIndex * globalCamera.zSpacing;
  const camera = currentScene.camera;

  // Determine transition phase
  let transitionPhase: 'enter' | 'hold' | 'exit';
  if (progress < 0.2) {
    transitionPhase = 'enter';
  } else if (progress > 0.8) {
    transitionPhase = 'exit';
  } else {
    transitionPhase = 'hold';
  }

  // Calculate camera offset based on camera settings
  let offsetX = 0;
  let offsetY = 0;

  if (camera) {
    // Apply camera movement offsets
    if (transitionPhase === 'enter') {
      // Ease in the offset
      const enterProgress = easeOutCubic(progress / 0.2);
      offsetX = camera.moveOffsetX * enterProgress;
      offsetY = camera.moveOffsetY * enterProgress;
    } else if (transitionPhase === 'exit') {
      // Start easing toward next section's position
      const exitProgress = easeInOutCubic((progress - 0.8) / 0.2);
      const nextScene = scenes[currentIndex + 1];
      const nextCamera = nextScene?.camera;
      const nextOffsetX = nextCamera?.moveOffsetX ?? 0;
      const nextOffsetY = nextCamera?.moveOffsetY ?? 0;
      offsetX = camera.moveOffsetX + (nextOffsetX - camera.moveOffsetX) * exitProgress;
      offsetY = camera.moveOffsetY + (nextOffsetY - camera.moveOffsetY) * exitProgress;
    } else {
      offsetX = camera.moveOffsetX;
      offsetY = camera.moveOffsetY;
    }
  }

  return {
    targetZ: currentZ,
    targetX: offsetX,
    targetY: offsetY,
    transitionPhase,
  };
}

export function CameraSceneRenderer({
  scenes,
  screens,
  currentSceneIndex,
  sceneProgress,
  globalCamera,
  dof,
}: CameraSceneRendererProps) {
  // Get camera state
  const cameraState = useMemo(
    () => getCameraState(scenes, currentSceneIndex, sceneProgress, globalCamera),
    [scenes, currentSceneIndex, sceneProgress, globalCamera]
  );

  // Only render visible layers (current ± 2) for performance
  const visibleSceneIndices = useMemo(() => {
    const indices: number[] = [];
    for (let i = Math.max(0, currentSceneIndex - 2); i <= Math.min(scenes.length - 1, currentSceneIndex + 2); i++) {
      indices.push(i);
    }
    return indices;
  }, [currentSceneIndex, scenes.length]);

  // Get screen for a scene
  const getScreenForScene = useCallback(
    (scene: Scene) => screens.find((s) => s.id === scene.screenId),
    [screens]
  );

  // Camera container transform - rotates the entire 3D space
  const cameraContainerStyle = useMemo(() => ({
    perspective: `${globalCamera.perspective}px`,
    perspectiveOrigin: 'center center',
  }), [globalCamera.perspective]);

  // Camera position - translates through 3D space to focus on current section
  const cameraTransform = useMemo(() => {
    const { targetZ, targetX, targetY } = cameraState;
    // Camera moves to the section's Z position (plus offset for viewing angle)
    // We translate the entire layer stack so the current section is at Z=0
    return `
      rotateX(${globalCamera.rotateX}deg)
      rotateY(${globalCamera.rotateY}deg)
      translate3d(${-targetX}px, ${-targetY}px, ${-targetZ}px)
    `;
  }, [cameraState, globalCamera.rotateX, globalCamera.rotateY]);

  if (scenes.length === 0) {
    return (
      <div className="flex items-center justify-center w-full h-full text-muted-foreground">
        No scenes to display
      </div>
    );
  }

  // For single scene, just render it directly without complex 3D
  if (scenes.length === 1) {
    const scene = scenes[0];
    const screen = getScreenForScene(scene);
    if (!screen) {
      return (
        <div className="flex items-center justify-center w-full h-full text-muted-foreground">
          No screen found
        </div>
      );
    }
    return (
      <div className="relative w-full h-full flex items-center justify-center">
        <SectionLayer
          scene={scene}
          screen={screen}
          zPosition={0}
          blur={0}
          opacity={1}
          isFocused={true}
          useAbsolute={false}
        />
      </div>
    );
  }

  return (
    <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
      {/* Camera Container - applies perspective */}
      <div
        className="relative flex items-center justify-center"
        style={{
          ...cameraContainerStyle,
          width: '100%',
          height: '100%',
        }}
      >
        {/* Layer Stack - preserves 3D for all children */}
        <motion.div
          className="relative flex items-center justify-center"
          style={{
            transformStyle: 'preserve-3d',
            width: '100%',
            height: '100%',
          }}
          animate={{
            transform: cameraTransform,
          }}
          transition={{
            duration: 0.6,
            ease: [0.4, 0, 0.2, 1],
          }}
        >
          {/* Render each visible section as a 3D layer */}
          {visibleSceneIndices.map((index) => {
            const scene = scenes[index];
            const screen = getScreenForScene(scene);
            if (!screen) return null;

            const sceneZ = scene.zDepth ?? -index * globalCamera.zSpacing;
            const distanceFromFocus = sceneZ - cameraState.targetZ;
            const blur = calculateBlur(
              distanceFromFocus,
              globalCamera.zSpacing,
              dof.aperture,
              dof.maxBlur,
              dof.enabled
            );

            // Opacity based on distance (further = more transparent)
            const normalizedDistance = Math.abs(distanceFromFocus) / (globalCamera.zSpacing * 2);
            const opacity = Math.max(0.4, 1 - normalizedDistance * 0.3);

            return (
              <SectionLayer
                key={scene.id}
                scene={scene}
                screen={screen}
                zPosition={sceneZ}
                blur={blur}
                opacity={opacity}
                isFocused={index === currentSceneIndex}
                useAbsolute={true}
              />
            );
          })}
        </motion.div>
      </div>
    </div>
  );
}

interface SectionLayerProps {
  scene: Scene;
  screen: Screen;
  zPosition: number;
  blur: number;
  opacity: number;
  isFocused: boolean;
  useAbsolute?: boolean;
}

function SectionLayer({
  scene,
  screen,
  zPosition,
  blur,
  opacity,
  isFocused,
  useAbsolute = true,
}: SectionLayerProps) {
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

  const transform = scene.transform;

  // Layer transform: position in 3D space + isometric transform
  const layerTransform = useMemo(() => `
    translateZ(${zPosition}px)
    rotateX(${transform.rotateX}deg)
    rotateY(${transform.rotateY}deg)
    rotateZ(${transform.rotateZ}deg)
    scale(${transform.scale})
    translate3d(${transform.translateX}px, ${transform.translateY}px, 0px)
  `, [zPosition, transform]);

  return (
    <motion.div
      className={useAbsolute ? "absolute" : "relative"}
      style={{
        transformStyle: 'preserve-3d',
        willChange: 'filter, opacity',
      }}
      animate={{
        transform: layerTransform,
        filter: `blur(${blur}px)`,
        opacity,
      }}
      transition={{
        duration: 0.5,
        ease: [0.4, 0, 0.2, 1],
      }}
    >
      {/* Shadow - behind the screen */}
      <div
        className="absolute blur-3xl rounded-xl"
        style={{
          width: dimensions.width,
          height: dimensions.height + 32,
          transform: 'translateY(20px) translateZ(-60px)',
          transformStyle: 'preserve-3d',
          background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.5) 0%, transparent 70%)',
          opacity: isFocused ? 0.3 : 0.15,
        }}
      />

      {/* Main Screen */}
      <div
        className="relative overflow-hidden rounded-xl shadow-2xl ring-1 ring-black/10"
        style={{
          width: dimensions.width,
          transformStyle: 'preserve-3d',
        }}
      >
        {/* Browser Chrome */}
        <div className="flex h-8 items-center gap-2 bg-neutral-800 px-3 shrink-0">
          <div className="flex gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
            <div className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
            <div className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
          </div>
          <div className="flex-1 mx-3">
            <div className="h-5 rounded-md bg-neutral-700/80 px-3 flex items-center">
              <span className="text-[10px] text-neutral-400 truncate font-medium">
                {screen.url || 'Preview'}
              </span>
            </div>
          </div>
        </div>

        {/* Screen Content */}
        <div
          className="overflow-hidden bg-white"
          style={{
            width: dimensions.width,
            height: dimensions.height,
          }}
        >
          {screen.imageUrl ? (
            <img
              src={screen.imageUrl}
              alt="Screenshot"
              className="w-full h-full object-cover object-top"
              draggable={false}
            />
          ) : (
            <div
              className="flex items-center justify-center bg-neutral-100"
              style={{ height: dimensions.height }}
            >
              <span className="text-neutral-400 text-sm">No image</span>
            </div>
          )}
        </div>

        {/* Screen Reflection/Gloss */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'linear-gradient(135deg, rgba(255,255,255,0.12) 0%, transparent 40%)',
          }}
        />

        {/* Focus indicator - subtle glow when in focus */}
        {isFocused && (
          <motion.div
            className="absolute inset-0 pointer-events-none rounded-xl"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              boxShadow: '0 0 30px 10px rgba(59, 130, 246, 0.15)',
            }}
          />
        )}
      </div>
    </motion.div>
  );
}

// Hook to get camera renderer props from store
export function useCameraRendererProps() {
  const { project, currentTime } = useEditorStore();
  const { scenes, screens, settings } = project;

  // Calculate current scene index based on time
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
    // Default to last scene if at end
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
    globalCamera: settings.globalCamera || DEFAULT_GLOBAL_CAMERA,
    dof: settings.dof || DEFAULT_DOF,
  };
}
