'use client';

import { auth } from './firebase';

/**
 * The loads a chat message names, and the cards they turn into.
 *
 * Half of why chat lives inside TTMS rather than in Slack: a broker types
 * "TTL26000042 is running late" — or pastes the link they were already looking
 * at — and the room can see which load that is, where it is going and who is
 * hauling it, without leaving the message and without anybody's load data
 * leaving the company to do it.
 */

/** What a card shows. Trimmed server-side — see /api/orders/lookup. */
export interface OrderCardData {
  id: string;
  number: string;
  status: string;
  clientName: string;
  carrierName: string;
  commodity: string;
  origin: string;
  destination: string;
  pickupAt: number | null;
}

/**
 * A load as a message named it: by the number people say out loud, or by the
 * document id in a link to it.
 *
 * Both end at the same order, and neither can be turned into the other without
 * asking the server — an id is not derivable from a number — so which one was
 * said has to travel as far as the lookup.
 */
export interface OrderRef {
  kind: 'number' | 'id';
  value: string;
}

/** Cache and React key for a ref. Two kinds can hold the same string. */
export function refKey(ref: OrderRef): string {
  return `${ref.kind}:${ref.value}`;
}

/**
 * The hosts a `/dashboard/orders/...` link has to be on before it is treated
 * as one of ours.
 *
 * Deliberately a fixed list rather than `APP_URL`: that constant is
 * `http://localhost:3000` on every staff machine (see appUrl.ts), so a check
 * built on it would recognise nothing in development. Matching the path alone
 * is worse still — any site with a page at the same path would sprout one of
 * our cards under a link that has nothing to do with us.
 *
 * `window.location` is not consulted on purpose: this parse runs while a
 * bubble renders, on the server as well as in the browser, and a list that
 * differed between the two is a hydration mismatch.
 *
 * Written as expressions rather than one long escaped string because a host is
 * mostly dots, and `\.` inside a quoted string is one editing slip away from
 * matching any character.
 */
const APP_HOSTS = [
  /ttms\.totaltransportlogistics\.us/,
  // The Vercel fallback address, which is still a live way into the app.
  /ttms-iota\.vercel\.app/,
  /localhost(?::\d+)?/,
  /127\.0\.0\.1(?::\d+)?/,
].map((host) => host.source).join('|');

/**
 * The loads named in a piece of text.
 *
 * Four shapes are recognised, and the difference between them is the whole
 * design of this:
 *
 *  - A link to the load — `https://ttms.../dashboard/orders/8fm855bk0vlruo`.
 *    The one people produce without being taught anything, by copying the
 *    address bar of the order they are already looking at. Only on one of our
 *    own hosts, above.
 *  - `TTL26000042`, and the pre-sequence `TTL-2026-4821`. Self-identifying —
 *    nothing else in a freight conversation looks like that — so they are
 *    matched wherever they appear.
 *  - `#41207`, for the BATS-era loads whose number is bare digits. Those are
 *    deliberately **not** matched on their own. A chat full of weights, rates,
 *    ZIP codes, pro numbers and phone extensions would otherwise sprout cards
 *    for loads nobody mentioned, and a card that is wrong is worse than no
 *    card at all. The `#` is the small, teachable thing somebody types when
 *    they mean a load.
 *
 * The link alternative is first so it wins outright, and the id inside it is
 * read as an id rather than as anything else the URL happens to contain.
 *
 * Capped at three per message. A message quoting eight loads is a list, and a
 * list of eight cards is not a message any more.
 *
 * The alternatives are quoted strings rather than the regex literals used for
 * the hosts above, and not by preference: the groups are named, and TypeScript
 * refuses a named group in a *literal* while `target` is ES2017 (tsconfig.json).
 * Built through `new RegExp` it compiles, and every browser TTMS supports has
 * had named groups for years.
 */
