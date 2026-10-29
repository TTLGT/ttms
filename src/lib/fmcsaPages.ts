/**
 * FMCSA's public carrier pages, fetched by TTMS's server and handed to the
 * browser to show.
 *
 * Why this exists: FMCSA refuses visitors from outside the US, so from the
 * Guatemala office SaferWeb, SMS and Licensing & Insurance answer 403 unless
 * somebody turns a VPN on. The server runs on Vercel in the US and is let in
 * — the same reason the FMCSA check works from here. These pages are public
 * records FMCSA publishes for anybody vetting a carrier; this only changes
 * which machine asks.
 *
 * It is not an open proxy, and must not become one. The route reads the
 * carrier's numbers off its record and picks a fixed FMCSA address;
 * nothing in the request reaches a URL.
 *
 * What comes back is somebody else's HTML, so it is shown only inside an
 * iframe sandboxed without `allow-scripts` or `allow-same-origin` — an opaque
 * origin where nothing runs and nothing can reach the TTMS session. That
 * sandbox is the guard. The stripping below is belt and braces, and to keep
 * the frame from sitting on dead scripts' fallbacks.
 */

export class FmcsaPageUnavailableError extends Error {}

const TIMEOUT_MS = 12_000;
const MAX_STYLESHEETS = 6;

async function get(url: string): Promise<Response> {
  try {
    return await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Accept: 'text/html,text/css,*/*' },
      cache: 'no-store',
    });
  } catch {
    throw new FmcsaPageUnavailableError('FMCSA did not answer. Try again in a minute.');
  }
}

/**
 * Inline the page's own stylesheets. The frame cannot load them itself: the
 * browser fetching them is the one in Guatemala, and FMCSA refuses it. Only
 * the page's own host, and only a handful — a page that names more than that
 * is not one this was written for.
 */
async function inlineStylesheets(html: string, pageUrl: string): Promise<string> {
  const host = new URL(pageUrl).host;
  const links = [...html.matchAll(/<link\b[^>]*>/gi)]
    .map((m) => m[0])
    .filter((tag) => /rel\s*=\s*["']?stylesheet/i.test(tag))
    .slice(0, MAX_STYLESHEETS);

  for (const tag of links) {
    const href = /href\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    if (!href) continue;
    let abs: URL;
    try { abs = new URL(href, pageUrl); } catch { continue; }
    if (abs.host !== host) continue;
    try {
      const res = await get(abs.href);
      if (!res.ok) continue;
      // A `</style>` inside the sheet would end the block early.
      const css = (await res.text()).replace(/<\/style/gi, '<\\/style');
      html = html.replace(tag, `<style>${css}</style>`);
    } catch {
      // Unstyled is still readable; a missing sheet is not worth failing on.
    }
  }
  return html;
}

function sanitize(html: string, pageUrl: string): string {
  let out = html
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<script\b[^>]*\/?>/gi, '')
    // FMCSA's are warnings that the page "may not work correctly without this
    // script" — true in the frame, and nothing a reader can act on.
    .replace(/<noscript\b[\s\S]*?<\/noscript\s*>/gi, '')
    .replace(/<(iframe|frame|object|embed)\b[\s\S]*?(<\/\1\s*>|\/>)/gi, '')
    .replace(/<link\b[^>]*>/gi, '')
    .replace(/<meta\b[^>]*http-equiv[^>]*>/gi, '')
    .replace(/<base\b[^>]*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src|action)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '$1="#"');

  // Links still lead to FMCSA — fine on a VPN, a 403 without, and that is the
  // most a frame can honestly offer. A new tab, so the copy here stays put.
  const base = `<base href="${pageUrl.replace(/"/g, '&quot;')}" target="_blank">`;
  out = /<head\b[^>]*>/i.test(out)
    ? out.replace(/<head\b[^>]*>/i, (m) => `${m}${base}`)
    : `${base}${out}`;
  return out;
}

/** The page as FMCSA serves it to a US visitor, made safe to frame. */
export async function fetchFmcsaPage(url: string): Promise<string> {
  const res = await get(url);
  if (!res.ok) {
    throw new FmcsaPageUnavailableError(
      res.status === 403
        ? 'FMCSA refused the request from TTMS\'s server as well. Use the VPN link instead.'
        : `FMCSA answered with an error (${res.status}). Try again in a minute.`,
    );
  }
  const raw = await res.text();
  return sanitize(await inlineStylesheets(raw, url), url);
}
