import { NextRequest, NextResponse } from 'next/server';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import sharp from 'sharp';
import type { DetectedSection, SectionKind } from '@/lib/types';
import { CAPTURE_CONTENT_TYPE, CAPTURE_WIDTHS, type CaptureEvent, type CapturePhase } from '@/lib/capture/events';
import { HARDENING_ARGS, guardPage, hostResolverRule } from '@/lib/capture/page-guard';
import { parseCaptureUrl, resolvePublicAddress } from '@/lib/capture/url-guard';

export const runtime = 'nodejs';
// Seconds. Long pages on small serverless CPUs can need well over a minute.
export const maxDuration = 300;

// Chromium binary URL for serverless (must match chromium-min version)
const CHROMIUM_URL = 'https://github.com/Sparticuz/chromium/releases/download/v153.0.0/chromium-v153.0.0-pack.x64.tar';

// A current desktop Chrome, so sites don't show outdated-browser warnings
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36';

// Every wait is bounded
const NAVIGATION_TIMEOUT_MS = 30_000; // Until DOMContentLoaded
const LOAD_TIMEOUT_MS = 10_000;       // Then the load event, best effort
const SCROLL_BUDGET_MS = 8000;        // Lazy-load scroll
const ASSET_TIMEOUT_MS = 5000;        // Images, background images and fonts
const SCREEN_IMAGE_TIMEOUT_MS = 3000; // Images in the window, at each screen
const SCREEN_SETTLE = { quietMs: 200, maxMs: 1500 }; // Animations, at each screen
const PROTOCOL_TIMEOUT_MS = 60_000;   // Any single DevTools call

// Each screen is the browser window at a desktop width, 16:10, captured at 2x so text
// stays sharp when a screen fills the video
const SCREEN_ASPECT = 16 / 10;
const DEVICE_SCALE_FACTOR = 2;
const MAX_SCREENS = 10;
// Section tops closer than this (a fraction of the window height) share a screen
const MIN_SCREEN_GAP = 0.5;
// Stretches longer than this with no section top get evenly spaced screens of their own
const MAX_SCREEN_GAP = 1.5;
// Anything pinned to the top that is taller than this is not a header
const MAX_HEADER_PX = 160;
// Lossy q90 with sharp YUV subsampling: on nextjs.org text showed no visible change at
// 4x zoom, at about a quarter of the PNG size. Lossless was 2.2x larger and 3x slower.
const SCREEN_WEBP = { quality: 90, smartSubsample: true };
const THUMB_WEBP = { quality: 80, smartSubsample: true };
const PAGE_THUMB_WIDTH = 600;
const SCREEN_THUMB = { width: 400, height: 250 };

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

interface CaptureRequest {
  url: string;
  viewportWidth?: number; // One of CAPTURE_WIDTHS
}

interface CaptureViewport {
  width: number;
  height: number;
  deviceScaleFactor: number;
}

// A detected section and the element it was found on (null for evenly spaced fallbacks)
type RawSection = Omit<DetectedSection, 'thumbnail' | 'sectionImage' | 'pixelBounds'> & {
  anchor: string | null;
};

// One screen to capture: where to scroll, and the section it is labelled with
interface Stop {
  y: number;              // Planned scroll position, CSS px
  anchor: string | null;  // Section element to line up with when the screen is taken
  section: RawSection;
  placeholder: boolean;   // Labels made up here rather than detected
}

interface EncodedScreen {
  image: string;          // WebP data URLs
  thumbnail: string;
  pageThumbnail: string | null;
  width: number;          // Device px
  height: number;
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

// Runs in the page: waits until the images in the window have loaded and decoded
async function waitForVisibleImages(timeoutMs: number) {
  const visible = Array.from(document.images).filter((img) => {
    const rect = img.getBoundingClientRect();
    return rect.width > 0 && rect.bottom > 0 && rect.top < window.innerHeight;
  });
  await Promise.race([
    Promise.all(visible.map((img) => img.decode().catch(() => {}))),
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

// Runs in the page: lets the window finish animating at its scroll position. Finite CSS
// and Web Animations jump to their end state; script-driven ones get until classes and
// inline styles stop changing for `quietMs`, at most `maxMs`.
function settleView({ quietMs, maxMs }: { quietMs: number; maxMs: number }): Promise<void> {
  const finishAnimations = () => {
    for (const animation of document.getAnimations()) {
      try {
        // Infinite and scroll-driven animations have no end time to jump to
        if (Number.isFinite(Number(animation.effect?.getComputedTiming().endTime))) animation.finish();
      } catch {
        // Keep going if one refuses
      }
    }
  };

  return new Promise((resolve) => {
    let quietTimer: ReturnType<typeof setTimeout> | undefined;
    const done = () => {
      clearTimeout(quietTimer);
      clearTimeout(limitTimer);
      observer.disconnect();
      finishAnimations();
      // Two frames so the end state is painted, or 250 ms if frames are throttled
      const fallback = setTimeout(resolve, 250);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        clearTimeout(fallback);
        resolve();
      }));
    };
    const onChange = () => {
      finishAnimations();
      clearTimeout(quietTimer);
      quietTimer = setTimeout(done, quietMs);
    };
    const observer = new MutationObserver(onChange);
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class', 'style'],
    });
    const limitTimer = setTimeout(done, maxMs);
    onChange();
  });
}

