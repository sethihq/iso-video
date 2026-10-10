import { NextRequest, NextResponse } from 'next/server';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import sharp, { type OutputInfo } from 'sharp';
import type { DetectedSection } from '@/lib/types';
import { CAPTURE_CONTENT_TYPE, type CaptureEvent, type CapturePhase } from '@/lib/capture/events';
import { HARDENING_ARGS, guardPage, hostResolverRule } from '@/lib/capture/page-guard';
import { parseCaptureUrl, resolvePublicAddress } from '@/lib/capture/url-guard';

export const runtime = 'nodejs';
// Seconds. Long pages on small serverless CPUs can need well over a minute.
export const maxDuration = 300;

// Chromium binary URL for serverless (must match chromium-min version)
const CHROMIUM_URL = 'https://github.com/Sparticuz/chromium/releases/download/v153.0.0/chromium-v153.0.0-pack.x64.tar';

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Every wait is bounded
const NAVIGATION_TIMEOUT_MS = 30_000; // Until DOMContentLoaded
const LOAD_TIMEOUT_MS = 10_000;       // Then the load event, best effort
const SCROLL_BUDGET_MS = 8000;        // Lazy-load scroll
const ASSET_TIMEOUT_MS = 5000;        // Images, background images and fonts
const PROTOCOL_TIMEOUT_MS = 60_000;   // Any single DevTools call

const MAX_SECTIONS = 10;
// Chrome rasterizes at most 16384 device px per capture and WebP stops at 16383,
// so long pages are captured in bands no taller than this
const MAX_BAND_PX = 16383;
const CROP_CONCURRENCY = 2;
// Lossy q90 with sharp YUV subsampling: on nextjs.org text showed no visible change at
// 4x zoom, at about a quarter of the PNG size. Lossless was 2.2x larger and 3x slower.
const SECTION_WEBP = { quality: 90, smartSubsample: true };
const THUMB_WEBP = { quality: 80, smartSubsample: true };
const PAGE_THUMB = { width: 600, maxHeight: 1200 };
const SECTION_THUMB = { width: 400, height: 250 };

// Ads and tracking never load
const BLOCKED_URL_PARTS = ['google-analytics', 'googletagmanager', 'facebook.com/tr', 'doubleclick.net'];

// Per instance only: every serverless instance keeps its own counts, so the deployment-wide
// ceiling grows with the number of warm instances. Use a shared store for a hard limit.
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60_000;
const recentCaptures = new Map<string, number[]>();

// Each capture runs its own Chromium, so an instance runs at most this many at once.
// A few more wait briefly in line; past that the route answers 503.
const MAX_ACTIVE_CAPTURES = 2;
const MAX_QUEUED_CAPTURES = 4;
const QUEUE_TIMEOUT_MS = 30_000;
const BUSY_RETRY_AFTER_S = 15;
let activeCaptures = 0;
const queuedCaptures: (() => void)[] = [];

// Concurrent requests on one instance share a single Chromium extraction, since a second
// one could launch a half-written binary. A failure clears it so the next request retries.
let chromiumPath: Promise<string> | null = null;

// Client-facing messages stay generic; details only go to the server log
const MESSAGES = {
  badRequest: 'This URL cannot be captured. Use a public http(s) address.',
  rateLimited: 'Too many captures. Try again in a minute.',
  unreachable: 'Could not load that page. Check the URL and try again.',
  blockedRedirect: 'That page redirects to an address that cannot be captured.',
  failed: 'Capture failed. Please try again.',
  busy: 'Too many captures are running. Try again in a few seconds.',
};

const NO_ANIMATIONS_CSS = `
        *, *::before, *::after {
          animation-duration: 0s !important;
          animation-delay: 0s !important;
          transition-duration: 0s !important;
          transition-delay: 0s !important;
        }
      `;

interface CaptureRequest {
  url: string;
  viewportWidth?: number;
  viewportHeight?: number;
  deviceScaleFactor?: number;
}

