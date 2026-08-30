import type { Timestamp } from 'firebase/firestore';

/**
 * In-house chat between staff. Everyone on the allowlist can talk to everyone
 * else, so unlike parties and orders there is no ownership here — a
 * conversation is visible to the people in it and to nobody else, and that is
 * the whole rule.
 *
 * Three shapes, one document type:
 *
 *  - `company` — the single room everyone is in. There is exactly one, at the
 *    fixed id COMPANY_CONVERSATION_ID, and its membership is implicit: it has
 *    no `memberUids` because listing every employee in an array would have to
 *    be rewritten on every hire and would silently cap out at Firestore's
 *    1 MiB document limit. Rules let any allowed user read a `company` room.
 *  - `direct` — two people. The id is derived from the pair (see
 *    directConversationId) rather than random, because two colleagues opening
 *    each other at the same moment would otherwise create two separate threads
 *    and each would see half the conversation.
 *  - `group` — a named room with a chosen membership.
 */
export type ConversationKind = 'company' | 'direct' | 'group';

/** The one room everyone is in. A fixed id so it can be read without a query. */
export const COMPANY_CONVERSATION_ID = 'company';

export const CONVERSATIONS_COLLECTION = 'conversations';
export const MESSAGES_COLLECTION      = 'messages';
/** One document per user holding what they have read. See ChatReads. */
export const CHAT_READS_COLLECTION    = 'chatReads';

/** Longest message we accept. Enforced in the UI and again in the rules. */
export const MAX_MESSAGE_LENGTH = 4000;

export interface Conversation {
  id: string;
  kind: ConversationKind;
  /** Group rooms only. Direct threads are titled from the other person. */
  name: string;
  /**
   * Everyone in the room, for `direct` and `group`. Empty on the company room,
   * which everyone is in by definition — see the note above.
   */
  memberUids: string[];
  createdBy: string;
  createdAt: Timestamp;
  /**
   * Bumped by every message, and what the conversation list is ordered by, so
   * whoever spoke last floats to the top.
   */
  updatedAt: Timestamp;
  /**
   * The last message, copied onto the conversation so the list can show a
   * preview and work out what is unread. Without it, drawing a list of twelve
   * conversations would mean twelve extra queries on every page load.
   *
   * Denormalized data goes stale by nature; this copy is allowed to, because
   * nothing is decided from it. It is a preview line and a timestamp.
   */
  lastMessage: LastMessage | null;
}

export interface LastMessage {
  text: string;
  senderUid: string;
  senderName: string;
  at: Timestamp;
}

export interface ChatMessage {
  id: string;
  text: string;
  senderUid: string;
  /**
   * The sender's name as it stood when they sent it. Copied rather than looked
   * up so a thread renders in one read, and so an old message keeps the name
   * that was on it — a message from 2023 was not sent by whoever holds that
   * account now.
   */
  senderName: string;
  createdAt: Timestamp;
  /**
   * Set when the sender takes a message back. The document stays, holding no
   * text, so the thread does not silently reshuffle around a hole and the
   * people who already read it are not left arguing with a ghost.
   */
  deletedAt?: Timestamp | null;
}

/**
 * What one person has read, as `{ [conversationId]: millis }`.
 *
 * One document per user rather than a marker per conversation: the unread
 * badge needs every conversation's state at once, and a live listener on a
 * single document costs a fraction of one per room. It is the only chat
 * document a user writes about themselves, and the rules key it on their uid.
 */
export interface ChatReads {
  uid: string;
  lastReadAt: Record<string, number>;
}

/**
 * The id of the thread between two people, from their uids.
 *
 * Sorted before joining so both sides derive the same id no matter who opens
 * it first. That is what makes a direct thread safe to create on demand: two
 * people can race and land on the same document instead of two half-threads.
 */
export function directConversationId(uidA: string, uidB: string): string {
  return `dm_${[uidA, uidB].sort().join('_')}`;
}

/** The other person in a direct thread, or null if it is not one. */
export function otherMemberUid(c: Conversation, myUid: string): string | null {
  if (c.kind !== 'direct') return null;
  return c.memberUids.find((uid) => uid !== myUid) ?? null;
}

/**
 * What to call a conversation on screen.
 *
 * A direct thread has no name of its own — it is titled from whoever else is
 * in it, which `nameOf` resolves. A room the caller is alone in reads as
 * "Just you" rather than as a blank.
 */
export function conversationTitle(
  c: Conversation,
  myUid: string,
  nameOf: (uid: string) => string,
): string {
  if (c.kind === 'company') return 'Everyone';
  if (c.kind === 'group')   return c.name || 'Untitled room';
  const other = otherMemberUid(c, myUid);
  return other ? nameOf(other) : 'Just you';
}

/** Can this user see this conversation? Keep in sync with firestore.rules. */
export function isConversationMember(c: Conversation, uid: string): boolean {
  return c.kind === 'company' || c.memberUids.includes(uid);
}