const ORDER_REF = new RegExp(
  [
    // An order id is whatever Firestore gave the document: a 20-character
    // auto-id, or the `bats-41207` form the importer sets. Matched loosely
    // rather than pinned to either shape — the lookup is access-checked and
    // answers 404 for anything that is not a load, so a wrong guess costs one
    // request and draws nothing. The character class stops at `.`, `/` and
    // `?`, so a trailing full stop, a trailing slash and an /edit suffix all
    // fall outside the id.
    `https?:\\/\\/(?:${APP_HOSTS})\\/dashboard\\/orders\\/(?<linked>[A-Za-z0-9_-]{1,128})`,
    '\\b(?<ttl>TTL\\d{8,12})\\b',
    '\\b(?<seq>TTL-\\d{4}-\\d+)\\b',
    '(?:^|[\\s(])#(?<bats>\\d{3,10})\\b',
  ].join('|'),
  'gi',
);

export const MAX_CARDS_PER_MESSAGE = 3;

/**
 * Path segments that sit beside an order id but are not one. Only the new-order
 * form today; the lookup would answer 404 for it anyway, so this saves a
 * request rather than preventing anything.
 */
const NOT_AN_ID = ['new'];

export function orderRefsIn(text: string): OrderRef[] {
  if (!text) return [];
  const found: OrderRef[] = [];

  for (const match of text.matchAll(ORDER_REF)) {
    const g = match.groups ?? {};
    // Numbers are upper-cased because people type them either way and the
    // stored value is upper. An id is **not** — `8fm855bk0vlruoSboSn8` and
    // `8FM855BK0VLRUOSBOSN8` are different documents.
    const ref: OrderRef = g.linked
      ? { kind: 'id', value: g.linked }
      : { kind: 'number', value: (g.ttl || g.seq || g.bats || '').toUpperCase() };

    if (!ref.value) continue;
    if (ref.kind === 'id' && NOT_AN_ID.includes(ref.value.toLowerCase())) continue;
    if (found.some((f) => f.kind === ref.kind && f.value === ref.value)) continue;

    found.push(ref);
    if (found.length >= MAX_CARDS_PER_MESSAGE) break;
  }

  return found;
}

/**
 * Every lookup this browser has done, kept for the life of the page.
 *
 * A busy room mentions the same load twenty times, and every one of those
 * messages draws a card. Without this, scrolling back through a morning of
 * dispatch would be twenty identical requests — each of which is a Firestore
 * query and an access check on the server.
 *
 * Promises are cached rather than results, so twenty bubbles mounting in the
 * same frame make one request between them rather than twenty. Misses are
 * cached too, as `null`: a number that is not a load, or is a load this person
 * cannot see, must not be asked about again on every scroll.
 *
 * Keyed by the ref rather than by the load, so a load named both ways across a
 * room is two entries and two reads. Collapsing them would mean knowing they
 * are the same load, which is the thing the request is for.
 *
 * Never invalidated. A card is a preview — status and carrier can be minutes
 * stale and the room is none the worse for it — and opening the order is one
 * click away for anything that has to be current.
 */
const cache = new Map<string, Promise<OrderCardData | null>>();

export function loadOrderCard(ref: OrderRef): Promise<OrderCardData | null> {
  const key = refKey(ref);
  const hit = cache.get(key);
  if (hit) return hit;

  const request = (async () => {
    const user = auth.currentUser;
    if (!user) return null;

    const query = `${ref.kind === 'id' ? 'id' : 'number'}=${encodeURIComponent(ref.value)}`;
    const res = await fetch(`/api/orders/lookup?${query}`, {
      headers: { Authorization: `Bearer ${await user.getIdToken()}` },
    });
    // 403 and 404 are both "draw nothing". The message keeps the number or the
    // link as the plain text it was typed as, which is what it was before
    // anybody thought of cards.
    if (!res.ok) return null;

    const { card } = await res.json() as { card: OrderCardData };
    return card ?? null;
  })().catch(() => null);

  cache.set(key, request);
  return request;
}
