'use client';

import { UrlPanel } from './url-panel';
import { Canvas } from './canvas';
import { ControlsPanel } from './controls-panel';

const PANEL = 'squircle min-h-0 overflow-hidden rounded-[22px] bg-card';

export function EditorLayout() {
  return (
    <div className="grid min-h-0 grid-cols-[300px_minmax(0,1fr)_300px] gap-2">
      {/* Left: capture and sections */}
      <section aria-label="Capture" className={PANEL}>
        <UrlPanel />
      </section>

      {/* Center: the preview */}
      <section aria-label="Preview" className={PANEL}>
        <Canvas />
      </section>

      {/* Right: scene controls */}
      <section aria-label="Scene settings" className={PANEL}>
        <ControlsPanel />
      </section>
    </div>
  );
}
