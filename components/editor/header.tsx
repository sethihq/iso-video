'use client';

import { Film } from 'lucide-react';
import { ThemeSwitcher } from '@/components/theme-switcher';
import { useEditorStore } from '@/lib/store';

export function Header() {
  const { project } = useEditorStore();

  const getResolutionLabel = () => {
    switch (project.settings.resolution) {
      case '720p': return '1280×720';
      case '1080p': return '1920×1080';
      case '4k': return '3840×2160';
      default: return '1920×1080';
    }
  };

  return (
    <header className="flex h-11 items-center justify-between rounded-xl border border-border bg-card px-4 shadow-sm">
      <div className="flex items-center gap-2">
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary">
          <Film className="h-3.5 w-3.5 text-primary-foreground" />
        </div>
        <span className="text-sm font-semibold text-foreground">ISO Video</span>
      </div>

      {/* Resolution Info */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>{getResolutionLabel()}</span>
        <span className="text-border">|</span>
        <span>{project.settings.aspectRatio}</span>
        <span className="text-border">|</span>
        <span>{project.settings.fps} FPS</span>
      </div>

      <div className="flex items-center gap-3">
        <ThemeSwitcher />
      </div>
    </header>
  );
}
