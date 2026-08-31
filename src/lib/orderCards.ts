'use client';

import { auth } from './firebase';

/**
 * Order numbers said in a chat message, and the cards they turn into.
 *
 * Half of why chat lives inside TTMS rather than in Slack: a broker types
 * "TTL26000042 is running late" and the room can see which load that is,
 * where it is going and who is hauling it — without leaving the message, and
 * without anybody's load data leaving the company to do it.
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
 * The order numbers in a piece of text.
 *
 * Two shapes are recognised, and the difference between them is the whole
 * design of this:
 *
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
 * Capped at three per message. A message quoting eight loads is a list, and a
 * list of eight cards is not a message any more.
 */
const ORDER_NUMBER = /\b(TTL\d{8,12})\b|\b(TTL-\d{4}-\d+)\b|(?:^|[\s(])#(\d{3,10})\b/gi;

export const MAX_CARDS_PER_MESSAGE = 3;

export function orderNumbersIn(text: string): string[] {
  if (!text) return [];
  const found: string[] = [];
  for (const match of text.matchAll(ORDER_NUMBER)) {
    // Whichever alternative matched. The `#` form drops its hash: what is
    // stored on the order is the bare id.
    const number = (match[1] || match[2] || match[3] || '').toUpperCase();
    if (number && !found.includes(number)) found.push(number);
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
 * Never invalidated. A card is a preview — status and carrier can be minutes
 * stale and the room is none the worse for it — and opening the order is one
 * click away for anything that has to be current.
 */
const cache = new Map<string, Promise<OrderCardData | null>>();

export function loadOrderCard(number: string): Promise<OrderCardData | null> {
  const key = number.toUpperCase();
  const hit = cache.get(key);
  if (hit) return hit;

  const request = (async () => {
    const user = auth.currentUser;
    if (!user) return null;

    const res = await fetch(`/api/orders/lookup?number=${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${await user.getIdToken()}` },
    });
    // 403 and 404 are both "draw nothing". The message keeps the number as
    // plain text, which is what it was before anybody thought of cards.
    if (!res.ok) return null;

    const { card } = await res.json() as { card: OrderCardData };
    return card ?? null;
  })().catch(() => null);

  cache.set(key, request);
  return request;
}