interface CaptureViewport {
  width: number;
  height: number;
  deviceScaleFactor: number;
}

type RawSection = Omit<DetectedSection, 'thumbnail' | 'sectionImage' | 'pixelBounds'>;

// A slice of the page taken in one screenshot, in CSS px
interface Band {
  top: number;
  bottom: number;
  sections: number[];
  png?: Uint8Array;
}

interface DecodedBand {
  data: Buffer;
  info: OutputInfo;
  top: number;
}

type Progress = (phase: CapturePhase, progress: number) => void;

// Its message is safe to show the client; the cause is only logged
class CaptureError extends Error {}

// Get browser executable path based on environment
const launchBrowser = async (viewport: CaptureViewport, extraArgs: string[]): Promise<Browser> => {
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    // Serverless environment - @sparticuz/chromium-min, launched as its README shows.
    // Its args turn off web security, which capture does not need, so that flag is dropped.
    const { default: chromium } = await import('@sparticuz/chromium-min');
    chromiumPath ??= chromium.executablePath(CHROMIUM_URL).catch((error: unknown) => {
      chromiumPath = null;
      throw error;
    });
    const args = [...chromium.args.filter((arg) => arg !== '--disable-web-security'), ...extraArgs];
    return puppeteer.launch({
      args: await puppeteer.defaultArgs({ args, headless: 'shell' }),
      defaultViewport: viewport,
      executablePath: await chromiumPath,
      headless: 'shell',
      protocolTimeout: PROTOCOL_TIMEOUT_MS,
    });
  }

  // Local development - use system Chrome
  const executablePath = process.platform === 'darwin'
    ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    : process.platform === 'win32'
    ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    : '/usr/bin/google-chrome';

  return puppeteer.launch({
    headless: true,
    executablePath,
    defaultViewport: viewport,
    protocolTimeout: PROTOCOL_TIMEOUT_MS,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--font-render-hinting=none',
      '--disable-gpu',
      ...extraArgs,
    ],
  });
};

const clamp = (value: unknown, fallback: number, min: number, max: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const toDataUrl = (webp: Buffer) => `data:image/webp;base64,${webp.toString('base64')}`;

// Waits for a best-effort step for at most `ms`; its failures are ignored
function settle(promise: Promise<unknown>, ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    promise.catch(() => {}).finally(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}

// Runs `task` for every item, at most `limit` at a time
async function forEachLimit<T>(items: T[], limit: number, task: (item: T) => Promise<void>) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await task(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

function clientIp(request: NextRequest): string {
  // On Vercel both headers carry the real client address; spoofed values are overwritten
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || request.headers.get('x-real-ip')?.trim() || 'unknown';
}

// Records a capture for this client. Returns the seconds to wait when over the limit, else 0.
function rateLimit(key: string): number {
  const now = Date.now();
  const recent = (recentCaptures.get(key) ?? []).filter((time) => now - time < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) {
    recentCaptures.set(key, recent);
    return Math.max(1, Math.ceil((recent[0] + RATE_WINDOW_MS - now) / 1000));
  }
  recent.push(now);
  recentCaptures.set(key, recent);
  // Forget idle clients so the map stays small
  if (recentCaptures.size > 1000) {
    for (const [ip, times] of recentCaptures) {
      if (now - times[times.length - 1] >= RATE_WINDOW_MS) recentCaptures.delete(ip);
    }
  }
  return 0;
}

const captureQueueIsFull = () =>
  activeCaptures >= MAX_ACTIVE_CAPTURES && queuedCaptures.length >= MAX_QUEUED_CAPTURES;

// Takes a capture slot, waiting in line while both are busy
function acquireCaptureSlot(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(signal.reason);
  if (activeCaptures < MAX_ACTIVE_CAPTURES) {
    activeCaptures += 1;
    return Promise.resolve();
  }
  if (queuedCaptures.length >= MAX_QUEUED_CAPTURES) return Promise.reject(new CaptureError(MESSAGES.busy));

  return new Promise((resolve, reject) => {
    const leave = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      const index = queuedCaptures.indexOf(start);
      if (index !== -1) queuedCaptures.splice(index, 1);
    };
    const start = () => {
      leave();
      activeCaptures += 1;
      resolve();
    };
    const onAbort = () => {
      leave();
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      leave();
      reject(new CaptureError(MESSAGES.busy));
    }, QUEUE_TIMEOUT_MS);
    signal.addEventListener('abort', onAbort, { once: true });
    queuedCaptures.push(start);
  });
}

function releaseCaptureSlot() {
  activeCaptures -= 1;
  queuedCaptures.shift()?.();
}

// Runs in the page: two rendered frames, or 250 ms if frames are throttled
function twoFrames(): Promise<void> {
  return new Promise((resolve) => {
    const fallback = setTimeout(resolve, 250);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      clearTimeout(fallback);
      resolve();
    }));
  });
}

