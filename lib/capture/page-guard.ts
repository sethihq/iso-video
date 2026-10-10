// Server-only: keeps a captured page away from internal addresses. Requests are checked
// before they leave, responses after they arrive, and network APIs that request
// interception never sees are switched off.
import { isIP } from 'node:net';
import type { HTTPRequest, HTTPResponse, Page } from 'puppeteer-core';
import { createRequestGuard, isBlockedAddress } from './url-guard';

// WebRTC may only use proxied UDP, and a capture has no proxy
export const HARDENING_ARGS = ['--force-webrtc-ip-handling-policy=disable_non_proxied_udp'];

// Pins a host to the address the server vetted, so Chromium cannot resolve it to an
// internal one later (DNS rebinding). IP literals need no rule.
export function hostResolverRule(hostname: string, address: string): string | null {
  if (hostname.startsWith('[') || isIP(hostname)) return null;
  if (!/^[a-z0-9._-]+$/.test(hostname)) throw new Error(`Unexpected host name: ${hostname}`);
  return `--host-resolver-rules=MAP ${hostname} ${isIP(address) === 6 ? `[${address}]` : address}`;
}

// Runs in every new document before its own scripts
function removeUnguardedApis() {
  for (const name of ['WebSocket', 'WebTransport', 'RTCPeerConnection', 'webkitRTCPeerConnection']) {
    try {
      delete (window as unknown as Record<string, unknown>)[name];
    } catch {
      // Keep going if one refuses
    }
  }
}

export interface PageGuard {
  blockedNavigation: boolean; // A main-frame navigation was refused
  blockedRedirect: boolean;   // ...and it came from a redirect
}

interface PageGuardOptions {
  trustedHosts: string[];     // Pinned to a vetted address, so no lookup is needed
  blockedUrlParts: string[];  // Dropped without a check (ads, tracking)
  onUnsafeResponse: (url: string, ip: string) => void;
}

export async function guardPage(page: Page, options: PageGuardOptions): Promise<PageGuard> {
  const state: PageGuard = { blockedNavigation: false, blockedRedirect: false };
  const isAllowed = createRequestGuard(options.trustedHosts);

  // A service worker could answer page requests without passing the request guard
  await page.setBypassServiceWorker(true);
  await page.evaluateOnNewDocument(removeUnguardedApis);

  // WebSocket handshakes skip request interception, so they are refused outright
  const session = await page.createCDPSession();
  await session.send('Network.enable');
  await session.send('Network.setBlockedURLs', {
    urlPatterns: [
      { urlPattern: 'ws://*:*/*', block: true },
      { urlPattern: 'wss://*:*/*', block: true },
    ],
  });

  // Every request is checked, not only the first navigation: redirects, iframes and
  // subresources could otherwise reach internal addresses
  await page.setRequestInterception(true);
  page.on('request', async (request: HTTPRequest) => {
    try {
      const url = request.url();
      if (options.blockedUrlParts.some((part) => url.includes(part))) {
        await request.abort('blockedbyclient');
      } else if (await isAllowed(url)) {
        await request.continue();
      } else {
        if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
          state.blockedNavigation = true;
          state.blockedRedirect = request.redirectChain().length > 0;
        }
        console.warn('Capture blocked a request to a non-public address:', url.slice(0, 200));
        await request.abort('blockedbyclient');
      }
    } catch {
      // Already handled, or the page closed
    }
  });

  // Chromium resolves hosts again after the check above, so a host can still reach an
  // internal address (DNS rebinding). Responses without an address (cache, data URLs) pass.
  page.on('response', (response: HTTPResponse) => {
    const ip = response.remoteAddress().ip;
    if (ip && isBlockedAddress(ip)) options.onUnsafeResponse(response.url(), ip);
  });

  return state;
}
