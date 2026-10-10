/**
 * Decoded screenshots, shared by the preview and the exporter. Decoding runs
 * off the main thread via createImageBitmap; large images are resampled once
 * to the width the caller needs and to the GPU's texture limit.
 */

export interface BitmapLimits {
  /** Widest the decoded image needs to be. */
  maxWidth: number;
  /** Largest texture side the GPU accepts. */
  maxTexture: number;
}

interface Entry {
  promise: Promise<ImageBitmap>;
  bitmap?: ImageBitmap;
}

const entries = new Map<string, Entry>();

// Full-size decodes are large (a 2880 x 16000 screenshot is 184 MB of pixels),
// so only a couple run at once
const MAX_PARALLEL_DECODES = 2;
let activeDecodes = 0;
const waiting: (() => void)[] = [];

async function withDecodeSlot<T>(task: () => Promise<T>): Promise<T> {
  if (activeDecodes >= MAX_PARALLEL_DECODES) {
    await new Promise<void>((resolve) => waiting.push(resolve));
  }
  activeDecodes++;
  try {
    return await task();
  } finally {
    activeDecodes--;
    waiting.shift()?.();
  }
}

const cacheKey = (url: string, limits: BitmapLimits) => `${limits.maxWidth}:${limits.maxTexture}|${url}`;

export function loadBitmap(url: string, limits: BitmapLimits): Promise<ImageBitmap> {
  const key = cacheKey(url, limits);
  const existing = entries.get(key);
  if (existing) return existing.promise;

  const entry: Entry = {
    promise: decodeBitmap(url, limits).then((bitmap) => {
      entry.bitmap = bitmap;
      return bitmap;
    }),
  };
  entry.promise.catch(() => entries.delete(key));
  entries.set(key, entry);
  return entry.promise;
}

/** The bitmap if it has finished decoding, without waiting. */
export function peekBitmap(url: string, limits: BitmapLimits): ImageBitmap | undefined {
  return entries.get(cacheKey(url, limits))?.bitmap;
}

/** Frees decoded bitmaps for images no longer in use. */
export function releaseBitmaps(keepUrls: Set<string>): void {
  for (const [key, entry] of entries) {
    const url = key.slice(key.indexOf('|') + 1);
    if (!keepUrls.has(url)) {
      entry.bitmap?.close();
      entries.delete(key);
    }
  }
}

/** Decodes without caching; the caller owns the bitmap and should close it. */
export function decodeBitmap(url: string, limits: BitmapLimits): Promise<ImageBitmap> {
  return withDecodeSlot(() => decodeNow(url, limits));
}

async function decodeNow(url: string, limits: BitmapLimits): Promise<ImageBitmap> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load image (${response.status})`);
  const bitmap = await createImageBitmap(await response.blob());

  const ratio = Math.min(
    1,
    limits.maxWidth / bitmap.width,
    limits.maxTexture / bitmap.width,
    limits.maxTexture / bitmap.height,
  );
  if (ratio >= 1) return bitmap;

  const resized = await createImageBitmap(bitmap, {
    resizeWidth: Math.max(1, Math.round(bitmap.width * ratio)),
    resizeHeight: Math.max(1, Math.round(bitmap.height * ratio)),
    resizeQuality: 'high',
  });
  bitmap.close();
  return resized;
}
