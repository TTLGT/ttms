/**
 * A company's website and social media pages (2026-11-12), on clients,
 * shippers, consignees (all `parties`), carriers and 3rd-party providers.
 *
 * One list per record, `webLinks`, rather than a field per network: which
 * networks matter changes, and a field per network would be a migration each
 * time one is added. The `kind` is a label for the chip and nothing else.
 *
 * **What a link may point at is the security half of this file.** A link is
 * typed by any staff member and then drawn as an `<a href>` for everybody who
 * opens the record, so a stored `javascript:` URL would run in a colleague's
 * session the moment they clicked it. `safeWebUrl()` is the one gate: only
 * `http:` and `https:` survive it, it runs on the server before anything is
 * stored (`cleanWebLinks()`), and the chips run it again before drawing —
 * a record edited by hand in the Console has been through neither route.
 */

export type WebLinkKind =
  | 'website' | 'linkedin' | 'facebook' | 'instagram' | 'x' | 'youtube' | 'tiktok' | 'google' | 'other';

export const WEB_LINK_KINDS: WebLinkKind[] =
  ['website', 'linkedin', 'facebook', 'instagram', 'x', 'youtube', 'tiktok', 'google', 'other'];

export const WEB_LINK_LABEL: Record<WebLinkKind, string> = {
  website:   'Website',
  linkedin:  'LinkedIn',
  facebook:  'Facebook',
  instagram: 'Instagram',
  x:         'X (Twitter)',
  youtube:   'YouTube',
  tiktok:    'TikTok',
  google:    'Google Business',
  other:     'Other link',
};

export interface WebLink {
  kind: WebLinkKind;
  /** Always a full `http(s)://` address once stored — see safeWebUrl(). */
  url: string;
}

/** Ten is plenty for one company and keeps a pasted list from bloating the record. */
export const MAX_WEB_LINKS = 10;
const MAX_URL = 300;

export function isWebLinkKind(v: unknown): v is WebLinkKind {
  return typeof v === 'string' && (WEB_LINK_KINDS as string[]).includes(v);
}

/**
 * The address as something safe to put in an `href`, or null.
 *
 * Typed without a scheme ("acme.com") reads as https. Anything with another
 * scheme — `javascript:`, `data:`, `mailto:` — is refused rather than
 * rewritten, and so is anything without a dot in its host, which catches a
 * phone number or a stray word typed into the box.
 */
export function safeWebUrl(raw: unknown): string | null {
  const typed = typeof raw === 'string' ? raw.trim() : '';
  if (!typed || typed.length > MAX_URL || /\s/.test(typed)) return null;
  // A scheme of any kind ("javascript:", "data:") is kept so URL() sees it and
  // the check below refuses it; only a bare host gets https put in front.
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(typed) ? typed : `https://${typed.replace(/^\/+/, '')}`;
  let u: URL;
  try { u = new URL(withScheme); } catch { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (!u.hostname.includes('.') || u.username || u.password) return null;
  return u.href;
}

/** Which network an address belongs to, from its host; 'website' when none. */
export function detectWebLinkKind(url: string): WebLinkKind {
  let host = '';
  try { host = new URL(safeWebUrl(url) ?? '').hostname.toLowerCase().replace(/^www\./, ''); } catch { return 'website'; }
  const is = (...hosts: string[]) => hosts.some((h) => host === h || host.endsWith(`.${h}`));
  if (is('linkedin.com', 'lnkd.in')) return 'linkedin';
  if (is('facebook.com', 'fb.com', 'fb.me')) return 'facebook';
  if (is('instagram.com')) return 'instagram';
  if (is('x.com', 'twitter.com')) return 'x';
  if (is('youtube.com', 'youtu.be')) return 'youtube';
  if (is('tiktok.com')) return 'tiktok';
  if (is('g.page', 'business.google.com', 'maps.app.goo.gl')
    || (/^(maps\.)?google\.[a-z.]+$/.test(host) && url.includes('/maps'))) return 'google';
  return 'website';
}

/**
 * The stored list from whatever JSON arrived: safe addresses only, a known
 * kind on each, no address twice, at most MAX_WEB_LINKS. A row whose address
 * does not pass is dropped, not kept as typed — the form shows which rows
 * will be dropped before anybody saves.
 */
export function cleanWebLinks(raw: unknown): WebLink[] {
  const out: WebLink[] = [];
  const seen = new Set<string>();
  for (const item of Array.isArray(raw) ? raw : []) {
    const o = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    const url = safeWebUrl(o.url);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push({ kind: isWebLinkKind(o.kind) ? o.kind : detectWebLinkKind(url), url });
    if (out.length >= MAX_WEB_LINKS) break;
  }
  return out;
}

/**
 * A record's links, read safely whatever is stored. A provider written before
 * the list existed has a single `website` string, which is folded in as the
 * first link so nothing typed before this change disappears from the page.
 */
export function webLinksOf(record: { webLinks?: unknown; website?: unknown } | null | undefined): WebLink[] {
  const list = cleanWebLinks(record?.webLinks);
  if (Array.isArray(record?.webLinks)) return list;
  const legacy = safeWebUrl(record?.website);
  return legacy ? [{ kind: 'website', url: legacy }] : list;
}

/** The first website in a list — what a provider still stores as `website`, for its search. */
export function websiteOf(links: readonly WebLink[]): string {
  return (links.find((l) => l.kind === 'website') ?? links[0])?.url ?? '';
}

/** "acme.com/about" — the address as a person reads it, without the scheme or a trailing slash. */
export function webLinkText(url: string): string {
  return url.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/$/, '');
}
