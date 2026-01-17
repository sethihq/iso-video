'use client';

import { UrlPanel } from './url-panel';
import { Canvas } from './canvas';
import { ControlsPanel } from './controls-panel';

export function EditorLayout() {
  return (
    <div className="flex flex-1 h-full min-h-0 overflow-hidden gap-3">
      {/* Left Panel - URL & Sections */}
      <div className="w-[300px] min-w-[260px] max-w-[400px] shrink-0 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <UrlPanel />
      </div>

      {/* Center - Canvas (takes all remaining space) */}
      <div className="flex-1 min-w-[400px] h-full overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <Canvas />
      </div>

      {/* Right Panel - Controls */}
      <div className="w-[300px] min-w-[260px] max-w-[400px] shrink-0 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <ControlsPanel />
      </div>
    </div>
  );
}
