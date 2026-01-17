'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useEditorStore, useTotalDuration } from '@/lib/store';
import { Scene, Screen, Project, DEFAULT_SECTION_CAMERA, DEFAULT_GLOBAL_CAMERA } from '@/lib/types';

interface SceneData {
  scene: Scene;
  screen: Screen | undefined;
  sceneProgress: number;
  sceneTime: number;
  sceneStartTime: number;
}

interface TransitionState {
  isTransitioning: boolean;
  transitionProgress: number;
  previousScene: Scene | null;
  previousScreen: Screen | null;
}

export type TransitionPhase = 'enter' | 'hold' | 'exit';

export interface CameraState {
  currentSceneIndex: number;
  sceneProgress: number;
  transitionPhase: TransitionPhase;
  targetZ: number;
  targetX: number;
  targetY: number;
}

export function usePlayback() {
  const { isPlaying, currentTime, seek, pause, project } = useEditorStore();
  const totalDuration = useTotalDuration();

  const animationRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const currentTimeRef = useRef(currentTime);
  const totalDurationRef = useRef(totalDuration);
  const previousSceneIdRef = useRef<string | null>(null);
  const isPlayingRef = useRef(isPlaying);
  const projectRef = useRef<Project>(project);
  const seekRef = useRef(seek);
  const pauseRef = useRef(pause);

  const [transitionState, setTransitionState] = useState<TransitionState>({
    isTransitioning: false,
    transitionProgress: 0,
    previousScene: null,
    previousScreen: null,
  });

  // Keep refs in sync with latest values
  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  useEffect(() => {
    totalDurationRef.current = totalDuration;
  }, [totalDuration]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  useEffect(() => {
    seekRef.current = seek;
    pauseRef.current = pause;
  }, [seek, pause]);

  // Get scene at specific time
  const getSceneAtTime = useCallback((time: number): SceneData | null => {
    let accumulatedTime = 0;
    for (const scene of project.scenes) {
      const sceneEndTime = accumulatedTime + scene.duration;
      if (time >= accumulatedTime && time < sceneEndTime) {
        const screen = project.screens.find((s) => s.id === scene.screenId);
        return {
          scene,
          screen,
          sceneProgress: (time - accumulatedTime) / scene.duration,
          sceneTime: time - accumulatedTime,
          sceneStartTime: accumulatedTime,
        };
      }
      accumulatedTime += scene.duration;
    }
    // Return last scene if at the very end
    if (project.scenes.length > 0 && time >= accumulatedTime) {
      const lastScene = project.scenes[project.scenes.length - 1];
      const screen = project.screens.find((s) => s.id === lastScene.screenId);
      return {
        scene: lastScene,
        screen,
        sceneProgress: 1,
        sceneTime: lastScene.duration,
        sceneStartTime: accumulatedTime - lastScene.duration,
      };
    }
    // Return first scene as fallback
    if (project.scenes.length > 0) {
      const firstScene = project.scenes[0];
      const screen = project.screens.find((s) => s.id === firstScene.screenId);
      return {
        scene: firstScene,
        screen,
        sceneProgress: 0,
        sceneTime: 0,
        sceneStartTime: 0,
      };
    }
    return null;
  }, [project.scenes, project.screens]);

  // Get current scene based on time
  const getCurrentScene = useCallback((): SceneData | null => {
    return getSceneAtTime(currentTime);
  }, [currentTime, getSceneAtTime]);

  // Detect scene changes and manage transitions
  useEffect(() => {
    const current = getCurrentScene();
    if (!current) {
      previousSceneIdRef.current = null;
      return;
    }

    const currentSceneId = current.scene.id;
    const prevSceneId = previousSceneIdRef.current;

    if (prevSceneId && prevSceneId !== currentSceneId) {
      // Scene changed - find previous scene data
      const prevScene = project.scenes.find(s => s.id === prevSceneId);
      const prevScreen = prevScene
        ? project.screens.find(s => s.id === prevScene.screenId)
        : undefined;

      if (prevScene) {
        // Start transition
        setTransitionState({
          isTransitioning: true,
          transitionProgress: 0,
          previousScene: prevScene,
          previousScreen: prevScreen || null,
        });

        // End transition after animation
        const transitionDuration = Math.max(
          current.scene.motion.entryDuration,
          prevScene.motion.exitDuration
        );

        setTimeout(() => {
          setTransitionState({
            isTransitioning: false,
            transitionProgress: 1,
            previousScene: null,
            previousScreen: null,
          });
        }, transitionDuration);
      }
    }

    previousSceneIdRef.current = currentSceneId;
  }, [getCurrentScene, project.scenes, project.screens]);

  // Animation loop - uses refs to avoid stale closures and unnecessary re-renders
  useEffect(() => {
    // Only check isPlaying to start/stop - use refs for everything else
    if (!isPlaying) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      lastTimeRef.current = 0;
      return;
    }

    // Check if we have scenes to play
    if (projectRef.current.scenes.length === 0) {
      return;
    }

    const animate = (timestamp: number) => {
      // Check if still playing (using ref for latest value)
      if (!isPlayingRef.current) {
        lastTimeRef.current = 0;
        return;
      }

      // Check if scenes still exist
      if (projectRef.current.scenes.length === 0) {
        pauseRef.current();
        lastTimeRef.current = 0;
        return;
      }

      if (lastTimeRef.current === 0) {
        lastTimeRef.current = timestamp;
      }

      const delta = timestamp - lastTimeRef.current;
      lastTimeRef.current = timestamp;

      // Use refs for latest values
      const newTime = currentTimeRef.current + delta;
      const duration = totalDurationRef.current;

      // Check if we've reached the end
      if (duration > 0 && newTime >= duration) {
        seekRef.current(0);
        pauseRef.current();
        lastTimeRef.current = 0;
        previousSceneIdRef.current = null;
        return;
      }

      // Continue playback
      seekRef.current(newTime);
      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      // Reset transition state when animation stops
      setTransitionState({
        isTransitioning: false,
        transitionProgress: 0,
        previousScene: null,
        previousScreen: null,
      });
    };
  }, [isPlaying]); // Only depend on isPlaying - use refs for everything else

  // Calculate camera state for the current playback position
  const getCameraState = useCallback((): CameraState | null => {
    const currentSceneData = getCurrentScene();
    if (!currentSceneData) return null;

    const { scene, sceneProgress } = currentSceneData;
    const globalCamera = project.settings.globalCamera || DEFAULT_GLOBAL_CAMERA;

    // Find scene index
    const sceneIndex = project.scenes.findIndex(s => s.id === scene.id);
    if (sceneIndex < 0) return null;

    // Determine transition phase
    let transitionPhase: TransitionPhase;
    if (sceneProgress < 0.2) {
      transitionPhase = 'enter';
    } else if (sceneProgress > 0.8) {
      transitionPhase = 'exit';
    } else {
      transitionPhase = 'hold';
    }

    // Calculate Z position
    const targetZ = scene.zDepth ?? -sceneIndex * globalCamera.zSpacing;

    // Calculate X/Y offsets based on camera settings
    const camera = scene.camera || DEFAULT_SECTION_CAMERA;
    let targetX = camera.moveOffsetX;
    let targetY = camera.moveOffsetY;

    // Interpolate offsets during transitions
    if (transitionPhase === 'enter') {
      const enterProgress = sceneProgress / 0.2;
      targetX *= enterProgress;
      targetY *= enterProgress;
    } else if (transitionPhase === 'exit') {
      const nextScene = project.scenes[sceneIndex + 1];
      if (nextScene) {
        const nextCamera = nextScene.camera || DEFAULT_SECTION_CAMERA;
        const exitProgress = (sceneProgress - 0.8) / 0.2;
        targetX = camera.moveOffsetX + (nextCamera.moveOffsetX - camera.moveOffsetX) * exitProgress;
        targetY = camera.moveOffsetY + (nextCamera.moveOffsetY - camera.moveOffsetY) * exitProgress;
      }
    }

    return {
      currentSceneIndex: sceneIndex,
      sceneProgress,
      transitionPhase,
      targetZ,
      targetX,
      targetY,
    };
  }, [getCurrentScene, project.scenes, project.settings.globalCamera]);

  return {
    isPlaying,
    currentTime,
    totalDuration,
    getCurrentScene,
    getSceneAtTime,
    transitionState,
    getCameraState,
  };
}