// Scroll through the page in steps to trigger lazy-loaded content, then back to the top.
// Each step waits two frames (IntersectionObserver callbacks have run) plus a short pause
// for scroll-throttled loaders, within an overall time budget.
async function scrollThroughPage(
  page: Page,
  viewportHeight: number,
  signal: AbortSignal,
  onStep: (fraction: number) => void
) {
  const totalHeight = await page.evaluate(() =>
    Math.max(document.body?.scrollHeight ?? 0, document.documentElement.scrollHeight)
  );
  const stepHeight = Math.round(viewportHeight * 0.8);
  const deadline = Date.now() + SCROLL_BUDGET_MS;

  for (let scrolled = 0; scrolled < totalHeight && Date.now() < deadline; scrolled += stepHeight) {
    signal.throwIfAborted();
    await page.evaluate((top) => window.scrollTo(0, top), scrolled);
    await page.evaluate(twoFrames);
    await delay(100);
    onStep(Math.min(1, (scrolled + stepHeight) / totalHeight));
  }

  // Scroll back to top
  await page.evaluate(() => window.scrollTo(0, 0));
}

// Runs in the page: waits for rendered images, CSS background images and fonts
async function waitForAssets(timeoutMs: number) {
  // Images that are rendered but not loaded yet
  const images = Array.from(document.querySelectorAll('img')).filter(
    (img) => !img.complete && img.getClientRects().length > 0
  );
  const imageLoads = images.map((img) => new Promise<void>((resolve) => {
    img.addEventListener('load', () => resolve(), { once: true });
    img.addEventListener('error', () => resolve(), { once: true });
    setTimeout(resolve, timeoutMs);
  }));

  // Background images, found through computed styles
  const backgroundUrls = new Set<string>();
  document.querySelectorAll('*').forEach((el) => {
    const urlMatch = window.getComputedStyle(el).backgroundImage.match(/url\(["']?([^"')]+)["']?\)/);
    if (urlMatch) backgroundUrls.add(urlMatch[1]);
  });
  const backgroundLoads = Array.from(backgroundUrls).map((src) => new Promise<void>((resolve) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => resolve();
    setTimeout(resolve, timeoutMs);
    img.src = src;
  }));

  await Promise.all([...imageLoads, ...backgroundLoads, document.fonts.ready]);
}

