/*
 * Leads and sales activity on a client — step 4b of the Planner redesign
 * (2026-11-25). Pure: no Firestore, no React, no clock.
 *
 * **A lead is a client record**, one step before a prospect: found, contacted,
 * quoted, then its first load. Nothing about the client itself is new — the
 * party, its owners and who can open it are exactly as before. What is new is
 * kept beside it, in `clientSales/{partyId}`:
 *
 *  - whether it is being worked as a lead, its stage, and the next step;
 *  - `activity/{id}` under it: every call, email and note logged on the client,
 *    by whom and when.
 *
 * **Who sees it** (decided 2026-11-24): the broker working the client, their
 * Sales Manager (`managedUids`) and `sales.viewAll` — the same three as the
 * daily numbers, and narrower than the client record on purpose. Somebody who
 * can open the client under an approval, or dispatch maintaining its details,
 * sees the client and not its sales history. "The broker" is anybody who owns
 * the party (`assignedToUids`) plus whoever is named on the lead
 * (`brokerUid`). Closed to the browser: `clientSales` has no Firestore rule;
 * everything goes through `/api/parties/{id}/sales` and `/api/sales/leads`.
 *
 * **"First load" is never stored.** The stored stage stops at Quoted. Once the
 * client has a booked load, the strip on its page switches to the client type
 * TTMS already works out from its loads (src/types/clientSnapshot.ts), and the
 * lead leaves the My leads board a month later. `wonAt` records the first time
 * TTMS noticed, so the board can show it in the First load column for a while
 * without reading the client's loads on every visit. Quoted is also worked out
 * — a client with any load at all has been quoted — so a quote made the
 * ordinary way moves the lead without anybody touching the board.
 *
 * Keyed by party id, so a change of email (src/lib/emailChange.ts) has nothing
 * here to move; people are named by uid.
 */

export const CLIENT_SALES_COLLECTION = 'clientSales';

/** The stages somebody can put a lead in. First load is TTMS's to decide. */
export const LEAD_STAGES = ['found', 'contacted', 'quoted'] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

/** The board's columns: the three stages and the one TTMS works out. */
export const BOARD_COLUMNS = ['found', 'contacted', 'quoted', 'won'] as const;
export type BoardColumn = (typeof BOARD_COLUMNS)[number];

export const BOARD_COLUMN_LABEL: Record<BoardColumn, string> = {
  found: 'Found',
  contacted: 'Contacted',
  quoted: 'Quoted',
  won: 'First load',
};

export const BOARD_COLUMN_HINT: Record<BoardColumn, string> = {
  found: 'Found, not spoken to yet.',
  contacted: 'Talked to or emailed.',
  quoted: 'Has a quote. Moves here by itself when a load is created for them.',
  won: 'Booked a load. Moves here by itself, and leaves the board a month later.',
};

export function isLeadStage(v: unknown): v is LeadStage {
  return typeof v === 'string' && (LEAD_STAGES as readonly string[]).includes(v);
}

/** A won lead stays on the board this long, so the week's wins can be seen. */
export const WON_SHOWN_DAYS = 30;

/** What can be logged on a client. */
export const ACTIVITY_KINDS = ['call', 'email', 'note'] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

/** What else the history records, written by TTMS rather than logged. */
export type ActivityEventKind = ActivityKind | 'lead' | 'stage' | 'next' | 'lost' | 'reopened';

export function isActivityKind(v: unknown): v is ActivityKind {
  return typeof v === 'string' && (ACTIVITY_KINDS as readonly string[]).includes(v);
}

export const ACTIVITY_LABEL: Record<ActivityEventKind, string> = {
  call: 'Call',
  email: 'Email',
  note: 'Note',
  lead: 'Started as a lead',
  stage: 'Moved',
  next: 'Next step',
  lost: 'Marked lost',
  reopened: 'Reopened',
};

export const MAX_ACTIVITY_TEXT = 2000;
export const MAX_NEXT_STEP = 200;
/** The history on a client's page shows this many, newest first. */
export const ACTIVITY_SHOWN = 50;

/** The lead side of a client, as the browser receives it. */
export interface ClientSales {
  partyId: string;
  /** The client's name when last written, for the board. */
  partyName: string;
  /** Worked as a lead. False for a client that only has activity logged on it. */
  isLead: boolean;
  /** The stage somebody put it in. Read through `leadColumn()`. */
  stage: LeadStage;
  /** Whoever is working it. Set when it became a lead. */
  brokerUid: string | null;
  brokerName: string;
  nextStep: string;
  /** Office `YYYY-MM-DD`, or null. */
  nextDue: string | null;
  lost: boolean;
  lostReason: string;
  /** ISO, the first time TTMS saw a booked load for this client. */
  wonAt: string | null;
  lastContactAt: string | null;
  createdAt: string | null;
}

export interface ActivityEntry {
  id: string;
  kind: ActivityEventKind;
  text: string;
  /** For `stage`: where it moved to. */
  stage?: LeadStage | null;
  at: string;
  byUid: string;
  byName: string;
}

/** What a client's page gets. */
export interface ClientSalesView {
  /** False: the caller may open the client, but not its sales history. Nothing else is sent. */
  visible: boolean;
  sales: ClientSales | null;
  activity: ActivityEntry[];
  /** Has the client got a booked load? Decides between the lead strip and the client type. */
  booked: boolean;
  /** Has the client any load at all, a quote included? */
  quoted: boolean;
}

/** One card on My leads. */
export interface LeadCard extends ClientSales {
  column: BoardColumn;
  /** The client's lead source label, for the card. */
  sourceLabel: string;
}

/**
 * Where a lead stands, all things known: booked beats everything, any load
 * means at least Quoted, otherwise the stage somebody chose.
 */
export function leadColumn(stage: LeadStage, facts: { booked: boolean; quoted: boolean }): BoardColumn {
  if (facts.booked) return 'won';
  if (facts.quoted && stage !== 'quoted') return 'quoted';
  return stage;
}

/** Logging a call or an email moves a lead that was only found. Nothing moves backwards. */
export function stageAfterContact(stage: LeadStage): LeadStage {
  return stage === 'found' ? 'contacted' : stage;
}

/** Is the follow-up due by `today`? */
export function followUpDue(s: Pick<ClientSales, 'nextDue' | 'lost' | 'isLead'>, today: string): boolean {
  return s.isLead && !s.lost && !!s.nextDue && s.nextDue <= today;
}

/**
 * The next step shown under each kind of client once it has loads, for the
 * client page — the account-keeping half of the plan (the leads half is
 * `nextStep`, typed by the broker). Keyed by client type id.
 */
export const ACCOUNT_NEXT_STEP: Record<string, string> = {
  new: 'Ask how often they ship this lane',
  potential: 'Ask for the next load',
  recurrent: 'Ask for a referral, and check in each quarter',
  occasional: 'Call to find out what they ship in between',
  dormant: 'Win-back call',
};
