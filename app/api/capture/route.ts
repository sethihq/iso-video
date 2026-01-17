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
      args: chromium.default.args,
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
        '--font-render-hinting=none',
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

    const browser = await getBrowser();

    const page = await browser.newPage();

    // Set high-quality viewport
    await page.setViewport({
      width: viewportWidth,
      height: viewportHeight,
      deviceScaleFactor, // 2x for retina-quality
    });

    // Enable high-quality image rendering
    await page.emulateMediaFeatures([
      { name: 'prefers-reduced-motion', value: 'reduce' },
    ]);

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    // Wait for fonts and lazy-loaded content
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Detect sections using DOM analysis with improved deduplication
    const detectedSections = await page.evaluate((vh) => {
      interface RawSection {
        id: string;
        type: string;
        label: string;
        bounds: { x: number; y: number; width: number; height: number };
        confidence: number;
      }
      const sections: RawSection[] = [];

      // Helper to check if element is visible and significant
      const isVisible = (el: Element): boolean => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return rect.width > 100 &&
               rect.height > 150 &&
               style.display !== 'none' &&
               style.visibility !== 'hidden' &&
               parseFloat(style.opacity) > 0.1;
      };

      // Check if two bounds significantly overlap (more than 70%)
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

      // Check if bounds is already covered by existing section
      const isDuplicate = (bounds: { y: number; height: number }): boolean => {
        return sections.some(s => overlaps(s.bounds, bounds));
      };

      // Helper to classify section type
      const classifySection = (el: Element, isFirstSection: boolean): { type: string; label: string; confidence: number } => {
        const text = (el.textContent || '').toLowerCase().slice(0, 1000);
        const className = (el.className || '').toString().toLowerCase();
        const id = (el.id || '').toLowerCase();
        const tagName = el.tagName.toLowerCase();
        const combined = `${className} ${id}`;

        // Hero detection - first visible section or explicit markers
        if (isFirstSection) {
          return { type: 'hero', label: 'Hero Section', confidence: 0.95 };
        }
        if (/hero|banner|jumbotron|masthead|landing|intro/.test(combined)) {
          return { type: 'hero', label: 'Hero Section', confidence: 0.9 };
        }

        // Footer detection - check tag first
        if (tagName === 'footer' || /footer/.test(combined)) {
          return { type: 'footer', label: 'Footer', confidence: 0.95 };
        }
        if (/copyright|©|\d{4}.*rights|legal/.test(text.slice(-200))) {
          return { type: 'footer', label: 'Footer', confidence: 0.85 };
        }

        // Features detection
        if (/feature|benefit|service|solution|capability|what-we|why-/.test(combined)) {
          return { type: 'features', label: 'Features', confidence: 0.85 };
        }

        // Pricing detection
        if (/pricing|price|plan|subscription|tier|package/.test(combined) ||
            /\$\d+|\€\d+|\/month|\/year|free tier/i.test(text)) {
          return { type: 'pricing', label: 'Pricing', confidence: 0.9 };
        }

        // Testimonials detection
        if (/testimonial|review|customer|quote|feedback|said|trust|logo/.test(combined)) {
          return { type: 'testimonials', label: 'Testimonials', confidence: 0.85 };
        }

        // CTA detection
        if (/cta|call-to-action|get-started|sign-?up|try-|start-|join|newsletter/.test(combined)) {
          return { type: 'cta', label: 'Call to Action', confidence: 0.8 };
        }

        // Default to content with a descriptive label
        return { type: 'content', label: 'Content Section', confidence: 0.5 };
      };

      // Strategy 1: Find semantic section elements (prioritize these)
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

      // Process found elements
      foundElements.forEach((el) => {
        const rect = el.getBoundingClientRect();
        const bounds = {
          x: Math.max(0, Math.round(rect.left)),
          y: Math.max(0, Math.round(rect.top + window.scrollY)),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };

        // Skip if too small
        if (bounds.height < 200 || bounds.width < 300) return;

        // Skip if this region is already covered
        if (isDuplicate(bounds)) return;

        // Skip sections that are mostly empty
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

      // Strategy 2: If we found very few sections, use viewport-based chunks
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

      // Sort by vertical position
      sections.sort((a, b) => a.bounds.y - b.bounds.y);

      // Remove any remaining overlapping sections (keep higher confidence)
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

      // Assign final IDs and durations
      return filtered.map((s, i) => ({
        ...s,
        id: `section-${i}-${Date.now()}`,
        suggestedDuration: s.type === 'hero' ? 4000 :
                          s.type === 'cta' ? 2500 :
                          s.type === 'footer' ? 2000 : 3000,
      }));
    }, viewportHeight) as DetectedSection[];

    // Get page dimensions for accurate scaling
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

    // Scale factor from viewport to actual screenshot pixels
    const scaleX = imgWidth / viewportWidth;
    const scaleY = imgHeight / pageHeight;

    // Create high-quality page thumbnail (for preview in UI)
    const thumbnail = await sharp(imageBuffer)
      .resize(600, Math.min(1200, Math.round(imgHeight * (600 / imgWidth))), {
        fit: 'cover',
        position: 'top',
        kernel: 'lanczos3', // High-quality downscaling
      })
      .png({ quality: 100, compressionLevel: 6 })
      .toBuffer();

    // Generate high-quality section images
    const sectionsWithThumbnails = await Promise.all(
      detectedSections.slice(0, 10).map(async (section) => {
        try {
          // Scale bounds to match actual screenshot dimensions
          const scaledBounds = {
            left: Math.round(section.bounds.x * scaleX),
            top: Math.round(section.bounds.y * scaleY),
            width: Math.round(section.bounds.width * scaleX),
            height: Math.round(section.bounds.height * scaleY),
          };

          // Clamp bounds to image dimensions
          const safeLeft = Math.max(0, Math.min(scaledBounds.left, imgWidth - 10));
          const safeTop = Math.max(0, Math.min(scaledBounds.top, imgHeight - 10));
          const safeWidth = Math.max(100, Math.min(scaledBounds.width, imgWidth - safeLeft));
          const safeHeight = Math.max(100, Math.min(scaledBounds.height, imgHeight - safeTop));

          if (safeWidth < 100 || safeHeight < 100) {
            return { ...section, thumbnail: undefined, sectionImage: undefined };
          }

          // Extract full-resolution section image
          const sectionCrop = await sharp(imageBuffer)
            .extract({
              left: safeLeft,
              top: safeTop,
              width: safeWidth,
              height: safeHeight,
            })
            .png({ quality: 100, compressionLevel: 6 })
            .toBuffer();

          // Create smaller thumbnail for list preview
          const sectionThumb = await sharp(sectionCrop)
            .resize(400, 250, {
              fit: 'cover',
              position: 'top',
              kernel: 'lanczos3',
            })
            .png({ quality: 100, compressionLevel: 6 })
            .toBuffer();

          return {
            ...section,
            thumbnail: `data:image/png;base64,${sectionThumb.toString('base64')}`,
            // Store full section image for video rendering
            sectionImage: `data:image/png;base64,${sectionCrop.toString('base64')}`,
            // Store actual pixel dimensions
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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Capture failed' },
      { status: 500 }
    );
  }
}