// Runs in the page: hide common popups, banners, and overlays
function hideOverlays() {
  const selectorsToHide = [
    '[class*="cookie"]',
    '[class*="Cookie"]',
    '[class*="consent"]',
    '[class*="Consent"]',
    '[class*="popup"]',
    '[class*="Popup"]',
    '[class*="modal"]',
    '[class*="Modal"]',
    '[class*="banner"]',
    '[class*="overlay"]',
    '[class*="newsletter"]',
    '[id*="cookie"]',
    '[id*="consent"]',
    '[id*="popup"]',
    '[id*="modal"]',
    '[aria-modal="true"]',
    '[role="dialog"]',
  ];

  selectorsToHide.forEach((selector) => {
    try {
      document.querySelectorAll(selector).forEach((el) => {
        const element = el as HTMLElement;
        const style = window.getComputedStyle(element);
        // Only hide if it's positioned fixed/sticky (likely an overlay)
        if (style.position === 'fixed' || style.position === 'sticky') {
          element.style.display = 'none';
        }
      });
    } catch {
      // Ignore selector errors
    }
  });

  // Remove any backdrop overlays
  document.querySelectorAll('[class*="backdrop"], [class*="overlay"]').forEach((el) => {
    const element = el as HTMLElement;
    const style = window.getComputedStyle(element);
    if (style.position === 'fixed' && parseFloat(style.opacity) < 1) {
      element.style.display = 'none';
    }
  });
}

// Runs in the page: detect sections using DOM analysis
function detectSections(vh: number) {
  interface RawSection {
    id: string;
    type: string;
    label: string;
    bounds: { x: number; y: number; width: number; height: number };
    confidence: number;
  }
  const sections: RawSection[] = [];

  const isVisible = (el: Element): boolean => {
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    return rect.width > 100 &&
           rect.height > 150 &&
           style.display !== 'none' &&
           style.visibility !== 'hidden' &&
           parseFloat(style.opacity) > 0.1;
  };

  const overlaps = (a: { y: number; height: number }, b: { y: number; height: number }): boolean => {
    const aTop = a.y;
    const aBottom = a.y + a.height;
    const bTop = b.y;
    const bBottom = b.y + b.height;
    const overlapStart = Math.max(aTop, bTop);
    const overlapEnd = Math.min(aBottom, bBottom);
    const overlapHeight = Math.max(0, overlapEnd - overlapStart);
    const smallerHeight = Math.min(a.height, b.height);
    return overlapHeight > smallerHeight * 0.7;
  };

  const isDuplicate = (bounds: { y: number; height: number }): boolean => {
    return sections.some(s => overlaps(s.bounds, bounds));
  };

  const classifySection = (el: Element, isFirstSection: boolean): { type: string; label: string; confidence: number } => {
    const text = (el.textContent || '').toLowerCase().slice(0, 1000);
    const className = (el.className || '').toString().toLowerCase();
    const id = (el.id || '').toLowerCase();
    const tagName = el.tagName.toLowerCase();
    const combined = `${className} ${id}`;

    if (isFirstSection) {
      return { type: 'hero', label: 'Hero Section', confidence: 0.95 };
    }
    if (/hero|banner|jumbotron|masthead|landing|intro/.test(combined)) {
      return { type: 'hero', label: 'Hero Section', confidence: 0.9 };
    }
    if (tagName === 'footer' || /footer/.test(combined)) {
      return { type: 'footer', label: 'Footer', confidence: 0.95 };
    }
    if (/copyright|©|\d{4}.*rights|legal/.test(text.slice(-200))) {
      return { type: 'footer', label: 'Footer', confidence: 0.85 };
    }
    if (/feature|benefit|service|solution|capability|what-we|why-/.test(combined)) {
      return { type: 'features', label: 'Features', confidence: 0.85 };
    }
    if (/pricing|price|plan|subscription|tier|package/.test(combined) ||
        /\$\d+|\€\d+|\/month|\/year|free tier/i.test(text)) {
      return { type: 'pricing', label: 'Pricing', confidence: 0.9 };
    }
    if (/testimonial|review|customer|quote|feedback|said|trust|logo/.test(combined)) {
      return { type: 'testimonials', label: 'Testimonials', confidence: 0.85 };
    }
    if (/cta|call-to-action|get-started|sign-?up|try-|start-|join|newsletter/.test(combined)) {
      return { type: 'cta', label: 'Call to Action', confidence: 0.8 };
    }
    return { type: 'content', label: 'Content Section', confidence: 0.5 };
  };

  const semanticSelectors = [
    'main > section',
    'main > article',
    '[role="main"] > section',
    'body > section',
    'body > div > section',
    '#root > section',
    '#app > section',
    '#__next > section',
    '#__next > div > section',
    '#__next > main > section',
    '#__next > main > div > section',
    'section[class]',
    '[class*="section-"]',
    '[class*="Section"]',
  ];

  const foundElements = new Set<Element>();

  semanticSelectors.forEach(selector => {
    try {
      document.querySelectorAll(selector).forEach(el => {
        if (isVisible(el) && !foundElements.has(el)) {
          foundElements.add(el);
        }
      });
    } catch {
      // Invalid selector, skip
    }
  });

  foundElements.forEach((el) => {
    const rect = el.getBoundingClientRect();
    const bounds = {
      x: Math.max(0, Math.round(rect.left)),
      y: Math.max(0, Math.round(rect.top + window.scrollY)),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };

    if (bounds.height < 200 || bounds.width < 300) return;
    if (isDuplicate(bounds)) return;

    const textLength = (el.textContent || '').trim().length;
    const hasMedia = el.querySelector('img, video, canvas, svg, iframe');
    if (textLength < 30 && !hasMedia) return;

    const isFirst = sections.length === 0 && bounds.y < vh;
    const classification = classifySection(el, isFirst);

    sections.push({
      id: `section-${sections.length}`,
      bounds,
      ...classification,
    });
  });

  // Fallback: viewport-based chunks if few sections found
  if (sections.length < 3) {
    const body = document.body;
    const totalHeight = Math.max(body.scrollHeight, document.documentElement.scrollHeight);
    const chunkHeight = Math.round(vh * 0.85);

    for (let y = 0; y < totalHeight; y += chunkHeight) {
      const height = Math.min(chunkHeight, totalHeight - y);
      if (height < 200) continue;

      const bounds = { y, height, x: 0, width: body.clientWidth };
      if (isDuplicate(bounds)) continue;

      const isFirst = sections.length === 0;
      const isLast = y + height >= totalHeight - 100;

      let type = 'content';
      let label = 'Content Section';
      let confidence = 0.5;

      if (isFirst) {
        type = 'hero';
        label = 'Hero Section';
        confidence = 0.8;
      } else if (isLast) {
        type = 'footer';
        label = 'Footer';
        confidence = 0.7;
      }

      sections.push({
        id: `section-${sections.length}`,
        bounds: { x: 0, y, width: body.clientWidth, height },
        type,
        label,
        confidence,
      });
    }
  }

  sections.sort((a, b) => a.bounds.y - b.bounds.y);

  const filtered: RawSection[] = [];
  for (const section of sections) {
    const overlapping = filtered.find(s => overlaps(s.bounds, section.bounds));
    if (!overlapping) {
      filtered.push(section);
    } else if (section.confidence > overlapping.confidence) {
      const idx = filtered.indexOf(overlapping);
      filtered[idx] = section;
    }
  }

  return filtered.map((s, i) => ({
    ...s,
    id: `section-${i}-${Date.now()}`,
    suggestedDuration: s.type === 'hero' ? 4000 :
                      s.type === 'cta' ? 2500 :
                      s.type === 'footer' ? 2000 : 3000,
  }));
}

