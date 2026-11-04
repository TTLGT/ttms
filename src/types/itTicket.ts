/**
 * IT tickets — anybody reports a problem, the IT role account works it.
 *
 * ## One account, by address, on purpose
 *
 * The desk side (every ticket, internal notes, status and priority) is for
 * `it@totaltransportlogistics.us` and nobody else, admins included — the same
 * person-shaped test as the Change history (src/types/changelog.ts), and for
 * the same reason: a permission would be grantable from Settings, and a ticket
 * is often somebody saying something about their computer, their account or a
 * colleague that they meant for IT alone. The address is the role account
 * every console is reached through, not a person, so it survives staff moves.
 *
 * Everybody else — interns included, so there is no permission at all — sees
 * only the tickets they raised, and never an internal note.
 *
 * ## Closed to the browser
 *
 * `itTickets` and its `messages` have no rule in firestore.rules, which means
 * every client read and write is refused; the default is deny and there is no
 * catch-all. Everything goes through /api/it-tickets, which is what lets one
 * collection hold a reporter's view and IT's view and hand each only theirs.
 * That narrowing ("this ticket, minus the internal notes") is not a query a
 * rule could express.
 *
 * ## Attachments
 *
 * Uploaded from the browser into `it-tickets/{uploaderUid}/{fileId}`, which
 * storage.rules lets the owner of that uid *create* in and do nothing else —
 * no read, no overwrite, no delete. A file is not part of a ticket until the
 * server has found it at the caller's own path and recorded it; it is read only
 * through the two-hour signed links GET /api/it-tickets/{id} hands back. Same
 * shape as order files (src/types/orderFile.ts). A screenshot of somebody's
 * screen can show anything, so it is not left readable by every staff account
 * the way chat attachments are.
 *
 * Pure and browser-safe.
 */

import { normalizeEmail } from '@/lib/accessControl';
import { CHANGELOG_VIEWER_EMAIL } from '@/types/changelog';

export const IT_TICKETS_COLLECTION = 'itTickets';
export const IT_TICKET_MESSAGES = 'messages';
/** One document, `counter`, holding the next ticket number. */
export const IT_TICKET_COUNTERS = 'itTicketCounters';

/** The same role account the Change history is for. One address, one place. */
export const IT_DESK_EMAIL = CHANGELOG_VIEWER_EMAIL;

/** The whole gate. Every API route and the page ask this. */
export function isItDesk(email: string | null | undefined): boolean {
  return normalizeEmail(email) === IT_DESK_EMAIL;
}

// ─── Status ─────────────────────────────────────────────────────────────────

export type ItTicketStatus = 'new' | 'in_progress' | 'waiting' | 'resolved' | 'closed';

export const IT_TICKET_STATUSES: readonly ItTicketStatus[] = [
  'new', 'in_progress', 'waiting', 'resolved', 'closed',
];

export function isItTicketStatus(v: unknown): v is ItTicketStatus {
  return typeof v === 'string' && (IT_TICKET_STATUSES as readonly string[]).includes(v);
}

/** How IT reads it. */
export const IT_STATUS_LABEL: Record<ItTicketStatus, string> = {
  new:         'New',
  in_progress: 'Working on it',
  waiting:     'Waiting on reporter',
  resolved:    'Resolved',
  closed:      'Closed',
};

/**
 * How the person who raised it reads it. Only `waiting` differs, and it is
 * the one that matters: "Waiting on reporter" is IT's word for "waiting on
 * you", and a reporter who reads it as somebody else will not answer.
 */
export const REPORTER_STATUS_LABEL: Record<ItTicketStatus, string> = {
  ...IT_STATUS_LABEL,
  waiting: 'Waiting on you',
};

/** Still on IT's plate, or on the reporter's — anything not finished. */
export function isOpenStatus(s: ItTicketStatus): boolean {
  return s === 'new' || s === 'in_progress' || s === 'waiting';
}

// ─── Priority ───────────────────────────────────────────────────────────────

export type ItTicketPriority = 'low' | 'normal' | 'high' | 'urgent';

export const IT_TICKET_PRIORITIES: readonly ItTicketPriority[] = ['urgent', 'high', 'normal', 'low'];

export function isItTicketPriority(v: unknown): v is ItTicketPriority {
  return typeof v === 'string' && (IT_TICKET_PRIORITIES as readonly string[]).includes(v);
}

export const PRIORITY_LABEL: Record<ItTicketPriority, string> = {
  urgent: 'Urgent',
  high:   'High',
  normal: 'Normal',
  low:    'Low',
};

/**
 * What the reporter is asked instead of "priority", which everybody answers
 * with "high". How much it is in their way is a question people can answer
 * honestly, and IT can move it afterwards.
 */
