import { adminDb, FieldValue } from './firebase-admin';
import {
  CONVERSATIONS_COLLECTION,
  MESSAGES_COLLECTION,
  SYSTEM_SENDER_NAME,
  SYSTEM_SENDER_UID,
  recordConversationId,
  type SystemMessageKind,
} from '@/types/conversation';
import { STATUS_LABEL, type OrderStatus } from '@/types/order';

/**
 * TTMS speaking in the room about a load.
 *
 * The thing chat can do here that Slack cannot without an integration: the
 * events the system already knows about — a carrier signing, a BOL landing,
 * a load moving to delivered — announced where the people working it are
 * already looking, instead of waiting to be noticed on a dashboard.
 *
 * **Server-side only, and deliberately.** A system message is written with the
 * Admin SDK, which is what lets it carry a sender that is not a person: the
 * security rules pin `senderUid` to the caller precisely so nobody can put
 * words in somebody else's mouth, and TTMS's mouth is no exception. Nothing
 * here is reachable from a browser except through a route that decides for
 * itself what happened — see /api/orders/[orderId]/announce, which re-reads the
 * order and describes what it actually finds rather than repeating a claim.
 *
 * **Nothing is posted into a room that does not exist yet.** A room is created
 * by somebody pressing Discuss, and until then an alert would be written into a
 * conversation with no members — unreadable by anyone, one document per order
 * that has ever changed status, for a conversation nobody started. So alerts
 * follow the discussion rather than the other way round: rooms people are using
 * stay current, and a load nobody has talked about writes nothing at all.
 */

/**
 * Posts one line into the room about an order, if that room exists.
 *
 * Best-effort by contract: every caller is in the middle of doing something
 * that matters more than this — signing a rate confirmation, generating a BOL
 * — and an alert that could not be written must never take that down with it.
 * Callers pass this to `.catch(() => {})` and mean it.
 */
export async function postOrderAlert(orderId: string, text: string): Promise<void> {
  const conversationId = recordConversationId('order', orderId);
  const room = adminDb.collection(CONVERSATIONS_COLLECTION).doc(conversationId);

  const snap = await room.get();
  if (!snap.exists) return;

  const batch = adminDb.batch();
  batch.update(room, systemLine(batch, room, text));
  await batch.commit();
}

/**
 * Queues one line from TTMS into a room, and hands back the bump that belongs
 * with it for the caller to write onto the room.
 *
 * Takes a batch rather than writing on its own because a caller may have
 * something that has to land with the line or not at all — a membership change
 * has the membership itself and its history entries, and a line announcing a
 * change that then failed to save would be worse than no line.
 *
 * **The bump is returned rather than written**, which is the one awkward part
 * of this signature and is not a style choice: one commit may not write the
 * same document twice, and every caller that posts a line about a room is
 * already updating that room. So the fields are merged into the update the
 * caller was making anyway.
 *
 * Bumping at all is not optional. An alert that landed without moving its room
 * up the list — and without marking it unread — is an alert nobody is told
 * about. Whether it interrupts anybody is then the reader's own setting, like
 * any other message in the room.
 */
export function systemLine(
  batch: FirebaseFirestore.WriteBatch,
  room: FirebaseFirestore.DocumentReference,
  text: string,
  /**
   * How it should read, for the one caller that is not a load alert.
   *
   * `senderName` is what the room shows it as. It is a label and nothing more
   * — `senderUid` stays SYSTEM_SENDER_UID whatever is passed, so a different
   * name cannot become a different identity. The daily celebrations post signs
   * itself with the company's name rather than "TTMS", because a birthday
   * greeting from an initialism is a birthday greeting from the software.
   */
  options: { senderName?: string; systemKind?: SystemMessageKind } = {},
): Record<string, unknown> {
  const senderName = options.senderName?.trim() || SYSTEM_SENDER_NAME;

  batch.set(room.collection(MESSAGES_COLLECTION).doc(), {
    text,
    // Not a uid, and never one: no account can hold it, so nothing signed in
    // can write a message that claims to be this. See SYSTEM_SENDER_UID.
    senderUid:  SYSTEM_SENDER_UID,
    senderName,
    // The flag the thread renders on. Without it an alert would be drawn as a
    // bubble from a colleague nobody can find in the directory.
    system:     true,
    systemKind: options.systemKind ?? 'alert',
    createdAt:  FieldValue.serverTimestamp(),
    deletedAt:  null,
    editedAt:   null,
    mentions:   [],
    attachments: [],
    reactions:  {},
  });

  return {
    lastMessage: {
      text,
      senderUid:  SYSTEM_SENDER_UID,
      senderName,
      at:         FieldValue.serverTimestamp(),
    },
    updatedAt: FieldValue.serverTimestamp(),
  };
}

/* ---------------------------------------------------------------- wording */

/**
 * What each event says, in one line.
 *
 * Written as plain statements of fact with no exclamation and no invitation to
 * act. These sit among messages from colleagues, and the moment an automated
 * line starts sounding like a person is the moment people start reading past
 * every one of them.
 *
 * The name of whoever caused it is deliberately absent from most of them: an
 * alert says what happened to the load, and who pressed the button is on the
 * order's own history. The exception is the two signings, where the name is
 * the point — it is what the carrier typed, and it is part of a legal record.
 */

export function statusAlert(status: OrderStatus): string {
  return `Status moved to ${STATUS_LABEL[status] ?? status}.`;
}

export function carrierAlert(carrierName: string): string {
  return carrierName
    ? `Carrier assigned: ${carrierName}.`
    : 'Carrier removed from this load.';
}

export function documentAlert(document: 'BOL' | 'Invoice' | 'POD', present: boolean): string {
  return present ? `${document} added.` : `${document} removed.`;
}

export function agreementSentAlert(to: 'carrier' | 'client', email: string): string {
  const who = to === 'carrier' ? 'Rate confirmation' : 'Load confirmation';
  return `${who} sent for signature to ${email}.`;
}

/**
 * A load dispatched before the client signed.
 *
 * Said in the room rather than left on the order screen because it is the one
 * thing here that is a decision instead of an event: somebody chose to book a
 * carrier against an unsigned load, and the people who share the load should
 * see who, and why, without going looking for it.
 */
export function signatureWaivedAlert(byName: string, reason: string): string {
  const because = reason.trim() ? ` — ${reason.trim()}` : '';
  return `${byName} dispatched this load without the client's signature${because}.`;
}

/**
 * The line a record room opens with.
 *
 * A room that starts empty has nothing in it to say which load it is about,
 * and the first person in is usually there because something already happened.
 * So it opens with where the load stands right now — after which the alerts
 * that follow read as changes to something rather than as facts out of
 * nowhere.
 */
export function openedAlert(order: {
  status?: string;
  carrierName?: string;
  clientName?: string;
}): string {
  const parts = [
    `Status: ${STATUS_LABEL[order.status as OrderStatus] ?? order.status ?? 'unknown'}`,
    order.clientName  ? `Client: ${order.clientName}` : '',
    order.carrierName ? `Carrier: ${order.carrierName}` : 'No carrier yet',
  ].filter(Boolean);
  return `Discussion opened. ${parts.join(' · ')}.`;
}

export function signedAlert(by: 'carrier' | 'client', signerName: string): string {
  const who = by === 'carrier' ? 'Carrier' : 'Client';
  return `${who} signed — ${signerName}.`;
}