// Groups sections into bands that each fit one screenshot. The first band starts at the
// top of the page so it also covers the page thumbnail.
function planBands(sections: RawSection[], pageHeight: number, viewport: CaptureViewport): Band[] {
  const maxHeight = Math.floor(MAX_BAND_PX / viewport.deviceScaleFactor);
  const thumbHeight = Math.ceil((PAGE_THUMB.maxHeight * viewport.width) / PAGE_THUMB.width);
  const bands: Band[] = [
    { top: 0, bottom: Math.max(1, Math.min(pageHeight, thumbHeight, maxHeight)), sections: [] },
  ];

  sections.forEach((section, index) => {
    const top = Math.max(0, section.bounds.y);
    const bottom = Math.min(section.bounds.y + section.bounds.height, pageHeight, top + maxHeight);
    if (bottom <= top) return;

    let band = bands[bands.length - 1];
    if (top < band.top || bottom - band.top > maxHeight) {
      band = { top, bottom, sections: [] };
      bands.push(band);
    }
    band.bottom = Math.max(band.bottom, bottom);
    band.sections.push(index);
  });

  return bands;
}

// Loads, prepares and screenshots the page. The browser is closed when this returns.
// `pinRule` maps the target host to the address the server vetted.
async function capturePage(
  target: URL,
  viewport: CaptureViewport,
  pinRule: string | null,
  progress: Progress,
  signal: AbortSignal
) {
  const browser = await launchBrowser(viewport, pinRule ? [pinRule, ...HARDENING_ARGS] : HARDENING_ARGS);
  // Closing the browser makes every pending page call fail, which ends the capture
  const close = () => {
    browser.close().catch(() => {});
  };
  signal.addEventListener('abort', close, { once: true });

  // Set when a response came from a non-public address despite the request checks
  let unsafeResponse = false;
  const checkpoint = () => {
    signal.throwIfAborted();
    if (unsafeResponse) throw new CaptureError(MESSAGES.badRequest);
  };

  let shot: { sections: RawSection[]; bands: Band[]; pageHeight: number };
  try {
    checkpoint();
    progress('connect', 8);

    const page = await browser.newPage();
    await page.setUserAgent({ userAgent: USER_AGENT });
    const guard = await guardPage(page, {
      trustedHosts: pinRule ? [target.hostname] : [],
      blockedUrlParts: BLOCKED_URL_PARTS,
      onUnsafeResponse: (url, ip) => {
        unsafeResponse = true;
        console.warn('Capture stopped, a response came from a non-public address:', ip, url.slice(0, 200));
        close();
      },
    });

    try {
      await page.goto(target.href, { waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT_MS, signal });
    } catch (error) {
      checkpoint();
      const message = !guard.blockedNavigation
        ? MESSAGES.unreachable
        : guard.blockedRedirect ? MESSAGES.blockedRedirect : MESSAGES.badRequest;
      throw new CaptureError(message, { cause: error });
    }
    progress('connect', 18);

    // Then the load event and a short quiet period on the network; neither is required
    await page
      .waitForFunction(() => document.readyState === 'complete', { timeout: LOAD_TIMEOUT_MS, polling: 100, signal })
      .catch(() => {});
    progress('connect', 24);
    await page.waitForNetworkIdle({ idleTime: 500, timeout: 5000, signal }).catch(() => {});
    checkpoint();
    progress('capture', 28);

    await scrollThroughPage(page, viewport.height, signal, (fraction) =>
      progress('capture', 28 + Math.round(fraction * 20))
    );

    // Wait for lazy-loaded images, background images and fonts
    await settle(page.evaluate(waitForAssets, ASSET_TIMEOUT_MS), ASSET_TIMEOUT_MS + 1000);
    checkpoint();
    progress('capture', 52);

    await page.evaluate(hideOverlays);

    // Disable animations for cleaner screenshots (best effort: a strict CSP refuses it)
    await page.addStyleTag({ content: NO_ANIMATIONS_CSS }).catch(() => {});

    // Let the page settle: two frames for the new styles, then a short network quiet period
    await page.evaluate(twoFrames);
    await page.waitForNetworkIdle({ idleTime: 300, timeout: 2000, signal }).catch(() => {});
    checkpoint();
    progress('analyze', 58);

    const detectedSections = (await page.evaluate(detectSections, viewport.height)) as RawSection[];

    // Get page dimensions
    const pageHeight = await page.evaluate(() =>
      Math.max(document.body?.scrollHeight ?? 0, document.documentElement.scrollHeight)
    );
    progress('analyze', 64);

    // Screenshot only what the sections and the page thumbnail need, reporting each band
    const sections = detectedSections.slice(0, MAX_SECTIONS);
    const bands = planBands(sections, pageHeight, viewport);
    for (const [index, band] of bands.entries()) {
      checkpoint();
      band.png = await page.screenshot({
        type: 'png',
        encoding: 'binary',
        optimizeForSpeed: true,
        captureBeyondViewport: true,
        clip: { x: 0, y: band.top, width: viewport.width, height: band.bottom - band.top },
      });
      progress('analyze', 64 + Math.round(((index + 1) / bands.length) * 6));
    }

    shot = { sections, bands, pageHeight };
  } catch (error) {
    // A browser closed on purpose fails whatever call was pending; report why it was closed
    checkpoint();
    throw error;
  } finally {
    signal.removeEventListener('abort', close);
    await browser.close().catch(() => {});
  }

  // Responses that arrived while the browser shut down have been seen by now
  checkpoint();
  return shot;
}

