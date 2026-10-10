// Browser-side helpers for reading /api/capture responses
import { CAPTURE_CONTENT_TYPE, type CaptureEvent } from './events';

// A failure whose message is safe to show to the user as is
export class CaptureFailure extends Error {}

export function isCaptureStream(response: Response): boolean {
  return response.headers.get('content-type')?.startsWith(CAPTURE_CONTENT_TYPE) ?? false;
}

// The server's generic { error } message, read only when the body is JSON
export async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  if (!response.headers.get('content-type')?.includes('application/json')) return fallback;
  try {
    const data: unknown = await response.json();
    if (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string') {
      return data.error;
    }
  } catch {
    // Malformed body, use the fallback
  }
  return fallback;
}

// Yields one event per NDJSON line as the body streams in
export async function* readCaptureEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<CaptureEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      // stream: true keeps multi-byte characters split across chunks intact
      const lines = (buffer + decoder.decode(value, { stream: true })).split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (line.trim()) yield JSON.parse(line) as CaptureEvent;
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) yield JSON.parse(buffer) as CaptureEvent;
  } finally {
    // Also runs when the caller stops early, which releases the connection
    reader.cancel().catch(() => {});
  }
}
