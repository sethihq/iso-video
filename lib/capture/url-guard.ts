// Server-only SSRF guard for /api/capture: the entered URL and every request the
// captured page makes must resolve to public addresses only.
import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

const MAX_URL_LENGTH = 2048;
const DNS_TIMEOUT_MS = 5000;

// Loopback, private, shared (CGNAT), link-local, multicast and reserved space
const blockedRanges = new BlockList();
const BLOCKED_IPV4: [string, number][] = [
  ['0.0.0.0', 8],       // "this network"
  ['10.0.0.0', 8],      // private
  ['100.64.0.0', 10],   // CGNAT, includes Alibaba Cloud metadata (100.100.100.200)
  ['127.0.0.0', 8],     // loopback
  ['169.254.0.0', 16],  // link-local, includes AWS/GCP/Azure metadata (169.254.169.254)
  ['172.16.0.0', 12],   // private
  ['192.0.0.0', 24],    // IETF protocol assignments, includes Oracle Cloud metadata
  ['192.168.0.0', 16],  // private
  ['224.0.0.0', 4],     // multicast
  ['240.0.0.0', 4],     // reserved and broadcast
];
const BLOCKED_IPV6: [string, number][] = [
  ['::', 128],          // unspecified
  ['::1', 128],         // loopback
  ['100::', 64],        // discard-only
  ['fc00::', 7],        // unique local, includes AWS metadata over IPv6 (fd00:ec2::254)
  ['fe80::', 10],       // link-local
  ['fec0::', 10],       // deprecated site-local
  ['ff00::', 8],        // multicast
];
for (const [net, prefix] of BLOCKED_IPV4) blockedRanges.addSubnet(net, prefix, 'ipv4');
for (const [net, prefix] of BLOCKED_IPV6) blockedRanges.addSubnet(net, prefix, 'ipv6');

// Expands a valid IPv6 address into its eight 16-bit groups
function ipv6Groups(address: string): number[] | null {
  let text = address.toLowerCase();
  const dotted = text.match(/(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (dotted) {
    const [a, b, c, d] = dotted.slice(1).map(Number);
    text = `${text.slice(0, dotted.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  if (fill < 0) return null;
  const groups = [...head, ...Array<string>(fill).fill('0'), ...tail].map((group) => Number.parseInt(group, 16));
  return groups.length === 8 && groups.every((group) => group >= 0 && group <= 0xffff) ? groups : null;
}

// The IPv4 address inside an IPv4-mapped (::ffff:a.b.c.d), -compatible (::a.b.c.d),
// -translated (::ffff:0:a.b.c.d), NAT64 (64:ff9b::a.b.c.d) or 6to4 (2002:aabb:ccdd::) address
function embeddedIPv4(groups: number[]): string | null {
  const v4 = (high: number, low: number) => `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
  const zero = (from: number, to: number) => groups.slice(from, to).every((group) => group === 0);
  if (zero(0, 5) && (groups[5] === 0xffff || groups[5] === 0)) return v4(groups[6], groups[7]);
  if (zero(0, 4) && groups[4] === 0xffff && groups[5] === 0) return v4(groups[6], groups[7]);
  if (groups[0] === 0x64 && groups[1] === 0xff9b && zero(2, 6)) return v4(groups[6], groups[7]);
  if (groups[0] === 0x2002) return v4(groups[1], groups[2]);
  return null;
}

export function isBlockedAddress(address: string): boolean {
  const ip = address.replace(/^\[|\]$/g, '').split('%')[0]; // Drop brackets and an IPv6 zone index
  const family = isIP(ip);
  if (family === 4) return blockedRanges.check(ip, 'ipv4');
  if (family !== 6) return true;
  if (blockedRanges.check(ip, 'ipv6')) return true;
  const groups = ipv6Groups(ip);
  if (!groups) return true;
  const v4 = embeddedIPv4(groups);
  return v4 !== null && blockedRanges.check(v4, 'ipv4');
}

// Absolute http(s) URLs only
export function parseCaptureUrl(input: unknown): URL | null {
  if (typeof input !== 'string' || input.length > MAX_URL_LENGTH) return null;
  try {
    const url = new URL(input.trim());
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname ? url : null;
  } catch {
    return null;
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out after ${ms} ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// When every address the host resolves to is public, the one Chromium should connect to
// (IPv4 first). Null otherwise; fails closed on DNS errors.
export async function resolvePublicAddress(hostname: string): Promise<string | null> {
  const host = hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.localhost')) return null;
  if (isIP(host)) return isBlockedAddress(host) ? null : host;
  // Only DNS characters; the host also ends up in a Chromium flag
  if (!/^[a-z0-9._-]+$/.test(host)) return null;
  try {
    const addresses = await withTimeout(lookup(host, { all: true, verbatim: true }), DNS_TIMEOUT_MS);
    if (addresses.length === 0 || addresses.some(({ address }) => isBlockedAddress(address))) return null;
    return (addresses.find(({ family }) => family === 4) ?? addresses[0]).address;
  } catch {
    return null;
  }
}

export async function isPublicHost(hostname: string): Promise<boolean> {
  return (await resolvePublicAddress(hostname)) !== null;
}

// Checks URLs requested by a captured page. Verdicts are cached per host, so only
// the first request to each host waits for DNS. Trusted hosts are pinned to a vetted
// address in Chromium, so they skip the lookup.
export function createRequestGuard(trustedHosts: string[] = []): (url: string) => Promise<boolean> {
  const verdicts = new Map<string, Promise<boolean>>(
    trustedHosts.map((host) => [host, Promise.resolve(true)])
  );
  return async (url) => {
    // Inline content never touches the network
    if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('about:')) return true;
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return false;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    let verdict = verdicts.get(parsed.hostname);
    if (!verdict) {
      verdict = isPublicHost(parsed.hostname);
      verdicts.set(parsed.hostname, verdict);
    }
    return verdict;
  };
}
