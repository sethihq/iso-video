'use client';

import { useState } from 'react';
import { ArrowRight, Globe, Minus, Plus, Sparkles } from 'lucide-react';
import { useEditorStore } from '@/lib/store';
import { usePlaybackStore } from '@/lib/playback';
import { PreviewCanvas } from '@/components/preview/preview-canvas';
import { IconButton } from './ui';

const ZOOM_LEVELS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export function Canvas() {
  const [zoom, setZoom] = useState(1);
  const hasScenes = useEditorStore((s) => s.project.scenes.length > 0);
  const isPlaying = usePlaybackStore((s) => s.isPlaying);

  const stepZoom = (direction: 1 | -1) => {
    setZoom((prev) => {
      const index = ZOOM_LEVELS.findIndex((z) => z >= prev);
      const next = Math.min(Math.max(index + direction, 0), ZOOM_LEVELS.length - 1);
      return ZOOM_LEVELS[next];
    });
  };

  return (
    <div className="relative flex h-full w-full flex-col select-none">
      {hasScenes && (
        // Zoom 1 fits the whole frame inside the canvas area
        <div
          className="squircle absolute left-3 top-3 z-20 flex h-8 items-center rounded-full bg-well px-0.5"
          role="group"
          aria-label="Preview zoom"
        >
          <IconButton label="Zoom out" size="sm" onClick={() => stepZoom(-1)} disabled={zoom <= ZOOM_LEVELS[0]}>
            <Minus className="size-3.5" strokeWidth={2.5} />
          </IconButton>
          <button
            type="button"
            onClick={() => setZoom(1)}
            data-tip="Zoom to fit"
            aria-label={`Zoom ${Math.round(zoom * 100)}%, zoom to fit`}
            className="tip relative h-7 min-w-12 rounded-full px-1 text-[12px] font-medium tabular-nums transition-colors duration-100 hover:bg-black/5"
          >
            {zoom === 1 ? 'Fit' : `${Math.round(zoom * 100)}%`}
          </button>
          <IconButton
            label="Zoom in"
            size="sm"
            onClick={() => stepZoom(1)}
            disabled={zoom >= ZOOM_LEVELS[ZOOM_LEVELS.length - 1]}
          >
            <Plus className="size-3.5" strokeWidth={2.5} />
          </IconButton>
        </div>
      )}

      {isPlaying && (
        <div
          role="status"
          className="absolute right-3 top-3 z-20 flex h-8 items-center gap-2 rounded-full bg-white px-3 text-[12px] font-medium shadow-[0_0_0_1px_rgba(0,0,0,0.05),0_6px_16px_-8px_rgba(0,0,0,0.2)]"
        >
          <span className="size-1.5 animate-pulse rounded-full bg-primary" aria-hidden="true" />
          Playing
        </div>
      )}

      {/* Canvas Area: the exact frame that exports, at the export aspect ratio */}
      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        {hasScenes ? (
          <div className="absolute inset-x-6 top-14 bottom-6">
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
    <div className="flex max-w-[320px] flex-col items-center px-6 text-center">
      <span className="squircle mb-4 grid size-12 place-items-center rounded-[16px] bg-white text-muted-foreground shadow-[0_0_0_1px_rgba(0,0,0,0.05),0_8px_20px_-10px_rgba(0,0,0,0.25)]">
        <Globe className="size-5" />
      </span>
      <h3 className="text-[15px] font-semibold">Ready to create</h3>
      <p className="mt-1 text-[13px] text-muted-foreground">Enter a website URL to capture and create a video</p>

      <ol className="mt-5 flex items-center gap-1.5 text-[12px] font-medium" aria-label="Steps">
        <li className="squircle flex h-7 items-center gap-1.5 rounded-full bg-primary-soft px-2.5 text-primary-foreground">
          <Globe className="size-3.5" aria-hidden="true" />
          URL
        </li>
        <li aria-hidden="true" className="text-faint">
          <ArrowRight className="size-3.5" />
        </li>
        <li className="squircle flex h-7 items-center rounded-full bg-well px-2.5 text-muted-foreground">Sections</li>
        <li aria-hidden="true" className="text-faint">
          <ArrowRight className="size-3.5" />
        </li>
        <li className="squircle flex h-7 items-center gap-1.5 rounded-full bg-well px-2.5 text-muted-foreground">
          <Sparkles className="size-3.5" aria-hidden="true" />
          Video
        </li>
      </ol>
    </div>
  );
}
