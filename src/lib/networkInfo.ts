/**
 * Where a request came from: its IP address, the place that address is
 * registered to, and the internet provider behind it. Server-side only.
 *
 * Used at clock-in and clock-out, never on the five-minute heartbeat — this is
 * what the attendance report shows beside a clock time, and one lookup per
 * clock action is all it needs.
 *
 * **The place is the network's, not the person's.** Vercel works it out from
 * the IP address and adds it to every request for free (the `x-vercel-ip-*`
 * headers). It is city-level at best: most Guatemalan connections place as
 * Guatemala City wherever somebody actually is, and a VPN puts them anywhere.
 * The screens say "network location" for that reason.
 *
 * **The provider comes from ipinfo**, because Vercel does not supply it. That
 * sends the clock-in's IP address — and nothing else — to ipinfo.io, which is
 * why it happens only at the clock and not on every heartbeat. With
 * IPINFO_TOKEN set it uses the free Lite API; without one it uses ipinfo's
 * keyless endpoint, which is rate-limited but ample for one call per clock
 * action. Any failure means "provider unknown", never a failed clock-in.
 */

/** The caller's IP, as Vercel reports it. Null running locally. */
export function requestIp(req: Request): string | null {
  // Vercel sets x-forwarded-for with the client first; a proxy in front of
  // the client could prepend more, and the first entry is the one Vercel saw.
  const forwarded = req.headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() || req.headers.get('x-real-ip')?.trim() || '';
  return ip || null;
}

const regionNames = (() => {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' });
  } catch {
    return null;
  }
})();

/** City, region and country from Vercel's headers. Empty locally. */
export function requestPlace(req: Request): { city: string | null; region: string | null; country: string | null } {
  const header = (name: string) => {
    const v = req.headers.get(name);
    if (!v) return null;
    // Vercel URL-encodes the city, so "Ciudad de Guatemala" arrives with %20s.
    try { return decodeURIComponent(v); } catch { return v; }
  };
  const code = header('x-vercel-ip-country');
  let country = code;
  if (code && regionNames) {
    try { country = regionNames.of(code) ?? code; } catch { /* keep the code */ }
  }
  return {
    city: header('x-vercel-ip-city'),
    region: header('x-vercel-ip-country-region'),
    country,
  };
}

/** Addresses no lookup service can say anything about. */
function isPrivateIp(ip: string): boolean {
  return /^(10\.|127\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip)
    || ip === '::1'
    || /^f[cd]/i.test(ip)
    || /^fe80:/i.test(ip);
}

/**
 * Held for the life of the server instance. A company's staff come from a
 * handful of addresses, and the answer for an address changes about never.
 */
const providerCache = new Map<string, string | null>();

/** How long a clock-in is willing to wait on ipinfo before going ahead without it. */
const LOOKUP_TIMEOUT_MS = 2500;

export async function providerFor(ip: string | null): Promise<string | null> {
  if (!ip || isPrivateIp(ip)) return null;
  if (providerCache.has(ip)) return providerCache.get(ip) ?? null;

  const token = process.env.IPINFO_TOKEN;
  const url = token
    ? `https://api.ipinfo.io/lite/${encodeURIComponent(ip)}?token=${encodeURIComponent(token)}`
    : `https://ipinfo.io/${encodeURIComponent(ip)}/json`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS), cache: 'no-store' });
    if (!res.ok) return null; // not cached: a rate limit today is not the answer tomorrow
    const data = (await res.json()) as { as_name?: string; org?: string };
    // Lite gives `as_name`; the keyless endpoint gives `org` as "AS14754 Telgua".
    const name = (data.as_name ?? data.org?.replace(/^AS\d+\s+/, '') ?? '').trim() || null;
    providerCache.set(ip, name);
    return name;
  } catch {
    return null;
  }
}
