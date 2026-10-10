'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useEditorStore } from '@/lib/store';
import { isPlaybackTick, usePlaybackStore } from '@/lib/playback';
import { Compositor } from '@/lib/render/compositor';
import { aspectRatioValue, buildFrame } from '@/lib/render/frame';
import { loadBitmap, peekBitmap, releaseBitmaps, type BitmapLimits } from '@/lib/render/images';

// The preview never needs more than this many texture pixels across
const PREVIEW_MAX_WIDTH = 2048;
const MAX_PIXEL_RATIO = 2;

let webgl2Support: boolean | null = null;
const checkWebGL2 = () => {
  if (webgl2Support === null) {
    const probe = document.createElement('canvas').getContext('webgl2');
    webgl2Support = !!probe;
    // Release the probe's context right away; browsers cap live contexts
    probe?.getExtension('WEBGL_lose_context')?.loseContext();
  }
  return webgl2Support;
};
const subscribeNever = () => () => {};

interface PreviewCanvasProps {
  zoom?: number;
}

/**
 * Draws the video exactly as it will export: same frame builder, same WebGL
 * renderer, framed at the export aspect ratio. Draws happen outside React,
 * driven by store subscriptions, so playback never re-renders the editor.
 */
export function PreviewCanvas({ zoom = 1 }: PreviewCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const zoomRef = useRef(zoom);
  const resizeRef = useRef<(() => void) | null>(null);
  // Assumed on the server, checked once in the browser
  const hasWebGL2 = useSyncExternalStore(subscribeNever, checkWebGL2, () => true);

  useEffect(() => {
    zoomRef.current = zoom;
    resizeRef.current?.();
  }, [zoom]);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    let compositor: Compositor;
    try {
      compositor = new Compositor(canvas, { onContextRestored: () => requestDraw() });
    } catch (error) {
      console.error('Preview renderer failed to start', error);
      return;
    }

    let frameRequest: number | null = null;
    let disposed = false;
    const limits = (): BitmapLimits => ({
      maxWidth: PREVIEW_MAX_WIDTH,
      maxTexture: compositor.maxTextureSize,
    });

    const upload = (url: string, bitmap: ImageBitmap) => {
      if (!disposed && !compositor.hasTexture(url)) compositor.setTexture(url, bitmap);
    };

    const preload = () => {
      const { screens } = useEditorStore.getState().project;
      const currentLimits = limits();
      for (const screen of screens) {
        if (!screen.imageUrl || compositor.hasTexture(screen.imageUrl)) continue;
        loadBitmap(screen.imageUrl, currentLimits).then(
          (bitmap) => {
            upload(screen.imageUrl, bitmap);
            requestDraw();
          },
          () => {},
        );
      }
    };

    const draw = () => {
      frameRequest = null;
      if (disposed) return;
      const project = useEditorStore.getState().project;
      const frame = buildFrame(project, usePlaybackStore.getState().currentTime);
      const currentLimits = limits();
      for (const layer of frame.layers) {
        if (compositor.hasTexture(layer.imageKey)) continue;
        const bitmap = peekBitmap(layer.imageKey, currentLimits);
        if (bitmap) upload(layer.imageKey, bitmap);
      }
      compositor.render(frame);
    };

    const requestDraw = () => {
      if (disposed) return;
      // During playback, draw in the same animation frame the clock ticked in
      if (isPlaybackTick()) {
        if (frameRequest !== null) cancelAnimationFrame(frameRequest);
        draw();
        return;
      }
      if (frameRequest === null) frameRequest = requestAnimationFrame(draw);
    };

    // Largest box with the video's aspect ratio, then the toolbar zoom
    const resize = () => {
      const bounds = container.getBoundingClientRect();
      if (bounds.width === 0 || bounds.height === 0) return;
      const aspect = aspectRatioValue(useEditorStore.getState().project.settings.aspectRatio);
      let width = bounds.width;
      let height = width / aspect;
      if (height > bounds.height) {
        height = bounds.height;
        width = height * aspect;
      }
      width *= zoomRef.current;
      height *= zoomRef.current;

      const pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
      canvas.style.width = `${Math.round(width)}px`;
      canvas.style.height = `${Math.round(height)}px`;
      canvas.width = Math.max(1, Math.round(width * pixelRatio));
      canvas.height = Math.max(1, Math.round(height * pixelRatio));
      // Resizing clears the canvas, so redraw right away
      draw();
    };
    resizeRef.current = resize;

    const observer = new ResizeObserver(resize);
    observer.observe(container);

    // Moving the window to a display with another pixel ratio needs a sharper (or lighter) canvas
    let pixelRatioQuery: MediaQueryList | null = null;
    const watchPixelRatio = () => {
      pixelRatioQuery?.removeEventListener('change', onPixelRatioChange);
      pixelRatioQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      pixelRatioQuery.addEventListener('change', onPixelRatioChange);
    };
    const onPixelRatioChange = () => {
      resize();
      watchPixelRatio();
    };
    watchPixelRatio();

    const unsubscribePlayback = usePlaybackStore.subscribe((state, prev) => {
      if (state.currentTime !== prev.currentTime) requestDraw();
    });

    const unsubscribeEditor = useEditorStore.subscribe((state, prev) => {
      if (state.project === prev.project) return;
      if (state.project.screens !== prev.project.screens) {
        const urls = new Set(state.project.screens.map((s) => s.imageUrl));
        compositor.retainTextures(urls);
        releaseBitmaps(urls);
        preload();
      }
      if (state.project.settings.aspectRatio !== prev.project.settings.aspectRatio) resize();
      else requestDraw();
    });

    preload();
    resize();

    return () => {
      disposed = true;
      resizeRef.current = null;
      observer.disconnect();
      pixelRatioQuery?.removeEventListener('change', onPixelRatioChange);
      unsubscribePlayback();
      unsubscribeEditor();
      if (frameRequest !== null) cancelAnimationFrame(frameRequest);
      compositor.dispose();
    };
  }, []);

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-auto">
      <div className="flex min-h-full min-w-full items-center justify-center">
        {!hasWebGL2 ? (
          <p className="text-sm text-muted-foreground">The preview needs WebGL2, which this browser doesn&apos;t provide.</p>
        ) : (
          <canvas
            ref={canvasRef}
            role="img"
            aria-label="Video preview"
            className="block shrink-0 rounded-md shadow-sm ring-1 ring-border"
          />
        )}
      </div>
    </div>
  );
}