// Crops one section out of its band and encodes it, plus a small thumbnail for lists
async function renderSection(section: RawSection, band: DecodedBand, viewport: CaptureViewport): Promise<DetectedSection> {
  const { data, info, top: bandTop } = band;
  const scale = info.width / viewport.width;
  const left = Math.min(Math.max(0, Math.round(section.bounds.x * scale)), info.width - 1);
  const top = Math.min(Math.max(0, Math.round((section.bounds.y - bandTop) * scale)), info.height - 1);
  const width = Math.min(Math.round(section.bounds.width * scale), info.width - left);
  const height = Math.min(Math.round(section.bounds.height * scale), info.height - top);

  if (width < 100 || height < 100) {
    return { ...section };
  }

  try {
    const crop = () => sharp(data, { raw: info }).extract({ left, top, width, height });
    const [image, thumb] = await Promise.all([
      crop().webp(SECTION_WEBP).toBuffer(),
      crop()
        .resize(SECTION_THUMB.width, SECTION_THUMB.height, { fit: 'cover', position: 'top', kernel: 'lanczos3' })
        .webp(THUMB_WEBP)
        .toBuffer(),
    ]);

    return {
      ...section,
      thumbnail: toDataUrl(thumb),
      sectionImage: toDataUrl(image),
      pixelBounds: { x: left, y: Math.round(bandTop * scale) + top, width, height },
    };
  } catch (err) {
    console.error('Failed to generate section image:', err);
    return { ...section };
  }
}