// Runs in the page: how far a fixed or sticky header reaches down the window
function pinnedHeaderHeight(maxHeight: number): number {
  let bottom = 0;
  for (const x of [0.25, 0.5, 0.75]) {
    for (let el = document.elementFromPoint(window.innerWidth * x, 2); el && el !== document.body; el = el.parentElement) {
      const position = window.getComputedStyle(el).position;
      if (position !== 'fixed' && position !== 'sticky') continue;
      const rect = el.getBoundingClientRect();
      if (rect.top <= 1 && rect.height <= maxHeight && rect.width >= window.innerWidth / 2) {
        bottom = Math.max(bottom, rect.bottom);
      }
      break;
    }
  }
  return bottom;
}

// Runs in the page: puts a section's top just below the pinned header, or scrolls to `y`.
// Returns where the page ended up, since scrolling stops at the end of the page.
function scrollToStop({ anchor, y, offset }: { anchor: string | null; y: number; offset: number }): number {
  const section = anchor ? document.querySelector(`[data-iso-section="${anchor}"]`) : null;
  const top = section ? section.getBoundingClientRect().top + window.scrollY - offset : y;
  window.scrollTo({ top: Math.max(0, Math.round(top)), behavior: 'instant' });
  return window.scrollY;
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
    '[class*="intercom"]',
    '[class*="crisp-client"]',
    '[id*="intercom"]',
    '[id*="hubspot-messages"]',
    '[id*="drift-"]',
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
    anchor: string | null;
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

    // Marks the element, so its screen can line up with it after late layout shifts
    const anchor = String(sections.length);
    el.setAttribute('data-iso-section', anchor);

    sections.push({
      id: `section-${sections.length}`,
      bounds,
      anchor,
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
        anchor: null,
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

const durationFor = (type: SectionKind) => (type === 'hero' ? 4000 : type === 'footer' ? 2000 : 3000);

function placeholderSection(type: SectionKind, label: string, y: number): RawSection {
  return {
    id: `section-${type}-${y}-${Date.now()}`,
    type,
    label,
    confidence: 0.5,
    bounds: { x: 0, y: 0, width: 0, height: 0 },
    suggestedDuration: durationFor(type),
    anchor: null,
  };
}

// At most `max` items, evenly spread; from two up it keeps the first and the last
function spread<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items;
  if (max === 1) return [items[Math.floor(items.length / 2)]];
  return Array.from({ length: max }, (_, i) => items[Math.round((i * (items.length - 1)) / (max - 1))]);
}

// Picks the scroll positions to capture: the top of the page, each section's top just below
// the pinned header, and the end of the page. Section tops close together share a screen,
// and long stretches between them get filler screens, which are dropped first when there
// are too many.
function planStops(sections: RawSection[], pageHeight: number, viewport: CaptureViewport, headerOffset: number): Stop[] {
  const maxScroll = Math.max(0, pageHeight - viewport.height);
  const minGap = viewport.height * MIN_SCREEN_GAP;
  const stops: Stop[] = [{ y: 0, anchor: null, section: placeholderSection('hero', 'Hero Section', 0), placeholder: true }];

  for (const section of [...sections].sort((a, b) => a.bounds.y - b.bounds.y)) {
    const y = Math.min(maxScroll, Math.max(0, section.bounds.y - headerOffset));
    const last = stops[stops.length - 1];
    if (y - last.y >= minGap) {
      stops.push({ y, anchor: section.anchor, section, placeholder: false });
    } else if (last.placeholder) {
      // The screen keeps its position and takes the detected section's labels
      last.section = section;
      last.placeholder = false;
    }
  }

  if (maxScroll - stops[stops.length - 1].y >= minGap) {
    stops.push({ y: maxScroll, anchor: null, section: placeholderSection('footer', 'Footer', maxScroll), placeholder: true });
  }

  const filled: Stop[] = [stops[0]];
  const fillers = new Set<Stop>();
  for (let i = 1; i < stops.length; i++) {
    const from = stops[i - 1].y;
    const gap = stops[i].y - from;
    const extra = gap > viewport.height * MAX_SCREEN_GAP ? Math.round(gap / viewport.height) - 1 : 0;
    for (let k = 1; k <= extra; k++) {
      const y = Math.round(from + (gap * k) / (extra + 1));
      const filler = { y, anchor: null, section: placeholderSection('content', 'Content Section', y), placeholder: true };
      fillers.add(filler);
      filled.push(filler);
    }
    filled.push(stops[i]);
  }

  const excess = Math.min(filled.length - MAX_SCREENS, fillers.size);
  const dropped = new Set(excess > 0 ? spread([...fillers], excess) : []);
  return spread(filled.filter((stop) => !dropped.has(stop)), MAX_SCREENS);
}

// The height of a header pinned to the top of the window once the page has scrolled
async function measureHeader(page: Page, viewport: CaptureViewport, pageHeight: number): Promise<number> {
  const probe = Math.min(viewport.height, pageHeight - viewport.height);
  if (probe <= 0) return 0;
  await page.evaluate(scrollToStop, { anchor: null, y: probe, offset: 0 });
  await page.evaluate(twoFrames);
  const height = await page.evaluate(pinnedHeaderHeight, MAX_HEADER_PX);
  return Math.round(Math.min(MAX_HEADER_PX, Math.max(0, height)));
}

// Encodes one screenshot at full size, a thumbnail for lists, and on request the page thumbnail
async function encodeScreen(png: Uint8Array, withPageThumbnail: boolean): Promise<EncodedScreen> {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const raw = () => sharp(data, { raw: info });
  const [image, thumbnail, pageThumbnail] = await Promise.all([
    raw().webp(SCREEN_WEBP).toBuffer(),
    raw()
      .resize(SCREEN_THUMB.width, SCREEN_THUMB.height, { fit: 'cover', position: 'top', kernel: 'lanczos3' })
      .webp(THUMB_WEBP)
      .toBuffer(),
    withPageThumbnail ? raw().resize({ width: PAGE_THUMB_WIDTH, kernel: 'lanczos3' }).webp(THUMB_WEBP).toBuffer() : null,
  ]);
  return {
    image: toDataUrl(image),
    thumbnail: toDataUrl(thumbnail),
    pageThumbnail: pageThumbnail && toDataUrl(pageThumbnail),
    width: info.width,
    height: info.height,
  };
}

function toScreenSection(section: RawSection, scrollY: number, viewport: CaptureViewport, screen: EncodedScreen): DetectedSection {
  return {
    id: section.id,
    type: section.type,
    label: section.label,
    confidence: section.confidence,
    suggestedDuration: section.suggestedDuration,
    bounds: { x: 0, y: scrollY, width: viewport.width, height: viewport.height },
    thumbnail: screen.thumbnail,
    sectionImage: screen.image,
    pixelBounds: {
      x: 0,
      y: Math.round(scrollY * viewport.deviceScaleFactor),
      width: screen.width,
      height: screen.height,
    },
  };
}

// Loads the page and takes one browser-window screenshot per screen, scrolled to where a
// visitor would see it, so sticky headers, lazy images and scroll animations look as they
// do in a browser. The browser is closed when this returns.
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

  let shot: { sections: DetectedSection[]; thumbnail: string; pageHeight: number };
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
    progress('analyze', 52);

    await page.evaluate(hideOverlays);
    const detected = (await page.evaluate(detectSections, viewport.height)) as RawSection[];
    const pageHeight = await page.evaluate(() =>
      Math.max(document.body?.scrollHeight ?? 0, document.documentElement.scrollHeight)
    );
    const headerOffset = await measureHeader(page, viewport, pageHeight);
    const stops = planStops(detected, pageHeight, viewport, headerOffset);
    checkpoint();
    progress('analyze', 60);

    const sections: DetectedSection[] = [];
    let thumbnail = '';
    for (const [index, stop] of stops.entries()) {
      checkpoint();
      const scrollY = await page.evaluate(scrollToStop, { anchor: stop.anchor, y: stop.y, offset: headerOffset });
      await settle(page.evaluate(settleView, SCREEN_SETTLE), SCREEN_SETTLE.maxMs + 1000);
      await settle(page.evaluate(waitForVisibleImages, SCREEN_IMAGE_TIMEOUT_MS), SCREEN_IMAGE_TIMEOUT_MS + 1000);
      // Cookie banners and chat bubbles can show up late
      await settle(page.evaluate(hideOverlays), 1000);
      checkpoint();

      const png = await page.screenshot({ type: 'png', encoding: 'binary', optimizeForSpeed: true });
      const screen = await encodeScreen(png, index === 0);
      thumbnail ||= screen.pageThumbnail ?? '';
      sections.push(toScreenSection(stop.section, scrollY, viewport, screen));
      progress('detect', 64 + Math.round(((index + 1) / stops.length) * 32));
    }

    shot = { sections, thumbnail, pageHeight };
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

  const { sections, thumbnail, pageHeight } = await capturePage(target, viewport, pinRule, progress, signal);

  // Screens go out only once the browser is closed and every response has been checked
  const width = Math.round(viewport.width * viewport.deviceScaleFactor);
  sections.forEach((section, index) => send({ type: 'section', index, total: sections.length, section }));
  send({
    type: 'done',
    page: {
      url,
      thumbnail,
      width,
      height: Math.round(pageHeight * viewport.deviceScaleFactor),
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

  const width = CAPTURE_WIDTHS.find((option) => option === body.viewportWidth) ?? CAPTURE_WIDTHS[0];
  const viewport: CaptureViewport = {
    width,
    height: Math.round(width / SCREEN_ASPECT),
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
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
