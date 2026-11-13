/**
 * The Agreements and BOLs card on the Approvals screen (2026-11-13): every
 * Shipper Agreement, Dispatch Sheet and BOL request as one list of rows, each
 * able to tell its whole story. Served by GET /api/approvals/paperwork; drawn
 * by src/components/orders/PaperworkSection.tsx.
 *
 * Nothing here is stored. A row is a request document (the round in
 * progress, see SaRequest and BolRequest) read together with its load's
 * status, and the story under it is the load's saved rounds.
 */

import { changeSummary, type SaRequest, type SaRound } from './saRequest';
import type { BolRequest } from './bolRequest';

export interface PaperworkResponse {
  isReviewer: boolean;
  agreements: SaRequest[];
  bols: BolRequest[];
  /** Each load's status, by order id. 'deleted' for a load that no longer exists. */
  orderStatus: Record<string, string>;
  /** The History range the answer covers, epoch ms. */
  from: number;
  to: number;
}

export type PaperworkKind = 'sa' | 'ds' | 'bol';

/**
 * Where a row stands. `closed` is never stored: it is a request still open,
 * sent or sent back on a load that has since ended — see paperworkStatus().
 */
export type PaperworkStatus = 'open' | 'sent' | 'returned' | 'done' | 'closed';

export const PAPERWORK_KIND_LABEL: Record<PaperworkKind, string> = {
  sa:  'Shipper Agreement (SA)',
  ds:  'Dispatch Sheet',
  bol: 'BOL',
};

/** The short names, for the By load view's steps. */
export const PAPERWORK_KIND_SHORT: Record<PaperworkKind, string> = {
  sa:  'SA',
  ds:  'Dispatch Sheet',
  bol: 'BOL',
};

export const PAPERWORK_STATUS_LABEL: Record<PaperworkStatus, string> = {
  open:     'Waiting for review',
  sent:     'Sent — mark done',
  returned: 'Sent back to broker',
  done:     'Done',
  closed:   'Closed',
};

/** Still somebody's to do. A closed row is not, whatever it was before. */
export function isPaperworkOpen(s: PaperworkStatus): boolean {
  return s === 'open' || s === 'sent' || s === 'returned';
}

/**
 * Why a request on an ended load stops being work, or null while the load is
 * live. An agreement nobody signed is moot once the load is cancelled or
 * delivered — the same loads scripts/backfill-carrier-instructions skips. A
 * BOL closes only on a cancelled load: a delivered one may still need its BOL
 * sent for billing.
 */
export function closedBecause(kind: PaperworkKind, orderStatus: string | undefined): string | null {
  if (orderStatus === 'cancelled') return 'Load cancelled';
  if (orderStatus === 'deleted') return 'Load deleted';
  if (kind !== 'bol' && (orderStatus === 'delivered' || orderStatus === 'completed')) {
    return orderStatus === 'delivered' ? 'Load delivered' : 'Load completed';
  }
  return null;
}

export interface PaperworkRow {
  /** Unique across the list: kind and order. */
  key: string;
  kind: PaperworkKind;
  orderId: string;
  orderNumber: string;
  /** Who it is for: the client on an SA, the carrier on a Dispatch Sheet, both on a BOL. */
  name: string;
  status: PaperworkStatus;
  /** Set on a `closed` row: "Load cancelled". */
  closedBecause: string | null;
  /** What happened last, in words: "Sent back by Ana: payment terms missing". */
  line: string;
  /** When it reached where it stands now, epoch ms — what "Waiting 3 days" counts from. */
  since: number;
  /** The latest step of any kind, epoch ms — what History sorts and groups by. */
  at: number;
  /** Lower-case text the search box matches. */
  search: string;
  sa: SaRequest | null;
  bol: BolRequest | null;
}

function agreementRow(r: SaRequest, orderStatus: string | undefined): PaperworkRow {
  const kind: PaperworkKind = r.party === 'carrier' ? 'ds' : 'sa';
  let line: string;
  let since: number;
  if (r.status === 'done') {
    line = `Done by ${r.doneByName ?? 'somebody'}`;
    since = r.doneAt ?? r.requestedAt;
  } else if (r.status === 'returned') {
    line = `Sent back by ${r.returnedByName ?? 'somebody'}${r.returnReason ? `: ${r.returnReason}` : ''}`;
    since = r.returnedAt ?? r.requestedAt;
  } else if (r.status === 'sent') {
    line = `Sent by ${r.sentByName ?? 'somebody'}${r.sentTo ? ` to ${r.sentTo}` : ''}`;
    since = r.sentAt ?? r.requestedAt;
  } else {
    line = r.reason === 'changed'
      ? `Order changed by ${r.requestedByName} after it was sent`
      : `${r.byReviewer ? 'Started' : 'Asked'} by ${r.requestedByName}`;
    since = r.requestedAt;
  }
  const why = isPaperworkOpen(r.status) ? closedBecause(kind, orderStatus) : null;
  const name = kind === 'ds' ? (r.carrierName || r.clientName) : r.clientName;
  return {
    key: `${kind}-${r.orderId}`, kind, orderId: r.orderId, orderNumber: r.orderNumber, name,
    status: why ? 'closed' : r.status,
    closedBecause: why,
    line, since,
    at: Math.max(r.requestedAt, r.sentAt ?? 0, r.returnedAt ?? 0, r.doneAt ?? 0),
    search: [r.orderNumber, r.clientName, r.carrierName, r.requestedByName, r.sentByName, r.returnedByName,
      r.doneByName, r.returnReason, r.sentTo].filter(Boolean).join(' ').toLowerCase(),
    sa: r, bol: null,
  };
}

