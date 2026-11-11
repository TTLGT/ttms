/**
 * What kind of client somebody is, and a few numbers about their history with
 * us (2026-11-11). Pure — no Firestore, no clock: the server route hands in
 * the loads and today's office date, and the order page and the client page
 * draw what comes back.
 *
 * Worked out on read, never stored. A stored "recurrent" goes stale the day
 * the client stops sending loads and nothing would ever move it back; this is
 * always true of today. Same reasoning as a grant's expiry (isGrantLive()).
 *
 * The thresholds are named below so the office can tune them by changing one
 * number — the definitions were the office's own (2026-11-11):
 *   - Credit: approved for our Credit services with our factoring company.
 *     A flag on the client (Party.creditClient), shown beside the type rather
 *     than instead of it — a credit client can also be new or recurrent.
 *   - New: started with us this month, and this is their first load.
 *   - Potentially recurrent: new this month, but already 2 or more loads.
 *   - Recurrent: giving us loads often over the last three months.
 * and three more so every client has an answer:
 *   - Prospect: quoted, nothing booked yet.
 *   - Occasional: has loaded with us recently, but not often enough to count.
 *   - Dormant: nothing booked in the last three months.
 */

/** Loads in the last three calendar months (this one and the two before) to count as recurrent… */
export const RECURRENT_MIN_LOADS = 3;
/** …spread over at least this many of those months, so one busy week is not a habit. */
export const RECURRENT_MIN_MONTHS = 2;
/** Loads in a new client's first month to be potentially recurrent. */
export const POTENTIAL_MIN_LOADS = 2;

export type ClientType = 'prospect' | 'new' | 'potential' | 'recurrent' | 'occasional' | 'dormant';

export const CLIENT_TYPE_LABEL: Record<ClientType, string> = {
  prospect:   'Prospect',
  new:        'New',
  potential:  'Potentially recurrent',
  recurrent:  'Recurrent',
  occasional: 'Occasional',
  dormant:    'Dormant',
};

/** One line under the badge saying why — a type nobody can explain gets ignored. */
export const CLIENT_TYPE_MEANING: Record<ClientType, string> = {
  prospect:   'Quoted, but no load booked yet.',
  new:        'Started with us this month — this is their first load.',
  potential:  'New this month and already sending more than one load.',
  recurrent:  'Sends us loads regularly — several in the last three months.',
  occasional: 'Has loaded with us lately, but not regularly.',
  dormant:    'No load booked in the last three months.',
};

/** Pill tone for each type, in DetailBits' palette. */
export const CLIENT_TYPE_TONE: Record<ClientType, 'gray' | 'blue' | 'green' | 'amber' | 'violet' | 'red'> = {
  prospect:   'gray',
  new:        'blue',
  potential:  'violet',
  recurrent:  'green',
  occasional: 'amber',
  dormant:    'red',
};

/** One load as the snapshot needs it. Dates are office-time `YYYY-MM-DD`. */
export interface SnapshotLoad {
  day: string;
  status: string;
  agreedRate: number;
}

export interface ClientSnapshot {
  type: ClientType;
  creditClient: boolean;
  /** Booked = past the quote and not cancelled. */
  bookedLoads: number;
  quotes: number;
  cancelled: number;
  loadsThisMonth: number;
  /** This month and the two before. */
  loadsLast3Months: number;
  firstLoadDay: string | null;
  lastLoadDay: string | null;
  /** Of booked loads with a rate. */
  averageRate: number | null;
  totalBilled: number;
  /** Booked loads per month, oldest first, the last six months — for a small bar row. */
  months: { month: string; loads: number }[];
  /** True when there were more loads than the route reads; the numbers are then a floor. */
  truncated: boolean;
}

const monthOf = (day: string) => day.slice(0, 7);

/** `YYYY-MM` of the month `back` months before `month`. */
export function monthBefore(month: string, back: number): string {
  const [y, m] = month.split('-').map(Number);
  const total = y * 12 + (m - 1) - back;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

export function isBookedStatus(status: string): boolean {
  return status !== 'quote' && status !== 'cancelled';
}

export function clientSnapshot(
  loads: readonly SnapshotLoad[],
  today: string,
  creditClient: boolean,
  truncated = false,
): ClientSnapshot {
  const booked = loads.filter((l) => isBookedStatus(l.status)).sort((a, b) => a.day.localeCompare(b.day));
  const thisMonth = monthOf(today);
  const window = new Set([0, 1, 2].map((b) => monthBefore(thisMonth, b)));
  const recent = booked.filter((l) => window.has(monthOf(l.day)));
  const recentMonths = new Set(recent.map((l) => monthOf(l.day))).size;
  const firstDay = booked[0]?.day ?? null;
  const loadsThisMonth = booked.filter((l) => monthOf(l.day) === thisMonth).length;

  let type: ClientType;
  if (!booked.length) type = 'prospect';
  else if (firstDay && monthOf(firstDay) === thisMonth) type = booked.length >= POTENTIAL_MIN_LOADS ? 'potential' : 'new';
  else if (recent.length >= RECURRENT_MIN_LOADS && recentMonths >= RECURRENT_MIN_MONTHS) type = 'recurrent';
  else if (recent.length) type = 'occasional';
  else type = 'dormant';

  const rated = booked.filter((l) => l.agreedRate > 0);
  const totalBilled = rated.reduce((s, l) => s + l.agreedRate, 0);

  return {
    type,
    creditClient,
    bookedLoads: booked.length,
    quotes: loads.filter((l) => l.status === 'quote').length,
    cancelled: loads.filter((l) => l.status === 'cancelled').length,
    loadsThisMonth,
    loadsLast3Months: recent.length,
    firstLoadDay: firstDay,
    lastLoadDay: booked[booked.length - 1]?.day ?? null,
    averageRate: rated.length ? Math.round((totalBilled / rated.length) * 100) / 100 : null,
    totalBilled: Math.round(totalBilled * 100) / 100,
    months: [5, 4, 3, 2, 1, 0].map((b) => {
      const month = monthBefore(thisMonth, b);
      return { month, loads: booked.filter((l) => monthOf(l.day) === month).length };
    }),
    truncated,
  };
}
