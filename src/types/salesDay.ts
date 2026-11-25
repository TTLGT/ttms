/*
 * A broker's daily numbers — step 4 of the Planner redesign (2026-11-25).
 * Today's targets (calls, emails, leads, quotes, referrals) and how far the
 * day has got. Pure: no Firestore and no React, so the routes and the screens
 * read the same rules.
 *
 * **Who sees them** (decided 2026-11-24/25): the broker, their own Sales
 * Manager (`managedUids`), and anybody with `sales.viewAll` — admins by
 * default. Not the office: this is not the Incentives scoreboard, which is
 * public by the office's choice. Closed to the browser — no Firestore rule
 * matches `salesTargets` or `salesDays`; everything goes through
 * `/api/me/sales-day` and `/api/sales/*`.
 *
 * **Two kinds of number, and the difference is shown.**
 * - *Tapped* — calls, emails, referrals asked. Nothing in TTMS records a
 *   phone call, so they are one tap each on the Today card, the top-bar
 *   counter or the close of the day. Self-reported, and labelled so.
 * - *Counted* — quotes made and new clients added today, worked out on read
 *   from records TTMS already keeps. Never typed, never stored.
 *
 * **Targets are starting points, not rules.** A Sales Manager (their team) or
 * an admin sets each person's standing targets under `incentives.manage`, the
 * permission both already hold for running incentives; the broker can change
 * them for one day in the planning pop-up. The onboarding sales guides say the
 * same about their numbers.
 *
 * Keyed by uid — like Incentives — so a change of address has nothing here
 * to move (src/lib/emailChange.ts).
 */

export const SALES_TARGETS_COLLECTION = 'salesTargets';
export const SALES_DAYS_COLLECTION = 'salesDays';

export function salesDayId(uid: string, date: string): string {
  return `${uid}__${date}`;
}

/** The five daily numbers, in the order they are drawn. */
export const SALES_METRICS = ['calls', 'emails', 'leads', 'quotes', 'referrals'] as const;
export type SalesMetric = (typeof SALES_METRICS)[number];

/** The three a person taps. The other two TTMS counts. */
export const TAPPED_METRICS = ['calls', 'emails', 'referrals'] as const satisfies readonly SalesMetric[];
export type TappedMetric = (typeof TAPPED_METRICS)[number];

export function isTappedMetric(v: unknown): v is TappedMetric {
  return typeof v === 'string' && (TAPPED_METRICS as readonly string[]).includes(v);
}

export const SALES_METRIC_LABEL: Record<SalesMetric, string> = {
  calls: 'Cold calls',
  emails: 'Cold emails',
  leads: 'New clients added',
  quotes: 'Quotes made',
  referrals: 'Referrals asked',
};

/** What each says under it, so a tapped number is never mistaken for a counted one. */
export const SALES_METRIC_HOW: Record<SalesMetric, string> = {
  calls: 'One tap per call',
  emails: 'One tap per email',
  leads: 'Counts itself: clients you added today',
  quotes: 'Counts itself: loads you created today',
  referrals: 'One tap each time you ask',
};

export type SalesTargets = Record<SalesMetric, number>;
export type SalesTallies = Record<TappedMetric, number>;

/**
 * Where everybody starts until their Sales Manager sets their own: the
 * numbers the cold-calling guide calls a starting point.
 */
export const DEFAULT_SALES_TARGETS: SalesTargets = { calls: 20, emails: 10, leads: 5, quotes: 3, referrals: 1 };

/** A target past this is a typo, not an ambition. */
export const MAX_TARGET = 500;
/** A day's tally past this is a stuck button. */
export const MAX_TALLY = 2000;

const whole = (v: unknown, max: number): number | null =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max ? v : null;

/** Stored or sent targets, each one falling back to `base` when unusable. */
export function readTargets(raw: unknown, base: SalesTargets = DEFAULT_SALES_TARGETS): SalesTargets {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out = { ...base };
  for (const m of SALES_METRICS) {
    const v = whole(r[m], MAX_TARGET);
    if (v !== null) out[m] = v;
  }
  return out;
}

export function readTallies(raw: unknown): SalesTallies {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    calls: whole(r.calls, MAX_TALLY) ?? 0,
    emails: whole(r.emails, MAX_TALLY) ?? 0,
    referrals: whole(r.referrals, MAX_TALLY) ?? 0,
  };
}

/** One person's day, as every screen draws it. */
export interface SalesDay {
  uid: string;
  date: string;
  targets: SalesTargets;
  /** Whether today's targets were changed for the day by the broker. */
  adjusted: boolean;
  /** The standing targets their team lead set (or the defaults), whatever today's say. */
  standing: SalesTargets;
  /** Everything, tapped and counted, by metric. */
  done: Record<SalesMetric, number>;
}

/** How many of the five targets are met. A target of 0 does not count either way. */
export function targetsMet(day: Pick<SalesDay, 'targets' | 'done'>): { met: number; set: number } {
  let met = 0;
  let set = 0;
  for (const m of SALES_METRICS) {
    if (day.targets[m] <= 0) continue;
    set++;
    if (day.done[m] >= day.targets[m]) met++;
  }
  return { met, set };
}

/**
 * Who has daily numbers at all: brokers and Sales Managers — the people who
 * sell. Mirrors `isBroker()` (no role set means broker) plus the one role
 * that is a broker and more.
 */
export function sellsLoads(roles: {
  isAdmin?: boolean; isDispatcher?: boolean; isFinance?: boolean; isHr?: boolean; isSalesManager?: boolean; isIntern?: boolean;
} | null | undefined): boolean {
  if (!roles) return false;
  if (roles.isSalesManager === true) return true;
  return roles.isAdmin !== true && roles.isDispatcher !== true && roles.isFinance !== true
    && roles.isHr !== true && roles.isIntern !== true;
}

/** One person in the team view. */
export interface SalesPerson {
  uid: string;
  email: string;
  name: string;
  teamId: string | null;
  photoPath: string | null;
  /** Whether the caller may change this person's standing targets. */
  canSetTargets: boolean;
}

/** Fired after a tap or a target change, so the Today card and the top-bar counter agree. */
export const SALES_DAY_CHANGED_EVENT = 'ttms:sales-day-changed';
