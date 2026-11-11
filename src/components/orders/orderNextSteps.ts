import type { FixTarget } from './fixTargets';
import { READINESS_FIX } from './fixTargets';
import { fmcsaConcerns, officeDay, type FmcsaCheck } from '@/types/fmcsa';
import { orderDeliveries, orderPickups, serviceChargeLines, dockEndOf, STATUS_RANK, type Order } from '@/types/order';
import type { ReadinessItem } from '@/types/orderReadiness';
import type { SaRequest } from '@/types/saRequest';

/**
 * What actually stands between this load and its next status, for the
 * "Next step" card on the order (2026-11-10).
 *
 * The card used to say one fixed sentence per status — "send the driver their
 * trip link" on every Carrier Signed load — which was wrong whenever the load
 * had drifted since: fields emptied by an edit, dates gone by, both
 * agreements held for resending, a carrier FMCSA no longer lets operate. The
 * broker was told to move a load that could not move. This lists those
 * problems first, worst first, and the status sentence only once there are
 * none.
 *
 * Pure: everything that lives in another record — the readiness list (which
 * already reads the client's email and the carrier's numbers), the carrier's
 * last FMCSA answer, the two reviews — is passed in, and anything not passed
 * is simply not checked. It never blocks anything: the guards that refuse a
 * send or a status stay where they are (send routes, updateOrderAsCaller,
 * generateBol). This only says what to work on.
 */

export type NextStepLevel = 'bad' | 'warn';

export interface NextStepIssue {
  key: string;
  level: NextStepLevel;
  title: string;
  /** One sentence: what is wrong, and what to do. */
  text: string;
  /** Where the fix is. Absent when it is a review panel (`panel`) or nothing to click. */
  fix?: FixTarget;
  /** A rail panel that holds the fix — the SA or Dispatch Sheet review. */
  panel?: 'sa' | 'ca';
}

export interface NextStepFacts {
  /** orderReadiness() for this load, from the server. Null while loading. */
  readiness?: ReadinessItem[] | null;
  /** The assigned carrier's last FMCSA answer, and its MC for the "this is us" test. */
  carrier?: { fmcsa?: FmcsaCheck | null; mc?: string | null } | null;
  saReq?: SaRequest | null;
  caReq?: SaRequest | null;
  /** YYYY-MM-DD in office time; injectable so it can be reasoned about. */
  today?: string;
}

/** Epoch ms of a stored date, whichever way it arrived (SDK Timestamp, or JSON from the API). */
function millis(v: unknown): number | null {
  if (!v) return null;
  if (v instanceof Date) return v.getTime();
  const o = v as { toMillis?: () => number; _seconds?: number; seconds?: number };
  if (typeof o.toMillis === 'function') return o.toMillis();
  const s = typeof o._seconds === 'number' ? o._seconds : typeof o.seconds === 'number' ? o.seconds : null;
  return s == null ? null : s * 1000;
}

/**
 * The office day a stop date stands for. Forms store a date as noon in the
 * browser's zone (edit page, ExtraStopsFields), so for the office that is
 * midday of the day typed — taking it through office time can never slip a day.
 */
function dayOfStop(v: unknown): string | null {
  const ms = millis(v);
  return ms == null ? null : officeDay(ms);
}

const rank = (o: Partial<Order>) => (o.status && o.status !== 'cancelled' ? STATUS_RANK[o.status] ?? 0 : -1);

