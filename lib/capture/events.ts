// Wire format of /api/capture: newline-delimited JSON, one event per line
import type { DetectedSection } from '@/lib/types';

export const CAPTURE_CONTENT_TYPE = 'application/x-ndjson';

// Desktop window widths a capture can use, in CSS px. The first is the default.
export const CAPTURE_WIDTHS = [1440, 1280] as const;
export type CaptureWidth = (typeof CAPTURE_WIDTHS)[number];

// Matches the phase ids shown by the URL panel, in order
export type CapturePhase = 'connect' | 'capture' | 'analyze' | 'detect';

// Page metadata sent once every section has streamed
export interface CaptureSummary {
  url: string;
  thumbnail: string;          // WebP data URL of the top of the page
  width: number;              // Screenshot width in device pixels
  height: number;             // Full page height in device pixels
  pageHeight: number;         // Full page height in CSS pixels
  deviceScaleFactor: number;
}

export type CaptureEvent =
  | { type: 'progress'; phase: CapturePhase; progress: number } // progress is 0-100
  | { type: 'section'; index: number; total: number; section: DetectedSection }
  | { type: 'done'; page: CaptureSummary }
  | { type: 'error'; message: string };
