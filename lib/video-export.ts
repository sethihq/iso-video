/**
 * Video export. Frames come from the same frame builder and WebGL renderer
 * as the preview, so the file matches what the editor shows. MP4 and WebM
 * are encoded with WebCodecs through Mediabunny at exact timestamps (faster
 * than real time, independent of display rate and tab focus), with the
 * background music muxed in. GIFs are encoded frame by frame with gifenc.
 */

import type { Project, ExportFormat, ExportQuality } from './types';
import { buildFrame, getSceneTimings } from './render/frame';
import { Compositor } from './render/compositor';
import { decodeBitmap } from './render/images';
import { GIF_FPS, gifDimensions, videoBitrate } from './export-settings';

export interface ExportOptions {
  width: number;
  height: number;
  fps: number;
  quality: ExportQuality;
  format: ExportFormat;
  includeAudio: boolean;
  signal?: AbortSignal;
  onProgress?: (progress: number) => void;
}

export class ExportCancelledError extends Error {
  constructor() {
    super('Export cancelled');
    this.name = 'ExportCancelledError';
  }
}

// Leave room for the horizontal-pan zoom when picking texture sizes
const TEXTURE_HEADROOM = 1.25;
const AUDIO_SAMPLE_RATE = 48000;
const AUDIO_BITRATE = 192_000;
const AUDIO_FADE_OUT = 1.5; // seconds
const AUDIO_CHUNK = 1; // seconds of audio handed to the muxer at a time
const GIF_COLORS: Record<ExportQuality, number> = { low: 64, medium: 128, high: 256, ultra: 256 };

const yieldToMain = (): Promise<void> => {
  const scheduler = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  return scheduler?.yield ? scheduler.yield() : new Promise((resolve) => setTimeout(resolve, 0));
};

function throwIfCancelled(signal?: AbortSignal) {
  if (signal?.aborted) throw new ExportCancelledError();
}

/** Renders the project and returns the encoded file. */
export async function exportVideo(project: Project, options: ExportOptions): Promise<Blob> {
  const { total } = getSceneTimings(project.scenes);
  if (project.scenes.length === 0 || total <= 0) throw new Error('No scenes to export');

  const isGif = options.format === 'gif';
  const size = isGif ? gifDimensions(options.width, options.height) : { width: options.width, height: options.height };
  const canvas = createCanvas(size.width, size.height);
  const compositor = new Compositor(canvas, { preserveDrawingBuffer: true });
  const report = (value: number) => options.onProgress?.(Math.min(100, Math.max(0, value)));

  try {
    report(0);
    await loadTextures(project, compositor, size.width, options.signal, (p) => report(p * 5));

    return isGif
      ? await encodeGif(project, compositor, canvas, total, options, (p) => report(5 + p * 95))
      : await encodeVideo(project, compositor, canvas, total, options, (p) => report(5 + p * 95));
  } finally {
    // Free the GPU context now; browsers cap live contexts and would drop the preview's
    compositor.release();
  }
}

/** Saves a blob through a temporary download link. */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoking right away can cancel the download in some browsers
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function createCanvas(width: number, height: number): HTMLCanvasElement | OffscreenCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

async function loadTextures(
  project: Project,
  compositor: Compositor,
  outputWidth: number,
  signal: AbortSignal | undefined,
  onProgress: (progress: number) => void,
) {
  const urls = [...new Set(project.screens.map((s) => s.imageUrl).filter(Boolean))];
  const limits = {
    maxWidth: Math.ceil(outputWidth * TEXTURE_HEADROOM),
    maxTexture: compositor.maxTextureSize,
  };
  // One at a time keeps peak memory to a single full-size image
  for (let i = 0; i < urls.length; i++) {
    throwIfCancelled(signal);
    const bitmap = await decodeBitmap(urls[i], limits);
    try {
      throwIfCancelled(signal);
      compositor.setTexture(urls[i], bitmap);
    } finally {
      bitmap.close();
    }
    onProgress((i + 1) / urls.length);
  }
}

function renderFrame(compositor: Compositor, project: Project, timeMs: number) {
  compositor.render(buildFrame(project, timeMs));
  // A GPU reset mid-export would otherwise encode blank frames
  if (compositor.isContextLost) throw new Error('The graphics context was lost during export. Please try again.');
}

