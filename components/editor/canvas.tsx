'use client';

import { useState, useCallback } from 'react';
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
import { useEditorStore } from '@/lib/store';
import { usePlaybackStore } from '@/lib/playback';
import { PreviewCanvas } from '@/components/preview/preview-canvas';

const ZOOM_LEVELS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export function Canvas() {
  const [zoom, setZoom] = useState(1);
  const hasScenes = useEditorStore((s) => s.project.scenes.length > 0);
  const isPlaying = usePlaybackStore((s) => s.isPlaying);

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
    // Zoom 1 fits the whole frame inside the canvas area
    setZoom(1);
  }, []);

  return (
    <div className="relative flex h-full w-full flex-col bg-muted/50 select-none">
      {/* Toolbar */}
      <div className="absolute left-4 top-4 z-20 flex items-center gap-1 rounded-lg border border-border bg-card/95 p-1 shadow-lg backdrop-blur-sm">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={handleZoomOut}
          disabled={zoom <= ZOOM_LEVELS[0]}
          aria-label="Zoom out"
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
        <button
          onClick={handleResetZoom}
          className="px-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors min-w-[48px]"
          aria-label={`Current zoom ${Math.round(zoom * 100)}%, click to reset`}
        >
          {Math.round(zoom * 100)}%
        </button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={handleZoomIn}
          disabled={zoom >= ZOOM_LEVELS[ZOOM_LEVELS.length - 1]}
          aria-label="Zoom in"
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
        <div className="mx-1 h-4 w-px bg-border" aria-hidden="true" />
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={handleFitToView}
          aria-label="Fit to view"
        >
          <Maximize className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={handleResetZoom}
          aria-label="Reset zoom"
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

      {/* Canvas Area: the exact frame that exports, at the export aspect ratio */}
      <div className="relative flex-1 flex items-center justify-center overflow-hidden bg-muted/50">
        {hasScenes ? (
          <div className="absolute inset-x-6 top-16 bottom-6">
            <PreviewCanvas zoom={zoom} />
          </div>
        ) : (
          <EmptyCanvas />
        )}
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
