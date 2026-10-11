'use client';

import { Box, Download } from 'lucide-react';
import { useEditorStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { PRIMARY_SHADOW } from './ui';

const RESOLUTION_LABELS: Record<string, string> = {
  '720p': '1280×720',
  '1080p': '1920×1080',
  '4k': '3840×2160',
};

export function Header() {
  const settings = useEditorStore((s) => s.project.settings);
  const hasScenes = useEditorStore((s) => s.project.scenes.length > 0);
  const setExportOpen = useEditorStore((s) => s.setExportOpen);

  return (
    <header className="grid h-14 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 px-1">
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          className="squircle grid size-8 shrink-0 place-items-center rounded-[10px] bg-foreground text-white"
          aria-hidden="true"
        >
          <Box className="size-4" strokeWidth={2.25} />
        </span>
        <span className="truncate text-[14px] font-semibold">ISO Video</span>
      </div>

      {/* The output the preview is framed for */}
      <div
        className="squircle flex h-8 items-center gap-2 rounded-full bg-well px-3 text-[12px] font-medium tabular-nums text-muted-foreground"
        aria-label="Output format"
      >
        <span>{RESOLUTION_LABELS[settings.resolution] ?? RESOLUTION_LABELS['1080p']}</span>
        <span className="size-1 rounded-full bg-faint" aria-hidden="true" />
        <span>{settings.aspectRatio}</span>
        <span className="size-1 rounded-full bg-faint" aria-hidden="true" />
        <span>{settings.fps} fps</span>
      </div>

      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={() => setExportOpen(true)}
          disabled={!hasScenes}
          data-tip="Export (E)"
          className={cn(
            'tip squircle relative flex h-9 items-center gap-2 rounded-full bg-primary px-4 text-[13px] font-medium text-primary-foreground transition-[background-color,scale] duration-100 hover:bg-primary-press active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40',
            PRIMARY_SHADOW
          )}
        >
          <Download className="size-4" strokeWidth={2.25} aria-hidden="true" />
          Export
        </button>
      </div>
    </header>
  );
}
