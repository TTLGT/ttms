import { adminDb, FieldValue } from './firebase-admin';
import {
  CONVERSATIONS_COLLECTION,
  MESSAGES_COLLECTION,
  SYSTEM_SENDER_NAME,
  SYSTEM_SENDER_UID,
  recordConversationId,
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

  const batch   = adminDb.batch();
  const message = room.collection(MESSAGES_COLLECTION).doc();

  batch.set(message, {
    text,
    // Not a uid, and never one: no account can hold it, so nothing signed in
    // can write a message that claims to be this. See SYSTEM_SENDER_UID.
    senderUid:  SYSTEM_SENDER_UID,
    senderName: SYSTEM_SENDER_NAME,
    // The flag the thread renders on. Without it an alert would be drawn as a
    // bubble from a colleague nobody can find in the directory.
    system:     true,
    createdAt:  FieldValue.serverTimestamp(),
    deletedAt:  null,
    editedAt:   null,
    mentions:   [],
    attachments: [],
    reactions:  {},
  });

  // The same conversation bump an ordinary message carries, and for the same
  // reason: an alert that landed without moving its room up the list — and
  // without marking it unread — is an alert nobody is told about. Whether it
  // interrupts anybody is then the reader's own setting, like any other
  // message in the room.
  batch.update(room, {
    lastMessage: {
      text,
      senderUid:  SYSTEM_SENDER_UID,
      senderName: SYSTEM_SENDER_NAME,
      at:         FieldValue.serverTimestamp(),
    },
    updatedAt: FieldValue.serverTimestamp(),
  });

  await batch.commit();
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

export function agreementSentAlert(to: 'carrier' | 'shipper', email: string): string {
  const who = to === 'carrier' ? 'Rate confirmation' : 'Shipper agreement';
  return `${who} sent for signature to ${email}.`;
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

export function signedAlert(by: 'carrier' | 'shipper', signerName: string): string {
  const who = by === 'carrier' ? 'Carrier' : 'Shipper';
  return `${who} signed — ${signerName}.`;
}
