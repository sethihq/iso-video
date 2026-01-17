'use client';

import { useRef, useMemo, useState, useCallback } from 'react';
import {
  ZoomIn,
  ZoomOut,
  Maximize,
  RotateCcw,
  Globe,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useEditorStore, useSelectedScene, useSelectedScreen } from '@/lib/store';
import { usePlayback } from '@/hooks/use-playback';
import { SceneRenderer } from '@/components/preview/scene-renderer';
import { CinematicRenderer, useCinematicRendererProps } from '@/components/preview/cinematic-renderer';
import { IsometricView } from '@/components/preview/isometric-view';

const ZOOM_LEVELS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export function Canvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [useCinematicMode] = useState(true); // Use cinematic edge-to-edge renderer
  const { project, isPlaying } = useEditorStore();
  const selectedScene = useSelectedScene();
  const selectedScreen = useSelectedScreen();
  const { getCurrentScene, transitionState } = usePlayback();
  const cinematicProps = useCinematicRendererProps();

  // Check if we should use cinematic mode
  const shouldUseCinematicMode = useMemo(() => {
    return useCinematicMode && project.scenes.length > 0;
  }, [useCinematicMode, project.scenes.length]);

  // Get current scene data based on playhead position (works when playing OR paused)
  const currentSceneData = useMemo(() => {
    return getCurrentScene();
  }, [getCurrentScene]);

  const handleZoomIn = useCallback(() => {
    setZoom(prev => {
      const currentIndex = ZOOM_LEVELS.findIndex(z => z >= prev);
      const nextIndex = Math.min(currentIndex + 1, ZOOM_LEVELS.length - 1);
      return ZOOM_LEVELS[nextIndex];
    });
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom(prev => {
      const currentIndex = ZOOM_LEVELS.findIndex(z => z >= prev);
      const nextIndex = Math.max(currentIndex - 1, 0);
      return ZOOM_LEVELS[nextIndex];
    });
  }, []);

  const handleResetZoom = useCallback(() => {
    setZoom(1);
  }, []);

  const handleFitToView = useCallback(() => {
    // Auto-fit: set zoom to 0.75 for better fit with 3D transforms
    setZoom(0.75);
  }, []);

  return (
    <div className="relative flex h-full w-full flex-col bg-muted/50">
      {/* Toolbar */}
      <div className="absolute left-4 top-4 z-20 flex items-center gap-1 rounded-lg border border-border bg-card/95 p-1 shadow-lg backdrop-blur-sm">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={handleZoomOut}
          disabled={zoom <= ZOOM_LEVELS[0]}
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
        <button
          onClick={handleResetZoom}
          className="px-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors min-w-[48px]"
        >
          {Math.round(zoom * 100)}%
        </button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={handleZoomIn}
          disabled={zoom >= ZOOM_LEVELS[ZOOM_LEVELS.length - 1]}
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
        <div className="mx-1 h-4 w-px bg-border" />
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={handleFitToView}
          title="Fit to view"
        >
          <Maximize className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={handleResetZoom}
          title="Reset zoom"
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
      </div>

      {/* Playing indicator */}
      {isPlaying && (
        <div className="absolute right-4 top-4 z-20 flex items-center gap-2 rounded-lg border border-green-500/50 bg-green-500/10 px-3 py-1.5 backdrop-blur-sm">
          <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-xs font-medium text-green-500">Playing</span>
        </div>
      )}

      {/* Canvas Area - Full viewport for 3D content */}
      <div
        ref={containerRef}
        className="flex-1 flex items-center justify-center overflow-auto bg-muted/50"
      >
        {/* Cinematic mode - full edge-to-edge (only when playing) */}
        {isPlaying && shouldUseCinematicMode ? (
          <div className="absolute inset-0">
            <CinematicRenderer {...cinematicProps} />
          </div>
        ) : (
          /* Scaled content wrapper for non-cinematic modes and paused state */
          <div
            className="relative flex items-center justify-center"
            style={{
              transform: `scale(${zoom})`,
              transformOrigin: 'center center',
              transition: 'transform 0.2s ease-out',
              // Add padding to prevent edge clipping with 3D transforms
              padding: '80px',
            }}
          >
            {/* Show scene at current playhead position (works when playing OR paused) */}
            {currentSceneData?.scene && currentSceneData?.screen ? (
              <SceneRenderer
                currentScene={currentSceneData.scene}
                currentScreen={currentSceneData.screen}
                previousScene={isPlaying ? transitionState.previousScene : null}
                previousScreen={isPlaying ? transitionState.previousScreen : null}
                sceneProgress={currentSceneData.sceneProgress}
                isTransitioning={isPlaying && transitionState.isTransitioning}
                transitionProgress={transitionState.transitionProgress}
              />
            ) : selectedScene && selectedScreen ? (
              /* Fallback to selected scene if no playhead position */
              <IsometricView
                screen={selectedScreen}
                transform={selectedScene.transform}
                animate={true}
              />
            ) : (
              <EmptyCanvas />
            )}
          </div>
        )}
      </div>

      {/* Info Bar */}
      <div className="absolute bottom-4 left-1/2 z-20 -translate-x-1/2 rounded-lg border border-border bg-card/95 px-4 py-2 shadow-lg backdrop-blur-sm">
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>
            {project.settings.resolution === '720p' && '1280×720'}
            {project.settings.resolution === '1080p' && '1920×1080'}
            {project.settings.resolution === '4k' && '3840×2160'}
          </span>
          <span className="text-border">|</span>
          <span>{project.settings.aspectRatio}</span>
          <span className="text-border">|</span>
          <span>{project.settings.fps} FPS</span>
        </div>
      </div>
    </div>
  );
}

function EmptyCanvas() {
  return (
    <div className="flex flex-col items-center justify-center text-center">
      <div className="rounded-2xl border border-border bg-card p-10">
        {/* Icon */}
        <div className="mx-auto mb-4 w-12 h-12 rounded-xl bg-muted flex items-center justify-center">
          <Globe className="h-6 w-6 text-muted-foreground" />
        </div>

        <h3 className="text-base font-medium text-foreground">Ready to Create</h3>
        <p className="mt-1.5 max-w-[260px] text-sm text-muted-foreground">
          Enter a website URL to capture and create a video
        </p>

        {/* Steps indicator */}
        <div className="flex items-center justify-center gap-2 mt-5 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-primary/10 text-primary font-medium">
            <Globe className="h-3 w-3" />
            <span>URL</span>
          </div>
          <ArrowRight className="h-3 w-3" />
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-muted">
            <span>Sections</span>
          </div>
          <ArrowRight className="h-3 w-3" />
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-muted">
            <Sparkles className="h-3 w-3" />
            <span>Video</span>
          </div>
        </div>
      </div>
    </div>
  );
}