function bolRow(b: BolRequest, orderStatus: string | undefined): PaperworkRow {
  const last = b.sends[b.sends.length - 1];
  let line: string;
  let since: number;
  if (b.status === 'done') {
    line = `Done by ${b.doneByName ?? 'somebody'}`;
    since = b.doneAt ?? b.openedAt;
  } else if (b.status === 'sent' && last) {
    line = `Sent by ${last.byName} to ${last.to.map((t) => t.label || t.email).join(', ')}`;
    since = last.at;
  } else {
    line = b.openedBecause ? `Ready: ${b.openedBecause}` : 'Ready to send';
    since = b.openedAt;
  }
  const why = b.status !== 'done' ? closedBecause('bol', orderStatus) : null;
  return {
    key: `bol-${b.orderId}`, kind: 'bol', orderId: b.orderId, orderNumber: b.orderNumber,
    name: [b.clientName, b.carrierName].filter(Boolean).join(' · '),
    status: why ? 'closed' : b.status,
    closedBecause: why,
    line, since,
    at: Math.max(b.openedAt, b.doneAt ?? 0, ...b.sends.map((s) => s.at)),
    search: [b.orderNumber, b.clientName, b.carrierName, b.doneByName, ...b.sends.map((s) => s.byName)]
      .filter(Boolean).join(' ').toLowerCase(),
    sa: null, bol: b,
  };
}

export function paperworkRows(data: PaperworkResponse): PaperworkRow[] {
  return [
    ...data.agreements.map((r) => agreementRow(r, data.orderStatus[r.orderId])),
    ...data.bols.map((b) => bolRow(b, data.orderStatus[b.orderId])),
  ];
}

/** One step in a row's story. */
export interface PaperworkEvent {
  at: number;
  tone: 'open' | 'sent' | 'returned' | 'done';
  title: string;
  detail: string;
}

type RoundLike = Pick<SaRound, 'reason' | 'note' | 'requestedByName' | 'requestedAt' | 'sentAt' | 'sentByName' | 'sentTo'
  | 'sends' | 'doneAt' | 'doneByName' | 'returnedAt' | 'returnedByName' | 'returnReason'> & { kind?: SaRound['kind'] };

function roundEvents(r: RoundLike): PaperworkEvent[] {
  const out: PaperworkEvent[] = [];
  if (r.kind !== 'direct' && r.requestedAt) {
    out.push(r.reason === 'changed'
      ? { at: r.requestedAt, tone: 'open', title: `Order changed by ${r.requestedByName} after it was sent`, detail: changeSummary(r.note) }
      : { at: r.requestedAt, tone: 'open', title: `Asked by ${r.requestedByName}`, detail: r.note });
  }
  if (r.sends.length) {
    for (const s of r.sends) {
      const what = s.kind === 'revision' ? 'Revised version sent' : s.kind === 'resend' ? 'Sent again' : 'Sent';
      out.push({
        at: s.at, tone: 'sent', title: `${what} by ${s.byName}`,
        detail: [`To ${s.sentTo}`, s.cc.length ? `copied to ${s.cc.join(', ')}` : '', `version ${s.version}`].filter(Boolean).join(' · '),
      });
    }
  } else if (r.sentAt) {
    out.push({ at: r.sentAt, tone: 'sent', title: `Sent by ${r.sentByName ?? 'somebody'}`, detail: r.sentTo ? `To ${r.sentTo}` : '' });
  }
  if (r.returnedAt) {
    out.push({ at: r.returnedAt, tone: 'returned', title: `Sent back by ${r.returnedByName ?? 'somebody'}`, detail: r.returnReason ?? '' });
  }
  if (r.doneAt) {
    out.push({ at: r.doneAt, tone: 'done', title: `Marked done by ${r.doneByName ?? 'somebody'}`, detail: '' });
  }
  return out;
}

/**
 * An agreement's story, oldest first: every saved round of the load, and the
 * round in progress (which may not have been copied into the rounds yet). A
 * step present in both is shown once.
 */
export function agreementEvents(rounds: SaRound[], current: SaRequest): PaperworkEvent[] {
  const all = [...rounds.flatMap(roundEvents), ...roundEvents({ ...current, sends: [] })];
  const seen = new Set<string>();
  return all
    .filter((e) => {
      const k = `${e.tone}|${Math.round(e.at / 60000)}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => a.at - b.at);
}

export function bolEvents(b: BolRequest): PaperworkEvent[] {
  const out: PaperworkEvent[] = [
    { at: b.openedAt, tone: 'open', title: 'BOL ready to send', detail: b.openedBecause },
    ...b.sends.map((s): PaperworkEvent => ({
      at: s.at, tone: 'sent', title: `Sent by ${s.byName}`,
      detail: `To ${s.to.map((t) => (t.label ? `${t.label} (${t.email})` : t.email)).join(', ')}`,
    })),
  ];
  if (b.doneAt) out.push({ at: b.doneAt, tone: 'done', title: `Marked done by ${b.doneByName ?? 'somebody'}`, detail: '' });
  return out.sort((a, b2) => a.at - b2.at);
}
