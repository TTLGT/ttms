import { adminDb } from './firebase-admin';

/**
 * Sequential order numbers — `TTL`, the year counted from 2000, then a
 * six-digit counter: `TTL26000042`.
 *
 * Server-side only. The counter document is closed to the client SDK in
 * firestore.rules, because anything that could write it could roll it
 * backwards and mint a number a live order already carries.
 *
 * Two properties the format is chosen for:
 *
 * - The counter is zero-padded to a fixed width and the year comes first, so
 *   sorting the numbers as plain text puts them in creation order, across a
 *   year boundary included (with one exception in 2100, below). Ordering a
 *   list by order number needs no second field and no parsing.
 * - Six digits leaves room for 999,999 loads in a year. Widening it later
 *   would break that sort — old numbers would sort after new ones — so the
 *   headroom is taken now, while it is free.
 *
 * The `TTL` prefix is what makes the number self-identifying on a carrier's
 * desk, where it sits among PO numbers, pro numbers and load numbers from
 * every other broker they haul for. It also keeps the value text rather than
 * digits, so a spreadsheet cannot reformat it into `2,026,000,042`.
 *
 * The year is counted from 2000 rather than written out, because the century
 * is not information anybody needs on a rate confirmation: 2026 is `26`. In
 * 2100 it becomes `100` and the number grows a character rather than wrapping
 * back to `00` and colliding with 2000 — the first load of 2100 is
 * `TTL100000001`.
 *
 * That is the one place the plain-text sort gives out: `100` sorts before `26`
 * on the first character, so every 22nd-century order would sort ahead of
 * every 21st-century one. Orders within either century still sort correctly
 * among themselves, and `createdAt` is on every order for anyone who needs a
 * true chronological sort. Trading a sort seam in 2100 for numbers that stay
 * short and never repeat is the right way round.
 *
 * The counter has to be stored rather than derived. "One past the highest
 * number so far" is a query two brokers pressing Save in the same second can
 * both answer with the same value; a transaction on one document is what
 * makes a number handed out exactly once.
 */

const COUNTERS   = 'counters';
const SEQ_DIGITS = 6;

/**
 * One counter per year, so the sequence restarts at 1 each January.
 *
 * Keyed by the full year even though the number carries a shortened one: the
 * counter is read by a human in the Firebase console, and `orderNumber-2026`
 * leaves nothing to work out.
 */
function counterRef(year: number) {
  return adminDb.collection(COUNTERS).doc(`orderNumber-${year}`);
}

/**
 * The year segment: years since 2000, unpadded. `26` now, `100` from 2100,
 * `1000` from 3000. Never wraps, so no two years can share a segment.
 */
function yearSegment(year: number): string {
  return String(year - 2000);
}

export function formatOrderNumber(year: number, seq: number): string {
  return `TTL${yearSegment(year)}${String(seq).padStart(SEQ_DIGITS, '0')}`;
}

/**
 * Reads a number back into its year and sequence, or null if it was not issued
 * by this scheme — a BATS id, or one of the pre-sequence `TTL-2026-4821`
 * numbers. Callers use it to tell "already numbered" from "needs a number";
 * nothing in the app should be parsing an order number for any other reason.
 *
 * The six-digit counter is what makes this unambiguous: everything between
 * `TTL` and the last six digits is the year.
 *
 * ⚠️  KEEP IN SYNC with the mirror in scripts/backfill-order-numbers.js and
 * scripts/import-bats.js — plain node scripts cannot import TypeScript.
 */
export function parseOrderNumber(value: string | null | undefined): { year: number; seq: number } | null {
  const m = /^TTL(\d+)(\d{6})$/.exec(String(value ?? ''));
  if (!m) return null;
  return { year: 2000 + Number(m[1]), seq: Number(m[2]) };
}

/**
 * Reserves `count` consecutive numbers at once and returns the first sequence
 * value in the run.
 *
 * The BATS import brings in thousands of orders in a pass. Taking them one
 * transaction at a time would serialise thousands of round trips against a
 * single document — well past the rate Firestore sustains on one document, and
 * slow enough to time the import out. One transaction that moves the counter
 * by the whole batch costs the same as moving it by one.
 */
export async function reserveOrderNumbers(year: number, count: number): Promise<number> {
  if (count < 1) throw new Error('count must be at least 1');
  const ref = counterRef(year);

  return adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const last = snap.exists ? Number(snap.data()?.last) : 0;
    const from = (Number.isFinite(last) ? last : 0) + 1;
    tx.set(ref, { year, last: from + count - 1, updatedAt: new Date() }, { merge: true });
    return from;
  });
}

/**
 * Reserves the next number for the current year and returns it.
 *
 * A reserved number is spent whether or not the order that asked for it is
 * ever written, so a failed save leaves a gap in the sequence. That is the
 * deliberate trade: handing the same number to the next order instead would
 * mean two different loads could carry one number in the paperwork, and the
 * order number is what appears on rate confirmations, BOLs and invoices.
 * Gaps cost nothing — the numbers still sort into creation order.
 */
export async function allocateOrderNumber(): Promise<{ orderNumber: string; year: number; seq: number }> {
  const year = new Date().getFullYear();
  const seq  = await reserveOrderNumbers(year, 1);
  return { orderNumber: formatOrderNumber(year, seq), year, seq };
}
