/**
 * The one place that knows what address TTMS answers on.
 *
 * Every e-signature link mailed to a carrier or a client is built from this.
 * A link built from the wrong host 404s on a legal signature page, so the value
 * here and the DNS record must match exactly, character for character —
 * no trailing slash, no `www.`, https not http.
 *
 * It used to be an inline `process.env.NEXT_PUBLIC_APP_URL ?? '...'` in both
 * agreement routes. Two copies of a hostname that must not drift is the same
 * hazard the rest of this codebase keeps a sync table for, so it lives here
 * once instead.
 *
 * ⚠️ `NEXT_PUBLIC_*` is baked in when the app is built, not read when it runs.
 * Setting `NEXT_PUBLIC_APP_URL` on the host after a deploy changes nothing
 * until the next build. Set it before the first deploy, and redeploy after any
 * change to it. That is also why the fallback below is the real production
 * host rather than localhost: a deploy that forgot the variable still mails a
 * link that works, instead of mailing a carrier a link to their own machine.
 */
export const PRODUCTION_APP_URL = 'https://ttms.totaltransportlogistics.us';

/** Base URL for links that leave the company. Never ends in a slash. */
export const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? PRODUCTION_APP_URL).replace(/\/+$/, '');

/** Absolute URL for a one-time signing token. */
export function signUrl(token: string) {
  return `${APP_URL}/sign/${token}`;
}
