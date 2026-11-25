/*
 * The planning pop-up — step 2 of the Planner redesign (2026-11-24). This
 * file is the pure part: when the pop-up opens, how snoozing tightens, what a
 * suggestion is, and the questions "Plan my whole day" asks. No Firestore and
 * no React, so the route and the browser read the same rules.
 *
 * **It is the plan itself**, not a reminder to make one. The old planning
 * card (src/types/planning.ts) asks *when* somebody will plan and books a
 * slot; this one opens on the first page of the day with a plan ready to
 * accept — three things picked from the person's own list and from what is
 * waiting on them in TTMS — and saves it as Today's 3 in a few taps.
 *
 * **Never two pop-ups.** People on the new Planner get this one; everybody
 * else keeps the planning card. The dashboard layout decides which by
 * `plannerState()`, the same rule the sidebar uses.
 *
 * **It gets harder to put off, on purpose** (asked for: "we want planning in
 * people's faces"). The first snooze is 15 minutes, the second 5, and the
 * third time there is no snooze at all — "Just one thing" is the way back to
 * work. While snoozed, an orange bar with a countdown sits across every page.
 *
 * The day's answer is kept on the list's parent document as
 * `personalTasks/{uid}.dailyPlan` — as private as the list, and on the server
 * so that a reload, a second tab or another computer cannot reset the snooze
 * count. An answer from an earlier day reads as no answer.
 */

/** What the person has done about today's plan so far. */
export type DailyPlanStatus =
  /** Nothing yet: the pop-up opens. */
  | 'open'
  /** "Remind me in …": the bar counts down to `snoozedUntil`. */
  | 'snoozed'
  /** A plan was made — quick or whole-day. */
  | 'planned'
  /** "Just one thing": one task planned; the bar stays until Today's 3 has three. */
  | 'one'
  /** "I'm off today". */
  | 'off';

export interface DailyPlanState {
  /** `YYYY-MM-DD`, office time. */
  date: string;
  status: DailyPlanStatus;
  /** How many times today it was put off. Never goes down within a day. */
  snoozes: number;
  /** Epoch ms the snooze runs out at, when snoozed. */
  snoozedUntil: number | null;
  /** ISO time the plan was made. */
  plannedAt: string | null;
  /** The whole-day plan rather than the quick three. */
  full: boolean;
  /** ISO time the day was closed (or the close was waved away — see `closeSkipped`). */
  closedAt: string | null;
  /** "Not today" on the close-the-day pop-up: closed without going through it. */
  closeSkipped: boolean;
}

export function freshDailyPlan(date: string): DailyPlanState {
  return {
    date, status: 'open', snoozes: 0, snoozedUntil: null, plannedAt: null, full: false, closedAt: null, closeSkipped: false,
  };
}

const STATUSES: readonly DailyPlanStatus[] = ['open', 'snoozed', 'planned', 'one', 'off'];

/** The stored answer for `today`, or a fresh one when what is stored is from another day. */
export function readDailyPlan(raw: unknown, today: string): DailyPlanState {
  const r = (raw && typeof raw === 'object' ? raw : null) as Record<string, unknown> | null;
  if (!r || r.date !== today) return freshDailyPlan(today);
  const status = STATUSES.includes(r.status as DailyPlanStatus) ? (r.status as DailyPlanStatus) : 'open';
  const snoozes = typeof r.snoozes === 'number' && Number.isInteger(r.snoozes) ? Math.max(0, Math.min(r.snoozes, 9)) : 0;
  return {
    date: today,
    status,
    snoozes,
    snoozedUntil: typeof r.snoozedUntil === 'number' ? r.snoozedUntil : null,
    plannedAt: typeof r.plannedAt === 'string' ? r.plannedAt : null,
    full: r.full === true,
    closedAt: typeof r.closedAt === 'string' ? r.closedAt : null,
    closeSkipped: r.closeSkipped === true,
  };
}

// ── Snoozing ─────────────────────────────────────────────────────────────────

/**
 * How long each snooze lasts, in order. Its length is the number of snoozes
 * there are: once used up, the pop-up offers only "Just one thing".
 */
export const SNOOZE_MINUTES = [15, 5] as const;

