'use client';

import { Minus, Pause, Play, Plus, SkipBack } from 'lucide-react';
import { usePlaybackStore } from '@/lib/playback';
import { IconButton } from '../ui';

interface TimelineToolbarProps {
  totalDuration: number;
  zoom: number;
  sceneCount: number;
  onZoomChange: (zoom: number) => void;
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
}: TimelineToolbarProps) {
  const isPlaying = usePlaybackStore((s) => s.isPlaying);
  const toggle = usePlaybackStore((s) => s.toggle);
  const stop = usePlaybackStore((s) => s.stop);

  return (
    <div className="grid h-12 shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 px-2.5">
      {/* Playback controls */}
      <div className="flex min-w-0 items-center gap-1.5">
        <IconButton
          tone="accent"
          size="lg"
          onClick={toggle}
          label={isPlaying ? 'Pause' : 'Play'}
          shortcut="Space"
          tipSide="top"
        >
          {isPlaying ? (
            <Pause className="size-4" fill="currentColor" strokeWidth={0} aria-hidden="true" />
          ) : (
            <Play className="size-4 translate-x-px" fill="currentColor" strokeWidth={0} aria-hidden="true" />
          )}
        </IconButton>
        <IconButton label="Go to start" shortcut="Home" tipSide="top" onClick={stop}>
          <SkipBack className="size-4" fill="currentColor" strokeWidth={1.5} aria-hidden="true" />
        </IconButton>
        <div className="ml-1 text-[12px] font-medium tabular-nums">
          <CurrentTime />
          <span className="text-faint"> / {formatTime(totalDuration)}</span>
        </div>
      </div>

      <div className="text-[12px] text-faint">
        {sceneCount} scene{sceneCount !== 1 ? 's' : ''}
      </div>

      {/* Timeline zoom */}
      <div className="flex justify-end">
        <div className="squircle flex h-8 items-center rounded-full bg-well px-0.5" role="group" aria-label="Timeline zoom">
          <IconButton
            label="Zoom out timeline"
            size="sm"
            tipSide="top"
            onClick={() => onZoomChange(Math.max(0.25, zoom - 0.25))}
            disabled={zoom <= 0.25}
          >
            <Minus className="size-3.5" strokeWidth={2.5} aria-hidden="true" />
          </IconButton>
          <span className="min-w-11 text-center text-[12px] font-medium tabular-nums" aria-live="polite">
            {Math.round(zoom * 100)}%
          </span>
          <IconButton
            label="Zoom in timeline"
            size="sm"
            tipSide="top"
            onClick={() => onZoomChange(Math.min(4, zoom + 0.25))}
            disabled={zoom >= 4}
          >
            <Plus className="size-3.5" strokeWidth={2.5} aria-hidden="true" />
          </IconButton>
        </div>
      </div>
    </div>
  );
}