export function orderNextSteps(order: Partial<Order>, facts: NextStepFacts = {}): NextStepIssue[] {
  if (!order.status || order.status === 'cancelled' || order.status === 'completed') return [];
  const out: NextStepIssue[] = [];
  const today = facts.today ?? officeDay();
  const r = rank(order);

  // 1. A carrier FMCSA says cannot haul. Nothing else matters until that is
  //    settled — another carrier, or a fresh check that comes back clean.
  if (order.carrierId && facts.carrier) {
    const check = facts.carrier.fmcsa;
    if (!check) {
      out.push({
        key: 'fmcsaNever', level: 'warn', title: 'Check the carrier with FMCSA',
        text: 'This carrier has never been checked against FMCSA. Run the check on the Carrier card before the load moves.',
        fix: { kind: 'carrier' },
      });
    } else {
      const bad = fmcsaConcerns(check, facts.carrier.mc ?? undefined).filter((c) => c.level === 'bad');
      if (bad.length) {
        out.push({
          key: 'fmcsaBad', level: 'bad', title: 'The carrier is not valid with FMCSA',
          text: `${bad[0].text}${bad.length > 1 ? ` (and ${bad.length - 1} more)` : ''} Run the check again or put another carrier on the load.`,
          fix: { kind: 'carrier' },
        });
      }
    }
  }

  // 2. Fields the paperwork prints that are empty. Before Client Signed only
  //    the SA's lines are the broker's problem (the BOL's — carrier, driver —
  //    come later); from then on every line counts, because the BOL is next.
  for (const i of facts.readiness ?? []) {
    if (i.ok !== false) continue;
    if (i.doc === 'bol' && r < STATUS_RANK.shipper_signed) continue;
    out.push({
      key: `ready:${i.key}`, level: 'bad', title: `Fill in: ${i.label}`,
      text: i.hint || 'It prints on the paperwork and is empty.',
      fix: READINESS_FIX[i.key],
    });
  }

  // 3. A service or dock help TTL hires with no provider picked. Not a
  //    paperwork blank — the provider never prints — but if TTL is the one
  //    booking the crane, somebody has to know which crane.
  const unprovided = [
    ...serviceChargeLines(order).filter((l) => l.arrangedBy === 'ttl' && !l.providerId).map((l) => l.label || 'A service'),
    ...(['pickup', 'delivery'] as const).flatMap((end) => {
      const { help } = dockEndOf(order, end);
      return help?.hiredBy === 'ttl' && !help.providerId ? [`The ${end === 'pickup' ? 'loading' : 'unloading'} help`] : [];
    }),
  ];
  if (unprovided.length) {
    out.push({
      key: 'provider', level: 'warn', title: 'Pick who TTL hires',
      text: `${[...new Set(unprovided)].join(', ')} — TTL arranges it, but no provider is chosen. Pick one under Price and Terms or Loading and Unloading.`,
      fix: { kind: 'edit', section: 'price', field: 'serviceCharges' },
    });
  }

  // 4. Dates that have gone by while the load has not. A pickup is overdue
  //    until the driver reports it (In Transit); a delivery until Delivered.
  const late = (stops: ReturnType<typeof orderPickups>, word: string) =>
    stops.flatMap((s, i) => {
      const last = dayOfStop(s.dateEnd) ?? dayOfStop(s.date);
      return last && last < today ? [stops.length > 1 ? `${word} ${i + 1}` : word] : [];
    });
  const lateStops = [
    ...(r < STATUS_RANK.in_transit ? late(orderPickups(order), 'pickup') : []),
    ...(r < STATUS_RANK.delivered ? late(orderDeliveries(order), 'delivery') : []),
  ];
  if (lateStops.length) {
    const list = lateStops.join(', ');
    out.push({
      key: 'pastDates', level: 'bad', title: 'Dates are in the past',
      text: `The ${list} date${lateStops.length > 1 ? 's have' : ' has'} passed and the load has not moved. Put in the new dates — the SA and Dispatch Sheet will need sending again.`,
      fix: { kind: 'edit', section: 'route', field: 'pickupDate' },
    });
  }

  // 5. Agreements held by a change and waiting to go out again. The review in
  //    the rail is where they are re-sent; this says it is the next job.
  for (const [req, panel, what, who] of [
    [facts.saReq, 'sa', 'SA', 'client'],
    [facts.caReq, 'ca', 'Dispatch Sheet', 'carrier'],
  ] as const) {
    if (!req || req.reason !== 'changed' || req.status === 'done' || req.status === 'sent') continue;
    out.push({
      key: `resend:${panel}`, level: 'bad', title: `Send the ${what} again`,
      text: req.status === 'returned'
        ? `The ${what} update was sent back${req.returnReason ? `: ${req.returnReason}` : ''}. Fix it and ask again.`
        : `The load changed after the ${what} went out, so the ${who}’s link is on hold. Review it and send it again.`,
      panel,
    });
  }

  return out.sort((a, b) => (a.level === b.level ? 0 : a.level === 'bad' ? -1 : 1));
}