/** The next snooze's length, or null when there is none left. */
export function nextSnoozeMinutes(snoozes: number): number | null {
  return snoozes < SNOOZE_MINUTES.length ? SNOOZE_MINUTES[snoozes] : null;
}

// ── When it opens ────────────────────────────────────────────────────────────

/**
 * Minutes before the end of somebody's shift that the same pop-up comes back
 * to close the day: 3:45 on a shift that ends at 4.
 */
export const CLOSE_DAY_BEFORE_END_MINUTES = 15;

/**
 * Office time from which somebody who has not planned gets a line in their
 * reminders room with a link that opens the pop-up. Sent once, by the
 * planner nudge cron (see vercel.json).
 */
export const PLAN_NUDGE_AT = '10:00';

/**
 * How the 10:00 line starts. The chat draws a line starting with exactly this
 * as a card with a "Plan my day" button (chatAlertCards.ts), so the two must
 * not drift apart.
 */
export const PLAN_NUDGE_LEAD = 'You haven’t planned today yet.';

/** What the pop-up should show right now, if anything. */
export type PopupMode = 'plan' | 'close' | null;

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** `HH:MM` minus some minutes, not below midnight. */
export function minusMinutes(hhmm: string, minutes: number): string {
  const t = Math.max(0, minutesOf(hhmm) - minutes);
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

/** The office time the close-the-day pop-up opens at, for this shift. */
export function closeDayAt(shift: { start: string; end: string }): string {
  return minusMinutes(shift.end, CLOSE_DAY_BEFORE_END_MINUTES);
}

/**
 * The whole rule for when the pop-up opens. `shift` null means today is not
 * a working day for this person (a day off on their schedule, a holiday, or
 * time off — pending counts, as it does for the clock-in reminder), and
 * nothing opens.
 *
 * - From the close time on, it closes the day — once, whether or not a plan
 *   was made (there is still a day to look back on). A day marked "off" is
 *   left alone.
 * - Before that, it plans the day until there is a plan, a "Just one
 *   thing", or an "I'm off today"; a running snooze holds it back.
 */
export function popupMode(
  state: DailyPlanState,
  shift: { start: string; end: string } | null,
  /** How many of Today's 3 are picked. Three picked on the Today tab is a plan made without the pop-up. */
  picks: number,
  nowTime: string,
  nowMs: number,
): PopupMode {
  if (!shift || state.status === 'off') return null;
  if (nowTime >= closeDayAt(shift)) return state.closedAt ? null : 'close';
  if (state.status === 'planned' || state.status === 'one' || picks >= 3) return null;
  if (state.status === 'snoozed' && state.snoozedUntil && nowMs < state.snoozedUntil) return null;
  return 'plan';
}

// ── Suggestions ──────────────────────────────────────────────────────────────

/**
 * Where a suggestion came from. `loads` and `clients` are the person's own
 * book (step 2 of the redesign); `queues` are the work their role decides —
 * reviews, approvals, payments, requests (step 3). A queue is offered as one
 * task for the whole queue ("Decide 2 time-off requests"), never one per
 * item: the plan is what to work on, and the queue's own screen is where the
 * items are.
 */
export type SuggestionKind =
  | 'sa'        // a booked load whose client has not signed
  | 'pickup'    // picking up today
  | 'delivery'  // delivering today
  | 'pod'       // delivered, no proof of delivery yet
  | 'quote'     // a quote nobody has touched in a week
  | 'quiet'     // a client with no load in three months
  | 'lead'      // a lead whose next step is due (step 4b)
  // ── queues (step 3) ──
  | 'reviews'      // SA and Dispatch Sheet reviews open (orders.sendAgreement)
  | 'bols'         // BOLs generated, not sent (orders.sendAgreement)
  | 'verify'       // signed copies to verify (orders.verifyRecords)
  | 'changes'      // change orders to decide (orders.applyChanges)
  | 'pickupsAll'   // every load picking up today (dispatch: orders.viewAll + orders.sendAgreement)
  | 'invoices'     // delivered loads with no invoice (orders.payments)
  | 'payments'     // delivered loads waiting on payments to close (orders.payments)
  | 'access'       // access requests on records the person decides
  | 'terms'        // terms changes to approve (agreementTerms.approve)
  | 'profile'      // profile changes to approve (profile.decideUpdates)
  | 'timeOff'      // time-off requests to decide (attendance.manage)
  | 'corrections'  // clock corrections to decide (attendance.manage)
  | 'onboarding'   // the person's own onboarding steps due
  | 'teamPlans';   // a Sales Manager's team plans, before the huddle

export type SuggestionGroup = 'queues' | 'loads' | 'clients' | 'learning';

export interface PlanSuggestion {
  /** Stable for the day: the kind plus the record's id. */
  id: string;
  kind: SuggestionKind;
  group: SuggestionGroup;
  /** What the task will be called. */
  title: string;
  /** Why it is suggested, in a few words. */
  why: string;
  /** Linked on the task when it is a load, so the task opens it. */
  order: { id: string; number: string } | null;
  /** Lower comes first. */
  rank: number;
}

/**
 * How urgent each kind is, for "Suggested 3" and the order within a group.
 * Something happening today beats paperwork; paperwork beats a nudge.
 */
export const SUGGESTION_RANK: Record<SuggestionKind, number> = {
  delivery: 1,
  pickupsAll: 1.5,
  pickup: 2,
  // Somebody is waiting on these: a broker cannot send the SA until it is reviewed.
  reviews: 2.2,
  changes: 2.4,
  verify: 2.6,
  timeOff: 2.8,
  sa: 3,
  bols: 3.2,
  access: 3.4,
  corrections: 3.6,
  profile: 3.8,
  terms: 3.9,
  pod: 4,
  invoices: 4.2,
  payments: 4.4,
  teamPlans: 4.6,
  quote: 5,
  onboarding: 5.5,
  // A follow-up the broker promised themselves, so ahead of a nudge.
  lead: 4.8,
  quiet: 6,
};

/** Which group each kind is drawn under. */
export const SUGGESTION_GROUP_OF: Record<SuggestionKind, SuggestionGroup> = {
  sa: 'loads', pickup: 'loads', delivery: 'loads', pod: 'loads', quote: 'loads',
  quiet: 'clients', lead: 'clients',
  reviews: 'queues', bols: 'queues', verify: 'queues', changes: 'queues', pickupsAll: 'queues',
  invoices: 'queues', payments: 'queues', access: 'queues', terms: 'queues', profile: 'queues',
  timeOff: 'queues', corrections: 'queues', teamPlans: 'queues',
  onboarding: 'learning',
};

/** The order the groups are drawn in. */
export const SUGGESTION_GROUPS: readonly SuggestionGroup[] = ['queues', 'loads', 'clients', 'learning'];

export const SUGGESTION_GROUP_LABEL: Record<SuggestionGroup, string> = {
  queues: 'Waiting on you',
  loads: 'Found in your loads',
  clients: 'Clients to call',
  learning: 'Your onboarding',
};

/** At most this many onboarding steps are suggested at once: the next ones, not the whole programme. */
export const MAX_ONBOARDING_SUGGESTIONS = 2;

/** At most this many per group, so the pop-up stays a pop-up. */
export const MAX_SUGGESTIONS_PER_GROUP = 6;

/** A client is "gone quiet" after this many days without a load (the client type's Dormant). */
export const QUIET_AFTER_DAYS = 90;

/** At most this many of somebody's clients are checked for going quiet — two count reads each. */
export const MAX_CLIENTS_CHECKED = 60;

// ── "Plan my whole day" ──────────────────────────────────────────────────────

/**
 * The questions the whole-day plan asks, to catch what is not on anybody's
 * list. Each can offer some of the person's own suggestions under it
 * (`kinds`), and always has a box to type into. Every role has its own set;
 * `questionsFor()` picks one.
 */
export interface PlanQuestion {
  id: string;
  ask: string;
  hint: string;
  es: { ask: string; hint: string };
  kinds: SuggestionKind[];
}

export const BROKER_QUESTIONS: PlanQuestion[] = [
  {
    id: 'waiting',
    ask: 'Who is waiting to hear from you?',
    hint: 'Calls and emails you owe.',
    es: { ask: '¿Quién está esperando saber de ti?', hint: 'Llamadas y correos que debes.' },
    kinds: ['sa', 'pod'],
  },
  {
    id: 'quotes',
    ask: 'Which quotes need a nudge?',
    hint: 'Sent, no answer yet.',
    es: { ask: '¿Qué cotizaciones necesitan un empujón?', hint: 'Enviadas, sin respuesta todavía.' },
    kinds: ['quote'],
  },
  {
    id: 'new-business',
    ask: 'Where will new business come from today?',
    hint: 'Leads, referrals, a client to win back.',
    es: { ask: '¿De dónde saldrá el negocio nuevo hoy?', hint: 'Prospectos, referidos, un cliente que recuperar.' },
    kinds: ['lead', 'quiet'],
  },
  {
    id: 'promised',
    ask: 'What did you promise someone?',
    hint: 'The easy thing to forget.',
    es: { ask: '¿Qué le prometiste a alguien?', hint: 'Lo fácil de olvidar.' },
    kinds: [],
  },
];

const PROMISED: PlanQuestion = {
  id: 'promised',
  ask: 'What did you promise someone?',
  hint: 'The easy thing to forget.',
  es: { ask: '¿Qué le prometiste a alguien?', hint: 'Lo fácil de olvidar.' },
  kinds: [],
};

export const DISPATCH_QUESTIONS: PlanQuestion[] = [
  {
    id: 'risk',
    ask: 'Which loads could go wrong today?',
    hint: 'Late pickups, tight appointments, a driver not answering.',
    es: { ask: '¿Qué cargas podrían salir mal hoy?', hint: 'Recogidas tarde, citas ajustadas, un chofer que no contesta.' },
    kinds: ['pickupsAll', 'delivery', 'pickup'],
  },
  {
    id: 'carriers',
    ask: 'Which carriers need checking?',
    hint: 'Insurance, authority, a new truck.',
    es: { ask: '¿Qué transportistas hay que revisar?', hint: 'Seguro, autoridad, un camión nuevo.' },
    kinds: ['reviews'],
  },
  {
    id: 'paperwork',
    ask: 'What paperwork is still open?',
    hint: 'Signatures, PODs, BOLs.',
    es: { ask: '¿Qué papeleo sigue abierto?', hint: 'Firmas, POD, BOL.' },
    kinds: ['verify', 'bols', 'changes', 'pod'],
  },
];

export const FINANCE_QUESTIONS: PlanQuestion[] = [
  {
    id: 'owed',
    ask: 'Who owes us?',
    hint: 'Overdue, and about to be.',
    es: { ask: '¿Quién nos debe?', hint: 'Vencido, y por vencer.' },
    kinds: ['invoices'],
  },
  {
    id: 'paying',
    ask: 'Who are we paying?',
    hint: 'Carriers and drivers due.',
    es: { ask: '¿A quién le pagamos?', hint: 'Transportistas y choferes por pagar.' },
    kinds: ['payments'],
  },
  {
    id: 'closes',
    ask: 'What closes this week?',
    hint: 'Month-end, reconciliations.',
    es: { ask: '¿Qué se cierra esta semana?', hint: 'Cierre de mes, conciliaciones.' },
    kinds: [],
  },
];

export const HR_QUESTIONS: PlanQuestion[] = [
  {
    id: 'conversation',
    ask: 'Who needs a conversation?',
    hint: 'Check-ins, returns, worries.',
    es: { ask: '¿Quién necesita una conversación?', hint: 'Seguimientos, regresos, preocupaciones.' },
    kinds: [],
  },
  {
    id: 'due',
    ask: 'What is due this week?',
    hint: 'Payroll, schedules, paperwork.',
    es: { ask: '¿Qué vence esta semana?', hint: 'Planilla, horarios, papeleo.' },
    kinds: ['timeOff', 'corrections', 'profile'],
  },
  {
    id: 'team',
    ask: 'How is the team doing?',
    hint: 'What people told you.',
    es: { ask: '¿Cómo está el equipo?', hint: 'Lo que la gente te contó.' },
    kinds: [],
  },
];

export const ADMIN_QUESTIONS: PlanQuestion[] = [
  {
    id: 'yes',
    ask: 'What is waiting on your yes?',
    hint: 'Approvals, terms, change orders.',
    es: { ask: '¿Qué está esperando tu sí?', hint: 'Aprobaciones, términos, órdenes de cambio.' },
    kinds: ['access', 'terms', 'changes', 'verify', 'profile'],
  },
  {
    id: 'blocked',
    ask: 'What will block someone else today?',
    hint: 'The thing other people need from you first.',
    es: { ask: '¿Qué bloqueará hoy a otra persona?', hint: 'Lo que otros necesitan primero de ti.' },
    kinds: ['reviews', 'bols'],
  },
  PROMISED,
];

export const INTERN_QUESTIONS: PlanQuestion[] = [
  {
    id: 'learn',
    ask: 'What will you learn today?',
    hint: 'A guide, a step on My journey.',
    es: { ask: '¿Qué vas a aprender hoy?', hint: 'Una guía, un paso de Mi recorrido.' },
    kinds: ['onboarding'],
  },
  {
    id: 'shadow',
    ask: 'Who can you shadow?',
    hint: 'Sit with a broker or dispatch for an hour.',
    es: { ask: '¿A quién puedes acompañar?', hint: 'Siéntate una hora con un broker o con despacho.' },
    kinds: [],
  },
  PROMISED,
];

/** Everybody else's questions. */
export const GENERAL_QUESTIONS: PlanQuestion[] = [
  {
    id: 'waiting',
    ask: 'Who is waiting on you?',
    hint: 'Answers, approvals, something you said you would send.',
    es: { ask: '¿Quién está esperando algo de ti?', hint: 'Respuestas, aprobaciones, algo que dijiste que enviarías.' },
    kinds: [],
  },
  {
    id: 'blocked',
    ask: 'What will block someone else if it waits?',
    hint: 'The thing other people need from you first.',
    es: { ask: '¿Qué bloqueará a otra persona si espera?', hint: 'Lo que otros necesitan primero de ti.' },
    kinds: [],
  },
  {
    id: 'promised',
    ask: 'What did you promise someone?',
    hint: 'The easy thing to forget.',
    es: { ask: '¿Qué le prometiste a alguien?', hint: 'Lo fácil de olvidar.' },
    kinds: [],
  },
];

export const MANAGER_QUESTIONS: PlanQuestion[] = [
  {
    id: 'help',
    ask: 'Who on your team needs help today?',
    hint: 'A stuck load, a quiet week, a new broker.',
    es: { ask: '¿Quién de tu equipo necesita ayuda hoy?', hint: 'Una carga atorada, una semana floja, un broker nuevo.' },
    kinds: ['teamPlans', 'access'],
  },
  {
    id: 'unblock',
    ask: 'Which deal can you unblock?',
    hint: 'A quote, a price, a client who needs the manager.',
    es: { ask: '¿Qué negocio puedes destrabar?', hint: 'Una cotización, un precio, un cliente que necesita al gerente.' },
    kinds: ['quote'],
  },
  ...BROKER_QUESTIONS.filter((q) => q.id === 'new-business'),
  PROMISED,
];

/**
 * Which questions somebody is asked: the first role that fits, in this
 * order. A person with several roles gets the one closest to their day — a
 * Sales Manager is a broker too but leads first; dispatch comes before admin
 * because an admin who also dispatches is dispatching.
 */
export function questionsFor(roles: {
  isDispatcher?: boolean; isFinance?: boolean; isHr?: boolean; isSalesManager?: boolean;
  isAdmin?: boolean; isIntern?: boolean; broker: boolean;
}): PlanQuestion[] {
  if (roles.isDispatcher) return DISPATCH_QUESTIONS;
  if (roles.isFinance) return FINANCE_QUESTIONS;
  if (roles.isHr) return HR_QUESTIONS;
  if (roles.isSalesManager) return MANAGER_QUESTIONS;
  if (roles.isAdmin) return ADMIN_QUESTIONS;
  if (roles.isIntern) return INTERN_QUESTIONS;
  return roles.broker ? BROKER_QUESTIONS : GENERAL_QUESTIONS;
}

/** How long each of the 3 is given when the pop-up places it on the day, unless changed. */
export const PLAN_ITEM_MINUTES = 30;

/** Fired by anything that changes the day's plan, so the bar and the pop-up re-read it. */
export const DAILY_PLAN_CHANGED_EVENT = 'ttms:daily-plan-changed';

/** Fired to open the pop-up on purpose (the bar's "Plan now", the 10:00 link). */
export const DAILY_PLAN_OPEN_EVENT = 'ttms:daily-plan-open';

/** `?plan=1` on any dashboard address opens the pop-up — what the 10:00 line links to. */
export const PLAN_NOW_PARAM = 'plan';
