import { adminDb } from './firebase-admin';
import { can, canSeeAllOrders, normalizeEmail, ALLOWED_USERS_COLLECTION } from './accessControl';
import type { Caller } from './partyAccess';
import { pendingForDecider } from './accessRequests';
import { canApplyOrderChanges, CHANGE_ORDERS_COLLECTION } from './changeOrders';
import { canApproveTerms, termsRequests } from './termsChangeServer';
import { viewClock, viewQuery } from './orderViews';
import { myProgram } from './onboardingServer';
import { CHECKLIST } from './onboarding/checklist';
import { REQUEST_COLLECTION } from '@/types/saRequest';
import { BOL_REQUESTS_COLLECTION } from '@/types/bolRequest';
import { ORDER_FILES_COLLECTION } from '@/types/orderFile';
import { ORDER_ACCESS_REQUESTS_COLLECTION } from '@/types/orderAccessRequest';
import { PROFILE_UPDATE_REQUESTS_COLLECTION } from '@/types/profileUpdateRequest';
import { CORRECTIONS_COLLECTION, TIME_OFF_COLLECTION } from '@/types/attendance';
import { PENDING_PICKUP } from '@/types/orderView';
import { ONBOARDING_STAGES, currentStage, programmeDay, stepAppliesTo, stepDone } from '@/types/onboarding';
import { officeToday } from '@/types/celebration';
import {
  MAX_ONBOARDING_SUGGESTIONS, SUGGESTION_GROUP_OF, SUGGESTION_RANK,
  type PlanSuggestion, type SuggestionKind,
} from '@/types/dailyPlan';

/*
 * The work each role decides, as planning-pop-up suggestions — step 3 of the
 * Planner redesign. See src/types/dailyPlan.ts.
 *
 * **The same gate as the queue's own screen, and nothing wider.** Each queue
 * is asked about only when the caller holds the permission its route checks —
 * `orders.sendAgreement` for agreement reviews and BOLs, `orders.verifyRecords`
 * for signed copies, `canApplyOrderChanges()` for change orders,
 * `orders.payments` for invoices and payments, `canApproveTerms()`,
 * `profile.decideUpdates`, `attendance.manage` — and access requests go
 * through `pendingForDecider()`, the function the Approvals screen itself
 * uses. A broker without any of those is asked nothing here.
 *
 * **Counts, not lists.** A queue becomes one suggestion ("Decide 2 time-off
 * requests") with a link to the screen it is worked on, so most of these are
 * a `count()` — one read per thousand counted. The few that are not are small
 * by nature (pending requests) or bounded by the day (pickups today).
 *
 * Nothing here is stored, and nothing about another person is named: a
 * suggestion says how many, never whose.
 */

