import {
  GIF_CONTENT_FILTER,
  GIF_PAGE_SIZE,
  isKlipyUrl,
  type GifFile,
  type GifPage,
  type GifRef,
} from '@/types/gif';

/**
 * Klipy's GIF API, server side. See src/types/gif.ts for what is sent where.
 *
 * `KLIPY_API_KEY` is read here and nowhere else, and never sent to a browser:
 * Klipy's key sits in the request path, so a key that reached the client
 * would be anybody's to use against our quota.
 *
 * Endpoints (https://docs.klipy.com/gifs-api):
 *   GET https://api.klipy.com/api/v1/{key}/gifs/search?q=…&page=…&per_page=…
 *   GET https://api.klipy.com/api/v1/{key}/gifs/trending?page=…&per_page=…
 * Both answer `{ result, data: { data: [...], current_page, per_page, has_next } }`,
 * each item carrying `file.{hd,md,sm,xs}.{gif,webp,mp4,jpg}.{url,width,height,size}`.
 */

const BASE = 'https://api.klipy.com/api/v1';

export class GifsUnavailableError extends Error {}

export function gifsConfigured(): boolean {
  return !!process.env.KLIPY_API_KEY;
}

/*
 * Answers are kept for a while in this server's memory. A test key allows 100
 * requests an hour for the whole company, and the same few searches ("thank
 * you", "lol", the trending page) are most of what anybody asks for. Vercel
 * runs more than one copy of the server, so this is a saving, not a guarantee.
 */
const TTL_MS = 10 * 60 * 1000;
const MAX_CACHED = 300;
const cache = new Map<string, { at: number; page: GifPage }>();

function remember(key: string, page: GifPage) {
  if (cache.size >= MAX_CACHED) cache.delete(cache.keys().next().value!);
  cache.set(key, { at: Date.now(), page });
}

type Formats = Partial<Record<'gif' | 'webp' | 'mp4' | 'jpg', GifFile>>;
type Sizes = Partial<Record<'hd' | 'md' | 'sm' | 'xs', Formats>>;

/** The first animated rendition found, in the order of sizes given. WebP is smaller than GIF. */
function pick(file: Sizes | undefined, sizes: (keyof Sizes)[]): GifFile | null {
  for (const s of sizes) {
    const f = file?.[s];
    const hit = f?.webp ?? f?.gif;
    if (hit?.url && isKlipyUrl(hit.url)) return { url: hit.url, width: hit.width, height: hit.height };
  }
  return null;
}

function toRef(item: Record<string, unknown>): GifRef | null {
  // Klipy mixes adverts into a page when an app has them switched on; those
  // carry `type: "ad"` and HTML to run. Never shown here.
  if (item.type === 'ad' || typeof item.slug !== 'string') return null;
  const file = item.file as Sizes | undefined;
  const shown   = pick(file, ['md', 'hd', 'sm']);
  const preview = pick(file, ['sm', 'xs', 'md']);
  if (!shown || !preview) return null;
  return {
    id:         item.slug.slice(0, 200),
    title:      (typeof item.title === 'string' ? item.title : '').slice(0, 120),
    url:        shown.url,
    width:      shown.width || 200,
    height:     shown.height || 200,
    previewUrl: preview.url,
  };
}

/** Search when `q` is given, the trending page when it is empty. */
export async function fetchGifs(q: string, page: number): Promise<GifPage> {
  const key = process.env.KLIPY_API_KEY;
  if (!key) throw new GifsUnavailableError('GIF search is not set up yet.');

  const query = q.trim().toLowerCase();
  const cacheKey = `${query}\u0000${page}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.page;

  const params = new URLSearchParams({
    page:           String(page),
    per_page:       String(GIF_PAGE_SIZE),
    content_filter: GIF_CONTENT_FILTER,
  });
  if (query) params.set('q', query);
  const url = `${BASE}/${encodeURIComponent(key)}/gifs/${query ? 'search' : 'trending'}?${params}`;

  const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
  if (res.status === 429) throw new GifsUnavailableError('Too many GIF searches this hour. Try again in a few minutes.');
  if (!res.ok) throw new GifsUnavailableError('The GIF service did not answer. Try again in a moment.');

  const body = await res.json().catch(() => null) as
    { result?: boolean; data?: { data?: unknown[]; has_next?: boolean } } | null;
  if (!body?.result || !Array.isArray(body.data?.data)) {
    throw new GifsUnavailableError('The GIF service sent back something unexpected.');
  }

  const result: GifPage = {
    gifs: body.data.data
      .map((i) => (i && typeof i === 'object' ? toRef(i as Record<string, unknown>) : null))
      .filter((g): g is GifRef => !!g),
    hasNext: !!body.data.has_next,
  };
  remember(cacheKey, result);
  return result;
}
