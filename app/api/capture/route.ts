import { NextRequest, NextResponse } from 'next/server';
import puppeteer from 'puppeteer-core';
import sharp from 'sharp';

// Chromium binary URL for serverless (must match chromium-min version)
const CHROMIUM_URL = 'https://github.com/Sparticuz/chromium/releases/download/v131.0.1/chromium-v131.0.1-pack.tar';

// Get browser executable path based on environment
const getBrowser = async () => {
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    // Serverless environment - use @sparticuz/chromium-min
    const chromium = await import('@sparticuz/chromium-min');
    return puppeteer.launch({
      args: [
        ...chromium.default.args,
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
        '--font-render-hinting=none',
      ],
      executablePath: await chromium.default.executablePath(CHROMIUM_URL),
      headless: true,
    });
  } else {
    // Local development - use system Chrome
    const executablePath = process.platform === 'darwin'
      ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
      : process.platform === 'win32'
      ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
      : '/usr/bin/google-chrome';

    return puppeteer.launch({
      headless: true,
      executablePath,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
        '--font-render-hinting=none',
        '--disable-gpu',
      ],
    });
  }
};

interface CaptureRequest {
  url: string;
  viewportWidth?: number;
  viewportHeight?: number;
  deviceScaleFactor?: number;
}

interface DetectedSection {
  id: string;
  type: 'hero' | 'features' | 'pricing' | 'testimonials' | 'cta' | 'footer' | 'content';
  label: string;
  confidence: number;
  bounds: { x: number; y: number; width: number; height: number };
  suggestedDuration: number;
}