export const PRIORITY_QUESTION: Record<ItTicketPriority, string> = {
  low:    'Just letting you know',
  normal: 'It is slowing me down',
  high:   'I cannot do part of my work',
  urgent: 'I cannot work at all',
};

/** For sorting: lower comes first. */
export const PRIORITY_RANK: Record<ItTicketPriority, number> = {
  urgent: 0, high: 1, normal: 2, low: 3,
};

// ─── Category ───────────────────────────────────────────────────────────────

export type ItTicketCategory = 'problem' | 'access' | 'request' | 'equipment' | 'accounts' | 'other';

export const IT_TICKET_CATEGORIES: readonly ItTicketCategory[] = [
  'problem', 'access', 'request', 'equipment', 'accounts', 'other',
];

export function isItTicketCategory(v: unknown): v is ItTicketCategory {
  return typeof v === 'string' && (IT_TICKET_CATEGORIES as readonly string[]).includes(v);
}

export const CATEGORY_LABEL: Record<ItTicketCategory, string> = {
  problem:   'Something in TTMS is not working',
  access:    'Cannot sign in, or missing access',
  request:   'A request or an idea',
  equipment: 'Computer, printer, phone or internet',
  accounts:  'Email or another account',
  other:     'Something else',
};

/** The short form, for list rows and chips. */
export const CATEGORY_SHORT: Record<ItTicketCategory, string> = {
  problem:   'TTMS problem',
  access:    'Access',
  request:   'Request',
  equipment: 'Equipment',
  accounts:  'Accounts',
  other:     'Other',
};

// ─── Limits ─────────────────────────────────────────────────────────────────

export const MAX_TICKET_TITLE   = 140;
export const MAX_TICKET_TEXT    = 8000;
export const MAX_TICKET_PAGE    = 300;
export const MAX_TICKET_DEVICE  = 400;
export const MAX_ATTACHMENTS_PER_MESSAGE = 10;
/** Matches the `it-tickets/` block in storage.rules. */
export const MAX_IT_FILE_BYTES  = 25 * 1024 * 1024;
export const MAX_IT_FILE_NAME   = 200;
/** How many tickets the desk list loads. Plenty for a company this size. */
export const IT_DESK_LIST_LIMIT = 400;

/**
 * An id the browser makes up before uploading. Becomes part of a bucket path,
 * so anything with a slash or a dot is refused rather than cleaned.
 */
export const IT_FILE_ID_RE = /^[A-Za-z0-9_-]{16,64}$/;

/**
 * Where a file lives. Worked out from the uploader's uid and the file id,
 * never taken from a request — so a message can only ever name a file its
 * own author put in their own folder.
 */
export function itTicketFilePath(uploaderUid: string, fileId: string): string {
  return `it-tickets/${uploaderUid}/${fileId}`;
}

export function ticketNumberLabel(n: number): string {
  return `IT-${String(n).padStart(4, '0')}`;
}

// ─── Shapes the browser receives (times are epoch ms) ──────────────────────

export interface ItAttachment {
  id: string;
  name: string;
  contentType: string;
  size: number;
  /** Two-hour signed link. Absent when it could not be signed. */
  url?: string;
}

export function isImageAttachment(a: Pick<ItAttachment, 'contentType'>): boolean {
  return /^image\/(png|jpe?g|gif|webp|bmp)$/i.test(a.contentType);
}

export interface ItTicketMessage {
  id: string;
  /** `message` is something somebody wrote; `event` a status change or the like. */
  kind: 'message' | 'event';
  text: string;
  authorName: string;
  /** Written by the IT account. Drawn on the other side of the thread. */
  fromIt: boolean;
  /** IT's own note. Never sent to the reporter — the server drops it. */
  internal: boolean;
  attachments: ItAttachment[];
  createdAt: number;
}

export interface ItTicket {
  id: string;
  number: number;
  title: string;
  category: ItTicketCategory;
  priority: ItTicketPriority;
  status: ItTicketStatus;
  reporterUid: string;
  reporterEmail: string;
  reporterName: string;
  /** The TTMS page they were on before opening the form, if any. */
  page: string;
  /** Browser and screen, captured on the form so nobody has to ask. */
  device: string;
  /** The last thing written is from the reporter and IT has not answered. */
  needsIt: boolean;
  /** IT has written something the reporter has not opened yet. */
  reporterUnread: boolean;
  messageCount: number;
  attachmentCount: number;
  lastMessageText: string;
  lastMessageFromIt: boolean;
  createdAt: number;
  updatedAt: number;
  resolvedAt: number;
}
