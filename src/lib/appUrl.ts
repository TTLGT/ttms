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

/**
 * Base URL for links that leave the company. Never ends in a slash, and always
 * starts with a scheme. A variable set to the bare host
 * (`ttms.totaltransportlogistics.us`) built links with no `https://`. An email
 * client reads that as a relative address, so the Review & Sign button went
 * nowhere, and chat did not recognise it as a link (2026-10-19). A host typed
 * without a scheme is taken to mean https; a blank variable means the
 * production host.
 */
export const APP_URL = withScheme(process.env.NEXT_PUBLIC_APP_URL?.trim() || PRODUCTION_APP_URL).replace(/\/+$/, '');

function withScheme(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url.replace(/^\/+/, '')}`;
}

/** Absolute URL for a one-time signing token. */
export function signUrl(token: string) {
  return `${APP_URL}/sign/${token}`;
}

/** Absolute URL for a driver's link — see src/types/driverLink.ts. */
export function driverUrl(token: string) {
  return `${APP_URL}/driver/${token}`;
}