export async function POST(request: NextRequest) {
  let browser = null;

  try {
    const body: CaptureRequest = await request.json();
    const {
      url,
      viewportWidth = 1440,
      viewportHeight = 900,
      deviceScaleFactor = 2  // High DPI for crisp screenshots
    } = body;

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    browser = await getBrowser();
    const page = await browser.newPage();

    // Set a realistic user agent
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Set high-quality viewport
    await page.setViewport({
      width: viewportWidth,
      height: viewportHeight,
      deviceScaleFactor,
    });

    // Block unnecessary resources to speed up loading
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const resourceType = req.resourceType();
      // Block ads and tracking but allow everything else
      if (
        req.url().includes('google-analytics') ||
        req.url().includes('googletagmanager') ||
        req.url().includes('facebook.com/tr') ||
        req.url().includes('doubleclick.net')
      ) {
        req.abort();
      } else {
        req.continue();
      }
    });

    // Navigate to the page
    await page.goto(url, {
      waitUntil: 'networkidle0',
      timeout: 60000
    });

    // Wait for initial content
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Scroll through the entire page to trigger lazy-loaded content
    await page.evaluate(async () => {
      const totalHeight = Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight
      );
      const viewportHeight = window.innerHeight;
      let scrolled = 0;

      while (scrolled < totalHeight) {
        window.scrollTo(0, scrolled);
        scrolled += viewportHeight * 0.8;
        await new Promise((resolve) => setTimeout(resolve, 150));
      }

      // Scroll back to top
      window.scrollTo(0, 0);
    });

    // Wait for lazy-loaded images to load
    await page.evaluate(async () => {
      // Wait for all images to load
      const images = Array.from(document.querySelectorAll('img'));
      await Promise.all(
        images.map((img) => {
          if (img.complete) return Promise.resolve();
          return new Promise((resolve) => {
            img.addEventListener('load', resolve);
            img.addEventListener('error', resolve);
            // Timeout after 5 seconds per image
            setTimeout(resolve, 5000);
          });
        })
      );

      // Wait for background images by checking computed styles
      const elements = document.querySelectorAll('*');
      const bgImagePromises: Promise<void>[] = [];

      elements.forEach((el) => {
        const style = window.getComputedStyle(el);
        const bgImage = style.backgroundImage;
        if (bgImage && bgImage !== 'none' && bgImage.includes('url(')) {
          const urlMatch = bgImage.match(/url\(["']?([^"')]+)["']?\)/);
          if (urlMatch) {
            const img = new Image();
            bgImagePromises.push(
              new Promise((resolve) => {
                img.onload = () => resolve();
                img.onerror = () => resolve();
                setTimeout(() => resolve(), 3000);
                img.src = urlMatch[1];
              })
            );
          }
        }
      });

      await Promise.all(bgImagePromises);
    });

    // Wait for fonts to load
    await page.evaluate(async () => {
      if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
      }
    });

    // Hide common popups, banners, and overlays
    await page.evaluate(() => {
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
    });

    // Disable animations for cleaner screenshots
    await page.addStyleTag({
      content: `
        *, *::before, *::after {
          animation-duration: 0s !important;
          animation-delay: 0s !important;
          transition-duration: 0s !important;
          transition-delay: 0s !important;
        }
      `,
    });

    // Final wait for any remaining content
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Detect sections using DOM analysis
    const detectedSections = await page.evaluate((vh) => {
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
    }, viewportHeight) as DetectedSection[];

    // Get page dimensions
    const pageHeight = await page.evaluate(() =>
      Math.max(document.body.scrollHeight, document.documentElement.scrollHeight)
    );

    // Take high-quality full-page screenshot
    const fullPageScreenshot = await page.screenshot({
      fullPage: true,
      encoding: 'base64',
      type: 'png',
      captureBeyondViewport: true,
    });

    const imageBuffer = Buffer.from(fullPageScreenshot, 'base64');
    const metadata = await sharp(imageBuffer).metadata();

    const imgWidth = metadata.width || viewportWidth * deviceScaleFactor;
    const imgHeight = metadata.height || viewportHeight * deviceScaleFactor;

    const scaleX = imgWidth / viewportWidth;
    const scaleY = imgHeight / pageHeight;

    // Create high-quality page thumbnail
    const thumbnail = await sharp(imageBuffer)
      .resize(600, Math.min(1200, Math.round(imgHeight * (600 / imgWidth))), {
        fit: 'cover',
        position: 'top',
        kernel: 'lanczos3',
      })
      .png({ compressionLevel: 6 })
      .toBuffer();

    // Generate high-quality section images
    const sectionsWithThumbnails = await Promise.all(
      detectedSections.slice(0, 10).map(async (section) => {
        try {
          const scaledBounds = {
            left: Math.round(section.bounds.x * scaleX),
            top: Math.round(section.bounds.y * scaleY),
            width: Math.round(section.bounds.width * scaleX),
            height: Math.round(section.bounds.height * scaleY),
          };

          const safeLeft = Math.max(0, Math.min(scaledBounds.left, imgWidth - 10));
          const safeTop = Math.max(0, Math.min(scaledBounds.top, imgHeight - 10));
          const safeWidth = Math.max(100, Math.min(scaledBounds.width, imgWidth - safeLeft));
          const safeHeight = Math.max(100, Math.min(scaledBounds.height, imgHeight - safeTop));

          if (safeWidth < 100 || safeHeight < 100) {
            return { ...section, thumbnail: undefined, sectionImage: undefined };
          }

          const sectionCrop = await sharp(imageBuffer)
            .extract({
              left: safeLeft,
              top: safeTop,
              width: safeWidth,
              height: safeHeight,
            })
            .png({ compressionLevel: 6 })
            .toBuffer();

          const sectionThumb = await sharp(sectionCrop)
            .resize(400, 250, {
              fit: 'cover',
              position: 'top',
              kernel: 'lanczos3',
            })
            .png({ compressionLevel: 6 })
            .toBuffer();

          return {
            ...section,
            thumbnail: `data:image/png;base64,${sectionThumb.toString('base64')}`,
            sectionImage: `data:image/png;base64,${sectionCrop.toString('base64')}`,
            pixelBounds: {
              x: safeLeft,
              y: safeTop,
              width: safeWidth,
              height: safeHeight,
            },
          };
        } catch (err) {
          console.error('Failed to generate section image:', err);
          return { ...section, thumbnail: undefined, sectionImage: undefined };
        }
      })
    );

    await browser.close();
    browser = null;

    return NextResponse.json({
      url,
      fullPageImage: `data:image/png;base64,${fullPageScreenshot}`,
      thumbnail: `data:image/png;base64,${thumbnail.toString('base64')}`,
      width: imgWidth,
      height: imgHeight,
      pageHeight,
      deviceScaleFactor,
      sections: sectionsWithThumbnails,
    });
  } catch (error) {
    console.error('Capture error:', error);
    if (browser) {
      try {
        await browser.close();
      } catch {
        // Ignore close errors
      }
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Capture failed' },
      { status: 500 }
    );
  }
}
