import type { AspectRatio, ExportQuality, Resolution } from './types';

const RESOLUTION_HEIGHT: Record<Resolution, number> = {
  '720p': 720,
  '1080p': 1080,
  '4k': 2160,
};

// Video bitrate at 1080p and 30 fps; other sizes scale by pixel count
const BASE_MBPS: Record<ExportQuality, number> = {
  low: 4,
  medium: 8,
  high: 16,
  ultra: 32,
};

export const GIF_MAX_WIDTH = 800;
export const GIF_FPS = 15;

const even = (value: number) => Math.max(2, Math.round(value / 2) * 2);

/** Output size in pixels. The short side follows the resolution. */
export function outputDimensions(resolution: Resolution, aspectRatio: AspectRatio): { width: number; height: number } {
  const short = RESOLUTION_HEIGHT[resolution] ?? 1080;
  switch (aspectRatio) {
    case '1:1':
      return { width: short, height: short };
    case '9:16':
      return { width: short, height: even((short * 16) / 9) };
    case '4:3':
      return { width: even((short * 4) / 3), height: short };
    default:
      return { width: even((short * 16) / 9), height: short };
  }
}

/** GIFs stay small: at most 800 px wide. */
export function gifDimensions(width: number, height: number): { width: number; height: number } {
  const gifWidth = Math.min(width, GIF_MAX_WIDTH);
  return { width: gifWidth, height: Math.round((gifWidth * height) / width) };
}

/** Target video bitrate in bits per second. */
export function videoBitrate(quality: ExportQuality, width: number, height: number, fps: number): number {
  const pixels = (width * height) / (1920 * 1080);
  const motion = fps >= 60 ? 1.5 : 1;
  const mbps = Math.min(80, Math.max(1, BASE_MBPS[quality] * pixels * motion));
  return Math.round(mbps * 1_000_000);
}