function queue(kind: SuggestionKind, n: number, title: string, why: string): PlanSuggestion | null {
  if (n <= 0) return null;
  return {
    id: `${kind}:queue`,
    kind,
    group: SUGGESTION_GROUP_OF[kind],
    title: title.slice(0, 200),
    why: why.slice(0, 200),
    order: null,
    rank: SUGGESTION_RANK[kind],
  };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const count = async (q: FirebaseFirestore.Query) => (await q.count().get()).data().count;

/** Each queue on its own, so one that fails costs that suggestion and never the pop-up. */
type Source = () => Promise<PlanSuggestion | PlanSuggestion[] | null>;

function sourcesFor(caller: Caller, today: string): Source[] {
  const p = caller.profile;
  const out: Source[] = [];
  const orders = adminDb.collection('orders').where('parentOrderId', '==', null);

  if (can(p, 'orders.sendAgreement')) {
    out.push(async () => {
      const [sa, ca] = await Promise.all([
        count(adminDb.collection(REQUEST_COLLECTION.client).where('status', '==', 'open')),
        count(adminDb.collection(REQUEST_COLLECTION.carrier).where('status', '==', 'open')),
      ]);
      const parts = [sa ? plural(sa, 'SA', 'SAs') : '', ca ? plural(ca, 'Dispatch Sheet', 'Dispatch Sheets') : ''].filter(Boolean);
      return queue('reviews', sa + ca, `Review ${plural(sa + ca, 'agreement request', 'agreement requests')}`, `${parts.join(' and ')} waiting · Approvals`);
    });
    out.push(async () => {
      const n = await count(adminDb.collection(BOL_REQUESTS_COLLECTION).where('status', '==', 'open'));
      return queue('bols', n, `Send ${plural(n, 'BOL', 'BOLs')}`, 'Both sides signed, BOL not sent yet · Approvals');
    });
    // Every load picking up today is dispatch's to watch, not only their own.
    if (canSeeAllOrders(p)) {
      out.push(async () => {
        // Pickup dates are stored as midnight UTC of the day typed, so today
        // is the UTC day — see dayOf() in plannerSuggestionsServer.ts. One
        // single-field range, indexed by itself; the rest is checked here.
        const start = new Date(`${today}T00:00:00Z`);
        const end = new Date(start.getTime() + 86_400_000);
        const snap = await adminDb.collection('orders')
          .where('pickupDate', '>=', start).where('pickupDate', '<', end)
          .select('status', 'parentOrderId').get();
        const n = snap.docs.filter((d) => !d.data().parentOrderId
          && (PENDING_PICKUP as readonly string[]).includes(String(d.data().status))).length;
        return queue('pickupsAll', n, `Confirm ${plural(n, 'pickup', 'pickups')} today`, 'Loads picking up today, company-wide · Orders');
      });
    }
  }

  if (can(p, 'orders.verifyRecords')) {
    out.push(async () => {
      const n = await count(adminDb.collection(ORDER_FILES_COLLECTION).where('review', '==', 'pending'));
      return queue('verify', n, `Verify ${plural(n, 'signed copy', 'signed copies')}`, 'Uploaded and waiting for a check · Approvals');
    });
  }

  if (canApplyOrderChanges(caller)) {
    out.push(async () => {
      const n = await count(adminDb.collection(CHANGE_ORDERS_COLLECTION).where('status', '==', 'pending'));
      return queue('changes', n, `Decide ${plural(n, 'change order', 'change orders')}`, 'A broker is waiting on your answer · Approvals');
    });
  }

  if (can(p, 'orders.payments')) {
    out.push(async () => {
      // The dashboard's own "Overdue invoices" card: the same query, so the
      // same number (src/lib/orderViews.ts).
      const n = await count(viewQuery('overdue_invoices', orders, viewClock()));
      return queue('invoices', n, `Invoice ${plural(n, 'delivered load', 'delivered loads')}`, 'Delivered, no invoice uploaded yet · Orders');
    });
    out.push(async () => {
      // A delivered load closes by itself once both payments are recorded
      // (settlementStatus()), so every delivered load is one waiting on money.
      const n = await count(orders.where('status', '==', 'delivered'));
      return queue('payments', n, `Record payments on ${plural(n, 'delivered load', 'delivered loads')}`, 'They close once client and driver payments are in · Orders');
    });
  }

  // Access requests: whoever decides them, by the Approvals screen's own rule.
  out.push(async () => {
    const [parties, loads] = await Promise.all([
      pendingForDecider('partyAccessRequests', caller),
      pendingForDecider(ORDER_ACCESS_REQUESTS_COLLECTION, caller),
    ]);
    const n = parties.length + loads.length;
    return queue('access', n, `Answer ${plural(n, 'access request', 'access requests')}`, 'Colleagues asking to use a client or a load · Approvals');
  });

  if (canApproveTerms(caller)) {
    out.push(async () => {
      const n = await count(termsRequests().where('status', '==', 'pending'));
      return queue('terms', n, `Decide ${plural(n, 'terms change', 'terms changes')}`, 'Agreement terms proposed by dispatch · Approvals');
    });
  }

  if (can(p, 'profile.decideUpdates')) {
    out.push(async () => {
      const n = await count(adminDb.collection(PROFILE_UPDATE_REQUESTS_COLLECTION).where('status', '==', 'pending'));
      return queue('profile', n, `Approve ${plural(n, 'profile change', 'profile changes')}`, 'People correcting their own details · Approvals');
    });
  }

  if (can(p, 'attendance.manage')) {
    const me = normalizeEmail(caller.email);
    // Read rather than counted: nobody decides their own, so the caller's
    // own requests are taken out, and pending ones are few by nature.
    out.push(async () => {
      const snap = await adminDb.collection(TIME_OFF_COLLECTION).where('status', '==', 'pending').select('email').get();
      const n = snap.docs.filter((d) => d.data().email !== me).length;
      return queue('timeOff', n, `Decide ${plural(n, 'time-off request', 'time-off requests')}`, 'Waiting on HR · Attendance');
    });
    out.push(async () => {
      const snap = await adminDb.collection(CORRECTIONS_COLLECTION).where('status', '==', 'pending').select('email').get();
      const n = snap.docs.filter((d) => d.data().email !== me).length;
      return queue('corrections', n, `Review ${plural(n, 'clock correction', 'clock corrections')}`, 'Waiting on HR · Attendance');
    });
  }

  // A Sales Manager's team, before the huddle: the plans they shared.
  if (p.isSalesManager && (p.managedUids?.length ?? 0) > 0) {
    out.push(async () => queue('teamPlans', 1, 'Look over your team’s plans', 'Before the huddle · Planner → Calendar → Team plans'));
  }

  // The person's own onboarding, for their first 90 days.
  out.push(async () => onboardingSteps(caller, today));

  return out;
}

/**
 * The next steps of the caller's own 90 days that are theirs to do — the
 * new hire's (`owner: 'you'`), in the stage they are in or earlier, not done
 * yet. Their own record only, through `myProgram()`, which is what My
 * journey reads.
 */
async function onboardingSteps(caller: Caller, today: string): Promise<PlanSuggestion[]> {
  const email = normalizeEmail(caller.email);
  if (!email) return [];
  // Most people are past their 90 days: one read of their own entry decides
  // that before the programme document is read at all.
  const entry = await adminDb.collection(ALLOWED_USERS_COLLECTION).doc(email).get();
  const start = typeof entry.data()?.startDate === 'string' ? entry.data()!.startDate as string : null;
  const day = programmeDay(start, today);
  if (day === null || day > 90) return [];

  const program = await myProgram({ uid: caller.uid, email, name: caller.displayName, profile: caller.profile, manages: false });
  const stage = ONBOARDING_STAGES.indexOf(currentStage(program.startDate, today));
  return CHECKLIST
    .filter((s) => s.owner === 'you' && stepAppliesTo(s, program.track)
      && ONBOARDING_STAGES.indexOf(s.stage) <= stage && !stepDone(s, program))
    .sort((a, b) => ONBOARDING_STAGES.indexOf(a.stage) - ONBOARDING_STAGES.indexOf(b.stage) || a.order - b.order)
    .slice(0, MAX_ONBOARDING_SUGGESTIONS)
    .map((s) => ({
      id: `onboarding:${s.id}`,
      kind: 'onboarding' as const,
      group: SUGGESTION_GROUP_OF.onboarding,
      title: s.title.en.slice(0, 200),
      why: `${s.when.en} · My onboarding`,
      order: null,
      rank: SUGGESTION_RANK.onboarding,
    }));
}

/** Every queue suggestion for this caller, most pressing first. */
export async function queueSuggestionsFor(caller: Caller): Promise<PlanSuggestion[]> {
  const today = officeToday();
  const results = await Promise.all(sourcesFor(caller, today).map((source) => source().catch((e) => {
    console.error('Planner queue suggestion failed', e instanceof Error ? e.message : e);
    return null;
  })));
  return results.flat()
    .filter((s): s is PlanSuggestion => !!s)
    .sort((a, b) => a.rank - b.rank);
}
