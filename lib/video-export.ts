/**
 * High-Quality Video Export
 *
 * Renders scenes with proper transforms and high-quality images.
 */

export interface ExportOptions {
  width: number;
  height: number;
  fps: number;
  quality: 'low' | 'medium' | 'high' | 'ultra';
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
  progress: number // 0-1 for animation timing
) {
  // Clear with background
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, width, height);

  // Save context state
  ctx.save();

  // Enable high-quality image rendering
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Calculate image dimensions to fit in frame with padding
  const padding = 0.1; // 10% padding
  const availableWidth = width * (1 - padding * 2);
  const availableHeight = height * (1 - padding * 2);

  const imgAspect = img.width / img.height;
  const frameAspect = availableWidth / availableHeight;

  let drawWidth: number;
  let drawHeight: number;

  if (imgAspect > frameAspect) {
    // Image is wider than frame
    drawWidth = availableWidth;
    drawHeight = drawWidth / imgAspect;
  } else {
    // Image is taller than frame
    drawHeight = availableHeight;
    drawWidth = drawHeight * imgAspect;
  }

  // Apply scale from transform
  drawWidth *= transform.scale;
  drawHeight *= transform.scale;

  // Center position
  const x = (width - drawWidth) / 2;
  const y = (height - drawHeight) / 2;

  // Move to center for rotation
  ctx.translate(width / 2, height / 2);

  // Apply Z rotation
  ctx.rotate((transform.rotateZ * Math.PI) / 180);

  // Apply pseudo-3D perspective effect using skew
  // Convert rotateX and rotateY to skew approximation
  const skewX = Math.tan((transform.rotateY * Math.PI) / 180) * 0.5;
  const skewY = Math.tan((transform.rotateX * Math.PI) / 180) * 0.3;
  ctx.transform(1, skewY, skewX, 1, 0, 0);

  // Move back from center
  ctx.translate(-width / 2, -height / 2);

  // Add subtle shadow for depth
  ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
  ctx.shadowBlur = 30;
  ctx.shadowOffsetX = 10;
  ctx.shadowOffsetY = 15;

  // Draw rounded rectangle clip path
  const radius = 12;
  ctx.beginPath();
  ctx.roundRect(x, y, drawWidth, drawHeight, radius);
  ctx.clip();

  // Draw the image
  ctx.drawImage(img, x, y, drawWidth, drawHeight);

  // Restore context
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
  transitionProgress: number // 0-1
) {
  // Clear with background
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, width, height);

  // Ease function for smooth transition
  const ease = (t: number) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  const eased = ease(transitionProgress);

  // Draw outgoing scene with fade out
  if (imgFrom && transformFrom && transitionProgress < 0.5) {
    ctx.save();
    ctx.globalAlpha = 1 - eased;
    drawSceneFrame(ctx, imgFrom, width, height, transformFrom, 1);
    ctx.restore();
  }

  // Draw incoming scene with fade in
  ctx.save();
  ctx.globalAlpha = eased;
  drawSceneFrame(ctx, imgTo, width, height, transformTo, 0);
  ctx.restore();
}

/**
 * Main export function - creates high-quality video from scenes
 */
export async function exportScenesAsVideo(
  scenes: SceneExportData[],
  options: ExportOptions
): Promise<Blob> {
  const { width, height, fps, quality, onProgress } = options;

  if (scenes.length === 0) {
    throw new Error('No scenes to export');
  }

  // Create high-DPI canvas
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', {
    alpha: false,
    desynchronized: true // Better performance
  })!;

  // Check browser support
  const mimeType = 'video/webm;codecs=vp9';
  if (!MediaRecorder.isTypeSupported(mimeType)) {
    throw new Error('WebM VP9 not supported. Please use Chrome or Edge.');
  }

  // Setup MediaRecorder with high quality
  const stream = canvas.captureStream(fps);
  const mediaRecorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: QUALITY_BITRATE[quality],
  });

  const chunks: Blob[] = [];
  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  // Pre-load all images for smooth playback
  onProgress?.(0);
  const images: HTMLImageElement[] = [];

  for (let i = 0; i < scenes.length; i++) {
    const img = await loadImage(scenes[i].imageUrl);
    images.push(img);
    onProgress?.(((i + 1) / scenes.length) * 10); // First 10% is loading
  }

  // Calculate total frames
  const totalDuration = scenes.reduce((acc, s) => acc + s.duration, 0);
  const frameDuration = 1000 / fps;
  const totalFrames = Math.ceil(totalDuration / frameDuration);
  const transitionDuration = 300; // 300ms transitions

  // Start recording
  mediaRecorder.start(100);

  let currentTime = 0;
  let currentSceneIndex = 0;
  let sceneStartTime = 0;

  for (let frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
    // Find current scene
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

    // Check if we're in a transition zone
    const isInEntryTransition = sceneTime < transitionDuration && currentSceneIndex > 0;
    const isInExitTransition = sceneTime > scene.duration - transitionDuration && currentSceneIndex < scenes.length - 1;

    if (isInEntryTransition) {
      // Transition from previous scene
      const transitionProgress = sceneTime / transitionDuration;
      const prevImg = images[currentSceneIndex - 1];
      const prevTransform = scenes[currentSceneIndex - 1].transform;
      drawTransitionFrame(ctx, prevImg, img, width, height, prevTransform, scene.transform, transitionProgress);
    } else if (isInExitTransition) {
      // Transition to next scene
      const timeIntoTransition = sceneTime - (scene.duration - transitionDuration);
      const transitionProgress = timeIntoTransition / transitionDuration;
      const nextImg = images[currentSceneIndex + 1];
      const nextTransform = scenes[currentSceneIndex + 1].transform;
      drawTransitionFrame(ctx, img, nextImg, width, height, scene.transform, nextTransform, transitionProgress);
    } else {
      // Normal scene rendering
      drawSceneFrame(ctx, img, width, height, scene.transform, sceneProgress);
    }

    // Wait for frame timing (but not too long to avoid slow exports)
    await new Promise((resolve) => requestAnimationFrame(resolve));

    currentTime += frameDuration;
    onProgress?.(10 + ((frameIndex + 1) / totalFrames) * 85); // 10-95% is rendering
  }

  // Stop recording
  mediaRecorder.stop();

  // Wait for final data
  return new Promise((resolve, reject) => {
    mediaRecorder.onstop = () => {
      try {
        const blob = new Blob(chunks, { type: 'video/webm' });
        onProgress?.(100);
        resolve(blob);
      } catch (error) {
        reject(error);
      }
    };
    mediaRecorder.onerror = (e) => reject(e);
  });
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
