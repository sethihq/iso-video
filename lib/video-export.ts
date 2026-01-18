/**
 * High-Quality Video Export
 *
 * Renders scenes with proper transforms and high-quality images.
 * Supports WebM, MP4 (via FFmpeg.wasm), and GIF formats.
 */

import GIF from 'gif.js-upgrade';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';
import { ExportFormat } from './types';

export interface ExportOptions {
  width: number;
  height: number;
  fps: number;
  quality: 'low' | 'medium' | 'high' | 'ultra';
  format: ExportFormat;
  onProgress?: (progress: number) => void;
}

export interface SceneExportData {
  imageUrl: string;
  duration: number;
  transform: {
    rotateX: number;
    rotateY: number;
    rotateZ: number;
    scale: number;
    perspective: number;
  };
}

const QUALITY_BITRATE: Record<string, number> = {
  low: 4_000_000,
  medium: 8_000_000,
  high: 16_000_000,
  ultra: 32_000_000,
};

// GIF quality settings (lower = better quality, slower)
const GIF_QUALITY: Record<string, number> = {
  low: 20,
  medium: 10,
  high: 5,
  ultra: 1,
};

/**
 * Loads an image and returns it as an HTMLImageElement
 */
async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src.substring(0, 100)}`));
    img.src = src;
  });
}

/**
 * Applies 3D transform to image and draws to canvas with high quality
 */
function drawSceneFrame(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  width: number,
  height: number,
  transform: SceneExportData['transform'],
  _progress: number
) {
  // Clear with background
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, width, height);

  ctx.save();

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const padding = 0.1;
  const availableWidth = width * (1 - padding * 2);
  const availableHeight = height * (1 - padding * 2);

  const imgAspect = img.width / img.height;
  const frameAspect = availableWidth / availableHeight;

  let drawWidth: number;
  let drawHeight: number;

  if (imgAspect > frameAspect) {
    drawWidth = availableWidth;
    drawHeight = drawWidth / imgAspect;
  } else {
    drawHeight = availableHeight;
    drawWidth = drawHeight * imgAspect;
  }

  drawWidth *= transform.scale;
  drawHeight *= transform.scale;

  const x = (width - drawWidth) / 2;
  const y = (height - drawHeight) / 2;

  ctx.translate(width / 2, height / 2);
  ctx.rotate((transform.rotateZ * Math.PI) / 180);

  const skewX = Math.tan((transform.rotateY * Math.PI) / 180) * 0.5;
  const skewY = Math.tan((transform.rotateX * Math.PI) / 180) * 0.3;
  ctx.transform(1, skewY, skewX, 1, 0, 0);

  ctx.translate(-width / 2, -height / 2);

  ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
  ctx.shadowBlur = 30;
  ctx.shadowOffsetX = 10;
  ctx.shadowOffsetY = 15;

  const radius = 12;
  ctx.beginPath();
  ctx.roundRect(x, y, drawWidth, drawHeight, radius);
  ctx.clip();

  ctx.drawImage(img, x, y, drawWidth, drawHeight);

  ctx.restore();
}

/**
 * Draws a smooth transition between two scenes
 */
function drawTransitionFrame(
  ctx: CanvasRenderingContext2D,
  imgFrom: HTMLImageElement | null,
  imgTo: HTMLImageElement,
  width: number,
  height: number,
  transformFrom: SceneExportData['transform'] | null,
  transformTo: SceneExportData['transform'],
  transitionProgress: number
) {
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, width, height);

  const ease = (t: number) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  const eased = ease(transitionProgress);

  if (imgFrom && transformFrom && transitionProgress < 0.5) {
    ctx.save();
    ctx.globalAlpha = 1 - eased;
    drawSceneFrame(ctx, imgFrom, width, height, transformFrom, 1);
    ctx.restore();
  }

  ctx.save();
  ctx.globalAlpha = eased;
  drawSceneFrame(ctx, imgTo, width, height, transformTo, 0);
  ctx.restore();
}

/**
 * Render frames to canvas and return as WebM blob
 */
async function renderToWebM(
  scenes: SceneExportData[],
  options: ExportOptions
): Promise<Blob> {
  const { width, height, fps, quality, onProgress } = options;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', {
    alpha: false,
    desynchronized: true
  })!;

  const mimeType = 'video/webm;codecs=vp9';
  if (!MediaRecorder.isTypeSupported(mimeType)) {
    throw new Error('WebM VP9 not supported. Please use Chrome or Edge.');
  }

  const stream = canvas.captureStream(fps);
  const mediaRecorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: QUALITY_BITRATE[quality],
  });

  const chunks: Blob[] = [];
  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  onProgress?.(0);
  const images: HTMLImageElement[] = [];

  for (let i = 0; i < scenes.length; i++) {
    const img = await loadImage(scenes[i].imageUrl);
    images.push(img);
    onProgress?.(((i + 1) / scenes.length) * 10);
  }

  const totalDuration = scenes.reduce((acc, s) => acc + s.duration, 0);
  const frameDuration = 1000 / fps;
  const totalFrames = Math.ceil(totalDuration / frameDuration);
  const transitionDuration = 300;

  mediaRecorder.start(100);

  let currentTime = 0;
  let currentSceneIndex = 0;
  let sceneStartTime = 0;

  for (let frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
    while (
      currentSceneIndex < scenes.length - 1 &&
      currentTime >= sceneStartTime + scenes[currentSceneIndex].duration
    ) {
      sceneStartTime += scenes[currentSceneIndex].duration;
      currentSceneIndex++;
    }

    const scene = scenes[currentSceneIndex];
    const img = images[currentSceneIndex];
    const sceneTime = currentTime - sceneStartTime;
    const sceneProgress = sceneTime / scene.duration;

    const isInEntryTransition = sceneTime < transitionDuration && currentSceneIndex > 0;
    const isInExitTransition = sceneTime > scene.duration - transitionDuration && currentSceneIndex < scenes.length - 1;

    if (isInEntryTransition) {
      const transitionProgress = sceneTime / transitionDuration;
      const prevImg = images[currentSceneIndex - 1];
      const prevTransform = scenes[currentSceneIndex - 1].transform;
      drawTransitionFrame(ctx, prevImg, img, width, height, prevTransform, scene.transform, transitionProgress);
    } else if (isInExitTransition) {
      const timeIntoTransition = sceneTime - (scene.duration - transitionDuration);
      const transitionProgress = timeIntoTransition / transitionDuration;
      const nextImg = images[currentSceneIndex + 1];
      const nextTransform = scenes[currentSceneIndex + 1].transform;
      drawTransitionFrame(ctx, img, nextImg, width, height, scene.transform, nextTransform, transitionProgress);
    } else {
      drawSceneFrame(ctx, img, width, height, scene.transform, sceneProgress);
    }

    await new Promise((resolve) => requestAnimationFrame(resolve));

    currentTime += frameDuration;
    onProgress?.(10 + ((frameIndex + 1) / totalFrames) * 70);
  }

  mediaRecorder.stop();

  return new Promise((resolve, reject) => {
    mediaRecorder.onstop = () => {
      try {
        const blob = new Blob(chunks, { type: 'video/webm' });
        resolve(blob);
      } catch (error) {
        reject(error);
      }
    };
    mediaRecorder.onerror = (e) => reject(e);
  });
}

// Singleton FFmpeg instance
let ffmpegInstance: FFmpeg | null = null;
let ffmpegLoaded = false;
let ffmpegLoading: Promise<void> | null = null;

/**
 * Get or create FFmpeg instance with local files
 */
async function getFFmpeg(onProgress?: (progress: number) => void): Promise<FFmpeg> {
  if (ffmpegInstance && ffmpegLoaded) {
    return ffmpegInstance;
  }

  if (ffmpegLoading) {
    await ffmpegLoading;
    return ffmpegInstance!;
  }

  ffmpegInstance = new FFmpeg();

  ffmpegLoading = (async () => {
    onProgress?.(80);

    // Create blob URLs from local files to avoid CORS issues
    const baseURL = '/ffmpeg';
    const coreURL = await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript');
    const wasmURL = await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm');

    await ffmpegInstance!.load({
      coreURL,
      wasmURL,
    });

    ffmpegLoaded = true;
    onProgress?.(85);
  })();

  await ffmpegLoading;
  return ffmpegInstance!;
}

/**
 * Convert WebM to MP4 using FFmpeg.wasm
 */
async function convertToMP4(
  webmBlob: Blob,
  onProgress?: (progress: number) => void
): Promise<Blob> {
  const ffmpeg = await getFFmpeg(onProgress);

  ffmpeg.on('progress', ({ progress }) => {
    onProgress?.(85 + progress * 14);
  });

  // Write input file
  const webmData = new Uint8Array(await webmBlob.arrayBuffer());
  await ffmpeg.writeFile('input.webm', webmData);

  // Convert to MP4 with H.264 codec
  await ffmpeg.exec([
    '-i', 'input.webm',
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '23',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    'output.mp4'
  ]);

  // Read output file
  const mp4Data = await ffmpeg.readFile('output.mp4');
  const mp4Blob = new Blob([mp4Data as BlobPart], { type: 'video/mp4' });

  // Cleanup
  await ffmpeg.deleteFile('input.webm');
  await ffmpeg.deleteFile('output.mp4');

  onProgress?.(100);
  return mp4Blob;
}

/**
 * Export as WebM video
 */
async function exportAsWebM(
  scenes: SceneExportData[],
  options: ExportOptions
): Promise<Blob> {
  const blob = await renderToWebM(scenes, options);
  options.onProgress?.(100);
  return blob;
}

/**
 * Export as MP4 video (WebM -> MP4 conversion)
 */
async function exportAsMP4(
  scenes: SceneExportData[],
  options: ExportOptions
): Promise<Blob> {
  try {
    // First render to WebM
    const webmBlob = await renderToWebM(scenes, options);

    // Then convert to MP4
    const mp4Blob = await convertToMP4(webmBlob, options.onProgress);

    return mp4Blob;
  } catch (error) {
    console.error('MP4 export failed:', error);
    throw new Error(
      'MP4 export failed. Please try WebM format instead.'
    );
  }
}

/**
 * Export as GIF using gif.js
 */
async function exportAsGIF(
  scenes: SceneExportData[],
  options: ExportOptions
): Promise<Blob> {
  const { width, height, fps, quality, onProgress } = options;

  const gifWidth = Math.min(width, 800);
  const gifHeight = Math.round(gifWidth * (height / width));
  const gifFps = Math.min(fps, 15);

  const canvas = document.createElement('canvas');
  canvas.width = gifWidth;
  canvas.height = gifHeight;
  const ctx = canvas.getContext('2d', { alpha: false })!;

  const gif = new GIF({
    workers: 2,
    quality: GIF_QUALITY[quality],
    width: gifWidth,
    height: gifHeight,
    workerScript: '/gif.worker.js',
  });

  onProgress?.(0);
  const images: HTMLImageElement[] = [];

  for (let i = 0; i < scenes.length; i++) {
    const img = await loadImage(scenes[i].imageUrl);
    images.push(img);
    onProgress?.(((i + 1) / scenes.length) * 10);
  }

  const totalDuration = scenes.reduce((acc, s) => acc + s.duration, 0);
  const frameDuration = 1000 / gifFps;
  const totalFrames = Math.ceil(totalDuration / frameDuration);
  const transitionDuration = 300;

  let currentTime = 0;
  let currentSceneIndex = 0;
  let sceneStartTime = 0;

  for (let frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
    while (
      currentSceneIndex < scenes.length - 1 &&
      currentTime >= sceneStartTime + scenes[currentSceneIndex].duration
    ) {
      sceneStartTime += scenes[currentSceneIndex].duration;
      currentSceneIndex++;
    }

    const scene = scenes[currentSceneIndex];
    const img = images[currentSceneIndex];
    const sceneTime = currentTime - sceneStartTime;
    const sceneProgress = sceneTime / scene.duration;

    const isInEntryTransition = sceneTime < transitionDuration && currentSceneIndex > 0;
    const isInExitTransition = sceneTime > scene.duration - transitionDuration && currentSceneIndex < scenes.length - 1;

    if (isInEntryTransition) {
      const transitionProgress = sceneTime / transitionDuration;
      const prevImg = images[currentSceneIndex - 1];
      const prevTransform = scenes[currentSceneIndex - 1].transform;
      drawTransitionFrame(ctx, prevImg, img, gifWidth, gifHeight, prevTransform, scene.transform, transitionProgress);
    } else if (isInExitTransition) {
      const timeIntoTransition = sceneTime - (scene.duration - transitionDuration);
      const transitionProgress = timeIntoTransition / transitionDuration;
      const nextImg = images[currentSceneIndex + 1];
      const nextTransform = scenes[currentSceneIndex + 1].transform;
      drawTransitionFrame(ctx, img, nextImg, gifWidth, gifHeight, scene.transform, nextTransform, transitionProgress);
    } else {
      drawSceneFrame(ctx, img, gifWidth, gifHeight, scene.transform, sceneProgress);
    }

    gif.addFrame(ctx, { copy: true, delay: frameDuration });

    currentTime += frameDuration;
    onProgress?.(10 + ((frameIndex + 1) / totalFrames) * 60);
  }

  return new Promise((resolve, reject) => {
    gif.on('finished', (blob: Blob) => {
      onProgress?.(100);
      resolve(blob);
    });

    gif.on('progress', (p: number) => {
      onProgress?.(70 + p * 30);
    });

    gif.render();
  });
}

/**
 * Main export function - creates video or GIF from scenes
 */
export async function exportScenesAsVideo(
  scenes: SceneExportData[],
  options: ExportOptions
): Promise<Blob> {
  if (scenes.length === 0) {
    throw new Error('No scenes to export');
  }

  const format = options.format || 'webm';

  if (format === 'gif') {
    return exportAsGIF(scenes, options);
  } else if (format === 'mp4') {
    return exportAsMP4(scenes, options);
  } else {
    return exportAsWebM(scenes, options);
  }
}

/**
 * Downloads a blob as a file
 */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
