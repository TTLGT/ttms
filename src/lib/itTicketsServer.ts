import { Resend } from 'resend';
import { adminDb, adminStorage, AdminAuthError, FieldValue } from './firebase-admin';
import { systemLine } from './chatAlerts';
import { APP_URL } from './appUrl';
import type { Caller } from './partyAccess';
import { CONVERSATIONS_COLLECTION, NOTICE_ROOM_POLICY, SYSTEM_SENDER_UID } from '@/types/conversation';
import {
  IT_DESK_EMAIL,
  IT_DESK_LIST_LIMIT,
  IT_FILE_ID_RE,
  IT_STATUS_LABEL,
  IT_TICKETS_COLLECTION,
  IT_TICKET_COUNTERS,
  IT_TICKET_MESSAGES,
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_IT_FILE_BYTES,
  MAX_IT_FILE_NAME,
  PRIORITY_LABEL,
  REPORTER_STATUS_LABEL,
  isItDesk,
  isItTicketCategory,
  isItTicketPriority,
  isItTicketStatus,
  itTicketFilePath,
  ticketNumberLabel,
  type ItAttachment,
  type ItTicket,
  type ItTicketCategory,
  type ItTicketMessage,
  type ItTicketPriority,
  type ItTicketStatus,
} from '@/types/itTicket';

/**
 * Server side of IT tickets. See src/types/itTicket.ts for who sees what and
 * why the collection is closed to the browser.
 *
 * Every function that returns a ticket takes the caller and decides, here,
 * whether they are the desk or the reporter. The routes do not pass a "view"
 * flag through, so there is no request that can ask for the desk's view.
 */

const tickets = () => adminDb.collection(IT_TICKETS_COLLECTION);

function millis(v: unknown): number {
  if (v && typeof (v as { toMillis?: unknown }).toMillis === 'function') {
    return (v as { toMillis: () => number }).toMillis();
  }
  return typeof v === 'number' ? v : 0;
}

/** What a message stores per file. `uploaderUid` is what the path is worked out from. */
interface StoredAttachment {
  id: string;
  name: string;
  contentType: string;
  size: number;
  uploaderUid: string;
}

export function toTicket(id: string, d: FirebaseFirestore.DocumentData): ItTicket {
  return {
    id,
    number:            Number(d.number) || 0,
    title:             String(d.title ?? ''),
    category:          isItTicketCategory(d.category) ? d.category : 'other',
    priority:          isItTicketPriority(d.priority) ? d.priority : 'normal',
    status:            isItTicketStatus(d.status) ? d.status : 'new',
    reporterUid:       String(d.reporterUid ?? ''),
    reporterEmail:     String(d.reporterEmail ?? ''),
    reporterName:      String(d.reporterName ?? ''),
    page:              String(d.page ?? ''),
    device:            String(d.device ?? ''),
    needsIt:           d.needsIt === true,
    // Stored as the reporter's uid rather than a boolean so the nav badge is
    // one equality filter — no composite index to deploy. See badgeCount().
    reporterUnread:    typeof d.reporterUnreadUid === 'string' && d.reporterUnreadUid !== '',
    messageCount:      Number(d.messageCount) || 0,
    attachmentCount:   Number(d.attachmentCount) || 0,
    lastMessageText:   String(d.lastMessageText ?? ''),
    lastMessageFromIt: d.lastMessageFromIt === true,
    createdAt:         millis(d.createdAt),
    updatedAt:         millis(d.updatedAt),
    resolvedAt:        millis(d.resolvedAt),
  };
}

