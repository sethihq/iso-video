'use client';

import {
  Play,
  Pause,
  SkipBack,
  Download,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePlaybackStore } from '@/lib/playback';
import { cn } from '@/lib/utils';

interface TimelineToolbarProps {
  totalDuration: number;
  zoom: number;
  sceneCount: number;
  onZoomChange: (zoom: number) => void;
  onExport?: () => void;
}

const formatTime = (ms: number) => {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

// Re-renders once per second of playback, not every frame
function CurrentTime() {
  const seconds = usePlaybackStore((s) => Math.floor(s.currentTime / 1000));
  return <>{formatTime(seconds * 1000)}</>;
}

export function TimelineToolbar({
  totalDuration,
  zoom,
  sceneCount,
  onZoomChange,
  onExport,
}: TimelineToolbarProps) {
  const isPlaying = usePlaybackStore((s) => s.isPlaying);
  const toggle = usePlaybackStore((s) => s.toggle);
  const stop = usePlaybackStore((s) => s.stop);

  return (
    <div className="flex items-center justify-between h-10 border-b border-border px-3 shrink-0 bg-card">
      {/* Playback controls */}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={stop}
          className="h-8 w-8 p-0"
          aria-label="Go to start"
        >
          <SkipBack className="h-4 w-4" aria-hidden="true" />
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={toggle}
          className={cn('h-8 w-8 p-0', isPlaying && 'text-primary')}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? (
            <Pause className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Play className="h-4 w-4" aria-hidden="true" />
          )}
        </Button>

        <div className="ml-2 text-xs text-muted-foreground font-mono tabular-nums">
          <CurrentTime /> / {formatTime(totalDuration)}
        </div>
      </div>

      {/* Center - scene count */}
      <div className="text-xs text-muted-foreground">
        {sceneCount} scene{sceneCount !== 1 ? 's' : ''}
      </div>

      {/* Zoom and export */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1" role="group" aria-label="Timeline zoom">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onZoomChange(Math.max(0.25, zoom - 0.25))}
            disabled={zoom <= 0.25}
            className="h-8 w-8 p-0"
            aria-label="Zoom out timeline"
          >
            <ZoomOut className="h-4 w-4" aria-hidden="true" />
          </Button>
          <span className="text-xs text-muted-foreground w-12 text-center" aria-live="polite">
            {Math.round(zoom * 100)}%
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onZoomChange(Math.min(4, zoom + 0.25))}
            disabled={zoom >= 4}
            className="h-8 w-8 p-0"
            aria-label="Zoom in timeline"
          >
            <ZoomIn className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>

        <Button
          variant="default"
          size="sm"
          className="h-8 px-3 text-xs gap-1.5"
          onClick={onExport}
          disabled={sceneCount === 0}
        >
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          Export
        </Button>
      </div>
    </div>
  );
}
