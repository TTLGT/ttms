import { Timestamp } from 'firebase-admin/firestore';
import { adminDb } from './firebase-admin';
import { lookupCarrier, FmcsaNotConfiguredError } from './fmcsa';
import { carrierNumber } from '@/types/carrier';
import { fmcsaBlankFills, fmcsaConcerns, fmcsaLevel } from '@/types/fmcsa';
import type { Carrier } from '@/types/carrier';
import type { FmcsaAnswer, FmcsaLevel } from '@/types/fmcsa';

/**
 * Checking many carriers with FMCSA at once, and filling in what their records
 * are missing — the step that makes a BATS import arrive as usable carriers
 * rather than a name and an MC number.
 *
 * Each carrier gets exactly what the "Check FMCSA" button and the "fill in"
 * offer on its own page would give it: the answer stored as `fmcsa`, and
 * `fmcsaBlankFills()` applied, which only ever writes a field that is blank.
 * Nothing a broker typed is replaced.
 *
 * It is run in small batches by the import panel, not in one request, because
 * a full carriers export is thousands of lookups and a route has a few minutes.
 * The browser holds the list and the progress; each call is independent, so
 * closing the tab halfway loses nothing that was already written, and the
 * "check carriers not yet checked" button picks up the rest.
 */

/** Ids per call. Small enough that a slow FMCSA still finishes inside the route's `maxDuration`. */
export const SWEEP_BATCH = 20;
/**
 * Lookups in flight at once. Two, because each one is five queries to the open
 * data, which answered "too many requests" by the fourth census lookup in a
 * row even with a token (2026-10-07).
 */
const CONCURRENCY = 2;
/** Stop starting new lookups after this, so the ones in flight can finish before the route is cut off. */
const BUDGET_MS = 35_000;

export type SweepOutcome =
  /** Found, authorized or not — the panel on the carrier page says which. */
  | 'checked'
  /** FMCSA has no carrier under that number. Stored, because that is a finding. */
  | 'not_found'
  /** No DOT and no MC on the record, so there was nothing to ask about. */
  | 'no_number'
  /** FMCSA did not answer. Nothing stored; a later run tries again. */
  | 'failed';

export interface SweepItem {
  id: string;
  companyName: string;
  outcome: SweepOutcome;
  /** The fields that were blank and are now filled, by name. */
  filled: string[];
  /**
   * The verdict the carrier's FMCSA panel will show — the same
   * `fmcsaConcerns()` rules, so the import report and the carrier page cannot
   * disagree. Absent when nothing was stored.
   */
  level?: FmcsaLevel;
}

export interface SweepResult {
  items: SweepItem[];
  /** Ids this call ran out of time for; the caller sends them again. */
  unprocessed: string[];
}

/**
 * Carriers that have never been checked, or whose numbers have changed since
 * they were — the second is what a re-import does when BATS has a corrected MC.
 * One read per carrier, of three fields, so asking costs the size of the
 * carriers collection and no more.
 *
 * Deliberately not "checked more than a day ago": that would re-check the whole
 * book every time somebody pressed the button. A stale check is refreshed by
 * itself where it matters, on the order screen when the carrier is booked.
 */
export async function carriersNeedingCheck(): Promise<string[]> {
  const snap = await adminDb.collection('carriers').select('dot', 'mc', 'fmcsa.query').get();
  const ids: string[] = [];
  snap.forEach((doc) => {
    const d = doc.data();
    const query = carrierNumber(d.dot) || carrierNumber(d.mc);
    if (!query) return;
    if ((d.fmcsa?.query as string | undefined) !== query) ids.push(doc.id);
  });
  return ids;
}

async function sweepOne(id: string, checkedByName: string): Promise<SweepItem> {
  const ref  = adminDb.collection('carriers').doc(id);
  const snap = await ref.get();
  const carrier = (snap.data() ?? {}) as Partial<Carrier>;
  const companyName = carrier.companyName ?? '';
  if (!snap.exists) return { id, companyName, outcome: 'no_number', filled: [] };

  let dot = carrierNumber(carrier.dot);
  const mc = carrierNumber(carrier.mc);
  if (!dot && !mc) return { id, companyName, outcome: 'no_number', filled: [] };

  let lookup = await lookupCarrier(dot, mc);
  const fills: Record<string, unknown> = { ...fmcsaBlankFills(carrier, lookup) };
  if (typeof fills.dot === 'string') {
    // Asked again by the DOT, so the stored check is about the numbers now on
    // the record. Filed as the MC answer, the panel would read the new DOT as
    // "the numbers have changed since" and check again the first time anybody
    // opened it.
    dot = fills.dot;
    lookup = await lookupCarrier(dot, mc);
  }

  // `updatedAt` is left alone, as the single check route leaves it: this is
  // FMCSA's answer arriving, not anybody editing the carrier, and bumping it
  // would put every imported carrier at the top of "recently changed".
  await ref.update({
    ...fills,
    fmcsa: { ...lookup, checkedAt: Timestamp.now(), checkedByName },
  });

  return {
    id,
    companyName,
    outcome: lookup.found ? 'checked' : 'not_found',
    filled: Object.keys(fills).filter((k) => k !== 'phoneRegion'),
    level: fmcsaLevel(fmcsaConcerns(lookup, mc)),
  };
}

/**
 * Check one batch of carriers. Throws `FmcsaNotConfiguredError` when the key
 * is missing or refused, so the caller can stop rather than fail every
 * carrier one at a time.
 */
export async function sweepCarriers(ids: string[], checkedByName: string): Promise<SweepResult> {
  const started = Date.now();
  const queue = [...ids];
  const items: SweepItem[] = [];

  async function worker() {
    while (queue.length && Date.now() - started < BUDGET_MS) {
      const id = queue.shift()!;
      try {
        items.push(await sweepOne(id, checkedByName));
      } catch (e) {
        // A missing key fails every carrier the same way, so the run stops.
        // Anything else — FMCSA down, one bad record — is that carrier's
        // problem: it is reported, nothing is stored, and a later run retries.
        if (e instanceof FmcsaNotConfiguredError) throw e;
        items.push({ id, companyName: '', outcome: 'failed', filled: [] });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, ids.length) }, worker));

  return { items, unprocessed: queue };
}