async function signAttachment(a: StoredAttachment): Promise<ItAttachment> {
  const base = { id: a.id, name: a.name, contentType: a.contentType, size: a.size };
  try {
    const safe = a.name.replace(/["\\\r\n]/g, '_');
    const [url] = await adminStorage.bucket().file(itTicketFilePath(a.uploaderUid, a.id)).getSignedUrl({
      action: 'read',
      expires: Date.now() + 2 * 60 * 60 * 1000,
      responseDisposition: `inline; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(a.name)}`,
    });
    return { ...base, url };
  } catch {
    // One file that will not sign should not hide the whole conversation.
    return base;
  }
}

async function toMessage(id: string, d: FirebaseFirestore.DocumentData): Promise<ItTicketMessage> {
  const stored = Array.isArray(d.attachments) ? d.attachments as StoredAttachment[] : [];
  return {
    id,
    kind:        d.kind === 'event' ? 'event' : 'message',
    text:        String(d.text ?? ''),
    authorName:  String(d.authorName ?? ''),
    fromIt:      d.fromIt === true,
    internal:    d.internal === true,
    attachments: await Promise.all(stored.map(signAttachment)),
    createdAt:   millis(d.createdAt),
  };
}

// ─── Reading ────────────────────────────────────────────────────────────────

/**
 * The desk gets the most recent tickets of everybody; anybody else gets their
 * own. The reporter's query is a single equality with no orderBy — sorted
 * here — so it needs no composite index; the desk's is a single-field order,
 * which Firestore indexes by itself.
 */
export async function listTickets(caller: Caller): Promise<ItTicket[]> {
  if (isItDesk(caller.email)) {
    const snap = await tickets().orderBy('updatedAt', 'desc').limit(IT_DESK_LIST_LIMIT).get();
    return snap.docs.map((doc) => toTicket(doc.id, doc.data()));
  }
  const snap = await tickets().where('reporterUid', '==', caller.uid).get();
  return snap.docs
    .map((doc) => toTicket(doc.id, doc.data()))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * One ticket the caller may open, or a 404 — the same answer for "does not
 * exist" and "not yours", so a ticket id cannot be probed.
 */
async function openTicket(caller: Caller, ticketId: string) {
  if (!/^[A-Za-z0-9]{1,64}$/.test(ticketId)) throw new AdminAuthError('Ticket not found', 404);
  const ref  = tickets().doc(ticketId);
  const snap = await ref.get();
  const data = snap.data();
  if (!snap.exists || !data) throw new AdminAuthError('Ticket not found', 404);
  const desk = isItDesk(caller.email);
  if (!desk && data.reporterUid !== caller.uid) throw new AdminAuthError('Ticket not found', 404);
  return { ref, data, desk };
}

/**
 * A ticket and its conversation. Internal notes are dropped here, before
 * anything is signed, when the caller is not the desk.
 *
 * Opening it as the reporter clears their unread mark — a write on a read,
 * but only when there was something to clear.
 */
export async function getTicketThread(caller: Caller, ticketId: string): Promise<{
  ticket: ItTicket;
  messages: ItTicketMessage[];
}> {
  const { ref, data, desk } = await openTicket(caller, ticketId);
  const snap = await ref.collection(IT_TICKET_MESSAGES).orderBy('createdAt', 'asc').get();
  const visible = snap.docs.filter((doc) => desk || doc.data().internal !== true);
  const messages = (await Promise.all(visible.map((doc) => toMessage(doc.id, doc.data()))))
    // A reply and the status change sent with it ("Send and resolve") share
    // one server timestamp; the words come before the line saying what
    // happened to the ticket.
    .sort((a, b) => a.createdAt - b.createdAt || Number(a.kind === 'event') - Number(b.kind === 'event'));

  if (!desk && data.reporterUnreadUid) {
    await ref.update({ reporterUnreadUid: null });
    data.reporterUnreadUid = null;
  }
  return { ticket: toTicket(ref.id, data), messages };
}

/**
 * The number on the nav item. For the desk, tickets waiting on IT; for
 * anybody else, their tickets with something new from IT. Both are a single
 * equality and a count aggregation, so a page load costs one read each.
 */
export async function badgeCount(caller: Caller): Promise<number> {
  const q = isItDesk(caller.email)
    ? tickets().where('needsIt', '==', true)
    : tickets().where('reporterUnreadUid', '==', caller.uid);
  const snap = await q.count().get();
  return snap.data().count;
}

// ─── Attachments ────────────────────────────────────────────────────────────

/**
 * Turns what the browser says it uploaded into attachment records, checking
 * each one actually sits in the caller's own folder. The size and type are
 * read off the object, not believed from the request. A file over the limit
 * is deleted rather than left behind.
 */
async function collectAttachments(caller: Caller, raw: unknown): Promise<StoredAttachment[]> {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  if (raw.length > MAX_ATTACHMENTS_PER_MESSAGE) {
    throw new AdminAuthError(`At most ${MAX_ATTACHMENTS_PER_MESSAGE} files at a time`, 400);
  }
  const seen = new Set<string>();
  const out: StoredAttachment[] = [];
  for (const item of raw) {
    const r = (item ?? {}) as Record<string, unknown>;
    const id = typeof r.fileId === 'string' ? r.fileId : '';
    if (!IT_FILE_ID_RE.test(id) || seen.has(id)) {
      throw new AdminAuthError('One of the files has no valid id', 400);
    }
    seen.add(id);
    const file = adminStorage.bucket().file(itTicketFilePath(caller.uid, id));
    const [exists] = await file.exists();
    if (!exists) throw new AdminAuthError('One of the files did not finish uploading. Try again.', 400);
    const [meta] = await file.getMetadata();
    const size = Number(meta.size) || 0;
    if (size > MAX_IT_FILE_BYTES) {
      await file.delete({ ignoreNotFound: true }).catch(() => {});
      throw new AdminAuthError('One of the files is larger than 25 MB', 413);
    }
    const name = (typeof r.name === 'string' ? r.name.trim() : '').slice(0, MAX_IT_FILE_NAME) || 'file';
    out.push({
      id,
      name,
      contentType: String(meta.contentType ?? 'application/octet-stream'),
      size,
      uploaderUid: caller.uid,
    });
  }
  return out;
}

function preview(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 160);
}

// ─── Writing ────────────────────────────────────────────────────────────────

export interface NewTicketInput {
  title: string;
  text: string;
  category: ItTicketCategory;
  priority: ItTicketPriority;
  page: string;
  device: string;
  attachments: unknown;
}

/**
 * Raises a ticket. The number comes from a counter in the same transaction,
 * so two people reporting at the same moment cannot get the same one.
 */
export async function createTicket(caller: Caller, input: NewTicketInput): Promise<ItTicket> {
  const attachments = await collectAttachments(caller, input.attachments);
  const ref        = tickets().doc();
  const counterRef = adminDb.collection(IT_TICKET_COUNTERS).doc('counter');
  const messageRef = ref.collection(IT_TICKET_MESSAGES).doc();
  const email      = (caller.email ?? '').toLowerCase();

  const number = await adminDb.runTransaction(async (tx) => {
    const counter = await tx.get(counterRef);
    const n = (Number(counter.data()?.next) || 1);
    tx.set(counterRef, { next: n + 1 }, { merge: true });
    tx.create(ref, {
      number:            n,
      title:             input.title,
      category:          input.category,
      priority:          input.priority,
      status:            'new',
      reporterUid:       caller.uid,
      reporterEmail:     email,
      reporterName:      caller.displayName,
      page:              input.page,
      device:            input.device,
      needsIt:           true,
      reporterUnreadUid: null,
      messageCount:      1,
      attachmentCount:   attachments.length,
      lastMessageText:   preview(input.text),
      lastMessageFromIt: false,
      createdAt:         FieldValue.serverTimestamp(),
      updatedAt:         FieldValue.serverTimestamp(),
      resolvedAt:        null,
    });
    tx.create(messageRef, {
      kind:        'message',
      text:        input.text,
      authorUid:   caller.uid,
      authorName:  caller.displayName,
      fromIt:      false,
      internal:    false,
      attachments,
      createdAt:   FieldValue.serverTimestamp(),
    });
    return n;
  });

  const saved = await ref.get();
  const ticket = toTicket(ref.id, saved.data() ?? {});
  await emailDesk(
    `New ticket ${ticketNumberLabel(number)}: ${input.title}`,
    [
      `${caller.displayName} (${email}) reported a problem.`,
      `Priority: ${PRIORITY_LABEL[input.priority]}`,
      input.page ? `Page: ${input.page}` : null,
      attachments.length ? `${attachments.length} file${attachments.length === 1 ? '' : 's'} attached` : null,
      '',
      input.text,
    ],
    ref.id,
  );
  return ticket;
}

/**
 * Adds to the conversation. Who is writing decides what it does to the
 * ticket, rather than anything in the request:
 *
 *  - The reporter writing puts it back on IT's plate (`needsIt`), and a reply
 *    to something resolved or waiting on them reopens it — that is usually
 *    "it is still broken". A closed ticket takes no more replies; it is done,
 *    and a new problem gets a new number.
 *  - IT writing to the reporter takes it off IT's plate and marks it unread
 *    for them. An internal note changes neither: the reporter has not been
 *    answered just because IT wrote something down.
 */
export async function addMessage(
  caller: Caller,
  ticketId: string,
  input: { text: string; internal: boolean; attachments: unknown; status?: ItTicketStatus },
): Promise<void> {
  const { ref, data, desk } = await openTicket(caller, ticketId);
  const current = isItTicketStatus(data.status) ? data.status : 'new';
  if (current === 'closed' && !desk) {
    throw new AdminAuthError('This ticket is closed. Report a new issue if something is still wrong.', 409);
  }
  const internal = desk && input.internal;
  const attachments = await collectAttachments(caller, input.attachments);
  if (!input.text && attachments.length === 0) throw new AdminAuthError('Write something or attach a file', 400);

  const batch = adminDb.batch();
  const patch: Record<string, unknown> = {
    messageCount:    FieldValue.increment(1),
    attachmentCount: FieldValue.increment(attachments.length),
    updatedAt:       FieldValue.serverTimestamp(),
  };

  batch.set(ref.collection(IT_TICKET_MESSAGES).doc(), {
    kind:       'message',
    text:       input.text,
    authorUid:  caller.uid,
    authorName: desk ? 'IT support' : caller.displayName,
    fromIt:     desk,
    internal,
    attachments,
    createdAt:  FieldValue.serverTimestamp(),
  });

  let next: ItTicketStatus = current;
  if (!desk) {
    patch.needsIt = true;
    if (current === 'waiting' || current === 'resolved') next = 'in_progress';
  } else if (!internal) {
    patch.needsIt = false;
    patch.reporterUnreadUid = data.reporterUid;
    // Answering something new is starting on it; IT can still pick a status
    // in the same send, which wins.
    next = input.status ?? (current === 'new' ? 'in_progress' : current);
  } else if (input.status) {
    next = input.status;
  }
  if (!internal) {
    patch.lastMessageText   = preview(input.text || `${attachments.length} file(s)`);
    patch.lastMessageFromIt = desk;
  }
  if (next !== current) applyStatus(batch, ref, patch, data, next, desk, caller);

  batch.update(ref, patch);
  await batch.commit();

  const label = ticketNumberLabel(Number(data.number) || 0);
  if (!desk) {
    await emailDesk(
      `${data.reporterName || 'The reporter'} replied on ${label}: ${data.title}`,
      [input.text || '(sent files only)', attachments.length ? `${attachments.length} file(s) attached` : null],
      ticketId,
    );
  } else if (!internal) {
    await noticeReporter(String(data.reporterUid), `IT replied on ${label} "${data.title}". Open IT support to read it.`);
  }
}

/**
 * Status, priority and category. The desk only; a reporter may close their
 * own ticket and nothing else ("it is sorted, thanks").
 */
export async function updateTicket(
  caller: Caller,
  ticketId: string,
  body: Record<string, unknown>,
): Promise<ItTicket> {
  const { ref, data, desk } = await openTicket(caller, ticketId);
  const current = isItTicketStatus(data.status) ? data.status : 'new';
  const batch = adminDb.batch();
  const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };

  if (!desk) {
    if (body.status !== 'closed' || Object.keys(body).some((k) => k !== 'status')) {
      throw new AdminAuthError('Only IT can change this ticket', 403);
    }
    if (current !== 'closed') applyStatus(batch, ref, patch, data, 'closed', false, caller);
  } else {
    if (body.status !== undefined) {
      if (!isItTicketStatus(body.status)) throw new AdminAuthError('Unknown status', 400);
      if (body.status !== current) applyStatus(batch, ref, patch, data, body.status, true, caller);
    }
    if (body.priority !== undefined) {
      if (!isItTicketPriority(body.priority)) throw new AdminAuthError('Unknown priority', 400);
      if (body.priority !== data.priority) {
        patch.priority = body.priority;
        deskEvent(batch, ref, `Priority changed to ${PRIORITY_LABEL[body.priority]}`, true);
      }
    }
    if (body.category !== undefined) {
      if (!isItTicketCategory(body.category)) throw new AdminAuthError('Unknown category', 400);
      patch.category = body.category;
    }
  }

  batch.update(ref, patch);
  await batch.commit();

  if (desk && patch.status && patch.status !== current) {
    const label = ticketNumberLabel(Number(data.number) || 0);
    const s = patch.status as ItTicketStatus;
    await noticeReporter(
      String(data.reporterUid),
      `IT marked ${label} "${data.title}" as ${REPORTER_STATUS_LABEL[s].toLowerCase()}.`,
    );
  }
  const saved = await ref.get();
  return toTicket(ref.id, saved.data() ?? {});
}

/**
 * One status change: the field, its side effects, and a line in the
 * conversation so both sides can see when it happened. Public, because the
 * reporter's own ticket moving is news to them.
 */
function applyStatus(
  batch: FirebaseFirestore.WriteBatch,
  ref: FirebaseFirestore.DocumentReference,
  patch: Record<string, unknown>,
  data: FirebaseFirestore.DocumentData,
  next: ItTicketStatus,
  desk: boolean,
  caller: Caller,
): void {
  patch.status = next;
  if (next === 'resolved' || next === 'closed') {
    patch.resolvedAt = FieldValue.serverTimestamp();
    // Nothing left for IT to answer on a finished ticket.
    if (desk) patch.needsIt = false;
  } else {
    patch.resolvedAt = null;
  }
  if (desk && next === 'waiting') {
    patch.needsIt = false;
  }
  if (desk && next !== data.status) patch.reporterUnreadUid = data.reporterUid;
  if (!desk && next === 'closed') patch.needsIt = false;

  const text = desk
    ? `IT changed the status to ${IT_STATUS_LABEL[next]}`
    : next === 'closed'
      ? `${caller.displayName} closed the ticket`
      : `Reopened when ${caller.displayName} replied`;
  deskEvent(batch, ref, text, false);
}

function deskEvent(
  batch: FirebaseFirestore.WriteBatch,
  ref: FirebaseFirestore.DocumentReference,
  text: string,
  internal: boolean,
): void {
  batch.set(ref.collection(IT_TICKET_MESSAGES).doc(), {
    kind: 'event', text, authorUid: '', authorName: '', fromIt: true, internal, attachments: [],
    createdAt: FieldValue.serverTimestamp(),
  });
}

// ─── Telling people ─────────────────────────────────────────────────────────

/**
 * Email to the IT account. Best effort: a ticket must never fail to save
 * because the mail did not go — the nav badge still shows it.
 */
async function emailDesk(subject: string, lines: (string | null)[], ticketId: string): Promise<void> {
  try {
    if (!process.env.RESEND_API_KEY) return;
    const resend = new Resend(process.env.RESEND_API_KEY);
    const link = `${APP_URL}/dashboard/it-support?ticket=${ticketId}`;
    // null is a line that did not apply; '' is a deliberate blank line.
    const body = lines.filter((l): l is string => l !== null).join('\n');
    const html = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#1f2937;font-size:14px;line-height:1.5">
<p style="white-space:pre-wrap;margin:0 0 16px">${escapeHtml(body)}</p>
<p style="margin:0"><a href="${link}">Open the ticket in TTMS</a></p>
</body></html>`;
    await resend.emails.send({
      from: `TTMS <${process.env.RESEND_FROM_EMAIL ?? 'noreply@totaltransportlogistics.us'}>`,
      to: IT_DESK_EMAIL,
      subject: subject.slice(0, 250),
      text: `${body}\n\nOpen the ticket: ${link}`,
      html,
    });
  } catch (e) {
    console.error('[it-tickets] desk email failed', e);
  }
}

/**
 * A line in the reporter's own "IT support" notice room — the same kind of
 * locked, one-member room as "Your reminders" (postTaskNotice), and a separate
 * one, because IT's answers and your 10:00 call are different conversations.
 * Best effort, like the email.
 */
async function noticeReporter(uid: string, text: string): Promise<void> {
  if (!uid) return;
  try {
    const room = adminDb.collection(CONVERSATIONS_COLLECTION).doc(`notice_it_${uid}`);
    await room.create({
      kind:        'notice',
      name:        'IT support',
      memberUids:  [uid],
      createdBy:   SYSTEM_SENDER_UID,
      adminUids:   [],
      policy:      NOTICE_ROOM_POLICY,
      createdAt:   FieldValue.serverTimestamp(),
      updatedAt:   FieldValue.serverTimestamp(),
      lastMessage: null,
    }).catch((e: { code?: number }) => {
      if (e?.code !== 6) throw e; // ALREADY_EXISTS is the ordinary case.
    });
    const batch = adminDb.batch();
    batch.update(room, systemLine(batch, room, text, { systemKind: 'announcement', senderName: 'IT support' }));
    await batch.commit();
  } catch (e) {
    console.error('[it-tickets] reporter notice failed', e);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