async function encodeVideo(
  project: Project,
  compositor: Compositor,
  canvas: HTMLCanvasElement | OffscreenCanvas,
  totalMs: number,
  options: ExportOptions,
  onProgress: (progress: number) => void,
): Promise<Blob> {
  const {
    AudioBufferSource,
    BufferTarget,
    CanvasSource,
    Mp4OutputFormat,
    Output,
    Quality,
    WebMOutputFormat,
    canEncodeAudio,
    getFirstEncodableVideoCodec,
  } = await import('mediabunny');

  const { width, height } = canvas;
  const { fps, signal } = options;
  const isMp4 = options.format === 'mp4';
  const bitrate = videoBitrate(options.quality, width, height, fps);

  const codec = await getFirstEncodableVideoCodec(isMp4 ? ['avc', 'hevc', 'av1'] : ['vp9', 'vp8', 'av1'], {
    width,
    height,
    quality: new Quality({ bitrate }),
  });
  if (!codec) {
    throw new Error(
      isMp4
        ? 'This browser cannot encode MP4 video. Try WebM, or a recent Chrome, Edge or Safari.'
        : 'This browser cannot encode WebM video. Try MP4.',
    );
  }

  const output = new Output({
    format: isMp4 ? new Mp4OutputFormat({ fastStart: 'in-memory' }) : new WebMOutputFormat(),
    target: new BufferTarget(),
  });

  const video = new CanvasSource(canvas, { codec, quality: new Quality({ bitrate }), keyFrameInterval: 2 });
  output.addVideoTrack(video, { frameRate: fps });

  // Background music, mixed to the video's length with a fade at the end
  const soundtrack = options.includeAudio ? await renderSoundtrack(project, totalMs / 1000) : null;
  let audio: InstanceType<typeof AudioBufferSource> | null = null;
  if (soundtrack) {
    const audioCodec = isMp4 ? 'aac' : 'opus';
    const audioSupported = await canEncodeAudio(audioCodec, { numberOfChannels: 2, sampleRate: AUDIO_SAMPLE_RATE });
    if (!audioSupported && isMp4) {
      // Some browsers (Firefox, Chrome on Linux) ship no AAC encoder
      const { registerAacEncoder } = await import('@mediabunny/aac-encoder');
      registerAacEncoder();
    } else if (!audioSupported) {
      throw new Error("This browser can't encode WebM audio. Export MP4, or turn off Include Audio.");
    }
    audio = new AudioBufferSource({ codec: audioCodec, quality: new Quality({ bitrate: AUDIO_BITRATE }) });
    output.addAudioTrack(audio);
  }
  const audioChunks = soundtrack ? splitAudio(soundtrack, AUDIO_CHUNK) : [];
  let audioSent = 0;

  await output.start();

  try {
    const frameCount = Math.max(1, Math.round((totalMs / 1000) * fps));
    for (let frame = 0; frame < frameCount; frame++) {
      throwIfCancelled(signal);
      const seconds = frame / fps;

      // Hand over audio alongside the video so the muxer can interleave them
      while (audio && audioSent < audioChunks.length && audioSent * AUDIO_CHUNK <= seconds + AUDIO_CHUNK) {
        await audio.add(audioChunks[audioSent++]);
      }

      renderFrame(compositor, project, seconds * 1000);
      await video.add(seconds, 1 / fps);

      onProgress((frame + 1) / frameCount);
      if (frame % 15 === 14) await yieldToMain();
    }

    while (audio && audioSent < audioChunks.length) await audio.add(audioChunks[audioSent++]);
    video.close();
    audio?.close();
    await output.finalize();
  } catch (error) {
    await output.cancel().catch(() => {});
    throw error;
  }

  const buffer = output.target.buffer;
  if (!buffer) throw new Error('The encoder produced no data');
  return new Blob([buffer], { type: output.format.mimeType });
}

async function encodeGif(
  project: Project,
  compositor: Compositor,
  canvas: HTMLCanvasElement | OffscreenCanvas,
  totalMs: number,
  options: ExportOptions,
  onProgress: (progress: number) => void,
): Promise<Blob> {
  const { GIFEncoder, applyPalette, quantize } = await import('gifenc');
  const { width, height } = canvas;
  const fps = Math.min(options.fps, GIF_FPS);
  const colors = GIF_COLORS[options.quality];

  // Read frames back through a 2D canvas, which returns rows top to bottom
  const readback = new OffscreenCanvas(width, height).getContext('2d', { willReadFrequently: true });
  if (!readback) throw new Error('Canvas is not available');

  const gif = GIFEncoder();
  const frameCount = Math.max(1, Math.round((totalMs / 1000) * fps));
  for (let frame = 0; frame < frameCount; frame++) {
    throwIfCancelled(options.signal);
    renderFrame(compositor, project, (frame / fps) * 1000);
    readback.drawImage(canvas, 0, 0);
    const { data } = readback.getImageData(0, 0, width, height);
    const palette = quantize(data, colors);
    const index = applyPalette(data, palette);

    // GIF delays are whole centiseconds; round the running time so the length stays exact
    const delay = (Math.round(((frame + 1) * 100) / fps) - Math.round((frame * 100) / fps)) * 10;
    gif.writeFrame(index, width, height, { palette, delay, repeat: 0 });

    onProgress((frame + 1) / frameCount);
    await yieldToMain();
  }
  gif.finish();
  return new Blob([gif.bytes() as BlobPart], { type: 'image/gif' });
}

async function renderSoundtrack(project: Project, durationSeconds: number): Promise<AudioBuffer | null> {
  const track = project.audioTracks[0];
  if (!track?.url) return null;

  const data = await (await fetch(track.url)).arrayBuffer();
  const length = Math.max(1, Math.ceil(durationSeconds * AUDIO_SAMPLE_RATE));
  const context = new OfflineAudioContext(2, length, AUDIO_SAMPLE_RATE);
  const decoded = await context.decodeAudioData(data);

  const source = context.createBufferSource();
  source.buffer = decoded;
  const gain = context.createGain();
  const volume = Math.min(1, Math.max(0, track.volume));
  const fadeStart = Math.max(0, durationSeconds - AUDIO_FADE_OUT);
  gain.gain.setValueAtTime(volume, 0);
  gain.gain.setValueAtTime(volume, fadeStart);
  gain.gain.linearRampToValueAtTime(0, durationSeconds);
  source.connect(gain).connect(context.destination);
  source.start(Math.max(0, track.startTime / 1000));

  return context.startRendering();
}

function splitAudio(buffer: AudioBuffer, chunkSeconds: number): AudioBuffer[] {
  const chunkLength = Math.round(chunkSeconds * buffer.sampleRate);
  const chunks: AudioBuffer[] = [];
  for (let start = 0; start < buffer.length; start += chunkLength) {
    const length = Math.min(chunkLength, buffer.length - start);
    const chunk = new AudioBuffer({ length, numberOfChannels: buffer.numberOfChannels, sampleRate: buffer.sampleRate });
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      chunk.copyToChannel(buffer.getChannelData(channel).subarray(start, start + length), channel);
    }
    chunks.push(chunk);
  }
  return chunks;
}