// The top of the page, 600 px wide and at most 1200 px tall
async function renderPageThumbnail(band: DecodedBand, pageHeight: number, viewport: CaptureViewport): Promise<string> {
  const { data, info } = band;
  const scale = info.width / viewport.width;
  const height = Math.max(1, Math.min(PAGE_THUMB.maxHeight, Math.round(pageHeight * scale * (PAGE_THUMB.width / info.width))));
  const sourceHeight = Math.min(info.height, Math.ceil((height * info.width) / PAGE_THUMB.width));

  const thumbnail = await sharp(data, { raw: info })
    .extract({ left: 0, top: 0, width: info.width, height: sourceHeight })
    .resize(PAGE_THUMB.width, height, { fit: 'cover', position: 'top', kernel: 'lanczos3' })
    .webp(THUMB_WEBP)
    .toBuffer();
  return toDataUrl(thumbnail);
}

async function runCapture(
  target: URL,
  url: string,
  viewport: CaptureViewport,
  pinRule: string | null,
  send: (event: CaptureEvent) => void,
  signal: AbortSignal
) {
  const progress: Progress = (phase, value) => send({ type: 'progress', phase, progress: value });
  progress('connect', 2);

  const { sections, bands, pageHeight } = await capturePage(target, viewport, pinRule, progress, signal);

  // Each band is decoded once and its sections are cropped from the raw pixels.
  // Sections stream out as soon as they are encoded.
  const total = sections.length;
  const sent = new Set<number>();
  const sendSection = (index: number, section: DetectedSection) => {
    sent.add(index);
    send({ type: 'section', index, total, section });
    progress('detect', 72 + Math.round((sent.size / Math.max(1, total)) * 26));
  };
  progress('detect', 72);

  let thumbnail = '';
  let width = Math.round(viewport.width * viewport.deviceScaleFactor);
  for (const [bandIndex, band] of bands.entries()) {
    signal.throwIfAborted();
    if (!band.png) continue;
    const { data, info } = await sharp(band.png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    band.png = undefined;
    const decoded: DecodedBand = { data, info, top: band.top };

    if (bandIndex === 0) {
      width = info.width;
      thumbnail = await renderPageThumbnail(decoded, pageHeight, viewport);
    }

    await forEachLimit(band.sections, CROP_CONCURRENCY, async (index) => {
      const section = await renderSection(sections[index], decoded, viewport);
      signal.throwIfAborted();
      sendSection(index, section);
    });
  }

  // Sections outside every band (empty, or below the page) keep their data without images
  sections.forEach((section, index) => {
    if (!sent.has(index)) sendSection(index, { ...section });
  });

  send({
    type: 'done',
    page: {
      url,
      thumbnail,
      width,
      height: Math.round(pageHeight * (width / viewport.width)),
      pageHeight,
      deviceScaleFactor: viewport.deviceScaleFactor,
    },
  });
}

export async function POST(request: NextRequest) {
  const retryAfter = rateLimit(clientIp(request));
  if (retryAfter > 0) {
    return NextResponse.json(
      { error: MESSAGES.rateLimited },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } }
    );
  }

  let body: Partial<CaptureRequest> = {};
  try {
    const parsed: unknown = await request.json();
    if (parsed && typeof parsed === 'object') body = parsed as Partial<CaptureRequest>;
  } catch {
    // Not JSON; rejected below as a missing URL
  }

  const url = typeof body.url === 'string' ? body.url.trim() : '';
  const target = parseCaptureUrl(url);
  const address = target ? await resolvePublicAddress(target.hostname) : null;
  if (!target || !address) {
    return NextResponse.json({ error: MESSAGES.badRequest }, { status: 400 });
  }
  // Chromium connects to the vetted address for the target host, whatever DNS says later
  const pinRule = hostResolverRule(target.hostname, address);

  if (captureQueueIsFull()) {
    return NextResponse.json(
      { error: MESSAGES.busy },
      { status: 503, headers: { 'Retry-After': String(BUSY_RETRY_AFTER_S) } }
    );
  }

  const viewport: CaptureViewport = {
    width: Math.round(clamp(body.viewportWidth, 1440, 320, 2560)),
    height: Math.round(clamp(body.viewportHeight, 900, 480, 1600)),
    deviceScaleFactor: clamp(body.deviceScaleFactor, 2, 1, 2), // High DPI for crisp screenshots
  };

  // Stop working as soon as the client goes away
  const abort = new AbortController();
  const onClientGone = () => abort.abort();
  request.signal.addEventListener('abort', onClientGone, { once: true });
  if (request.signal.aborted) abort.abort();

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: CaptureEvent) => {
        if (abort.signal.aborted) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          abort.abort();
        }
      };

      // Wait for a capture slot; it is held until every image is encoded
      send({ type: 'progress', phase: 'connect', progress: 1 });
      acquireCaptureSlot(abort.signal)
        .then(() => runCapture(target, url, viewport, pinRule, send, abort.signal).finally(releaseCaptureSlot))
        .catch((error: unknown) => {
          if (abort.signal.aborted) {
            console.info('Capture cancelled by the client:', target.hostname);
            return;
          }
          console.error('Capture error:', error);
          send({ type: 'error', message: error instanceof CaptureError ? error.message : MESSAGES.failed });
        })
        .finally(() => {
          request.signal.removeEventListener('abort', onClientGone);
          try {
            controller.close();
          } catch {
            // Already closed by a cancelled reader
          }
        });
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': CAPTURE_CONTENT_TYPE,
      'Cache-Control': 'no-store',
    },
  });
}
