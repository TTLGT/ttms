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
  /**
   * When each person was last named with an @ here, as `{ [uid]: Timestamp }`.
   *
   * It lives on the conversation rather than being read off the last message
   * because a mention has to survive being talked over: someone asks you a
   * question and four more lines follow it, and the @ mark must still be there
   * when you look. Only ever bumped, never cleared — "have I read past it" is
   * decided by comparing it against your own read mark, the same way ordinary
   * unread is.
   */
  mentionedAt?: Record<string, Timestamp>;
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
  /**
   * Set when the sender corrects the text, and shown as "(edited)".
   *
   * Editing was deliberately not possible at first, on the grounds that a
   * message somebody has acted on should not be able to become something else.
   * The mark is the better answer to that: the correction is allowed, and the
   * fact that it happened is on the screen next to it, where the people who
   * read the first version can see it.
   */
  editedAt?: Timestamp | null;
  /** Uids named with an @ in this message. Drives the stronger unread mark. */
  mentions?: string[];
  /** The message this one is answering, quoted above it. */
  replyTo?: MessageQuote | null;
}

/**
 * A message quoted at the top of a reply.
 *
 * The quoted text is **copied**, not looked up by id, for three reasons that
 * all point the same way:
 *
 *  - A reply carried privately out of a room quotes a message the reader may
 *    have no permission to fetch. A live lookup would either fail or have to be
 *    allowed to reach into rooms the reader is not in.
 *  - Drawing twenty replies would otherwise mean twenty extra reads.
 *  - It preserves what was actually being answered, which is the point of a
 *    quote and survives the original being taken back.
 *
 * The cost is that editing a quoted message does not rewrite quotes of it. A
 * thread showing a reply to something the room can still scroll up and read is
 * handled without this copy — see the live-first lookup in MessageThread.
 */
export interface MessageQuote {
  messageId: string;
  text: string;
  senderUid: string;
  senderName: string;
  /**
   * Set only when the quote was carried out of a different conversation — a
   * private reply to something said in a room. Null for an ordinary reply,
   * where the original is a few lines further up the same thread.
   */
  fromConversationId?: string | null;
  /**
   * What that conversation is called.
   *
   * Safe to carry across because a private reply can only ever be addressed to
   * the person who wrote the quoted message, and they were in that room by
   * definition — they posted in it. No room name reaches anybody who was not
   * already in it.
   */
  fromConversationName?: string | null;
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

/* --------------------------------------------------------------- mentions */

/** Somebody who can be named with an @ — a member of the conversation. */
export interface MentionCandidate {
  uid: string;
  displayName: string;
}

/**
 * Mentions are stored two ways on purpose: the text keeps the name the sender
 * typed, and `mentions` keeps the uids it resolved to.
 *
 * Storing only a marker like `<@uid>` would make the raw message unreadable
 * anywhere it is not rendered — in the preview line, in a notification, in the
 * database when someone is working out what went wrong. Storing only the name
 * would mean re-guessing who was meant every time it is drawn, and getting it
 * wrong the day somebody is renamed. So the text stays plain and the uids ride
 * alongside it.
 */

/** Escapes a name so it can be matched literally inside a regular expression. */
function escapeForRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The uids named with an @ in this text.
 *
 * Longest name first, so that typing `@Erwin Solorzano` in a company that also
 * has an Erwin Danko resolves to the person actually named rather than to
 * whichever of them the list happened to reach first.
 */
export function findMentions(text: string, candidates: MentionCandidate[]): string[] {
  const byLength = [...candidates]
    .filter((c) => c.displayName.trim().length > 0)
    .sort((a, b) => b.displayName.length - a.displayName.length);

  const found: string[] = [];
  let remaining = text;

  for (const candidate of byLength) {
    const pattern = new RegExp(`@${escapeForRegex(candidate.displayName)}\\b`, 'i');
    if (pattern.test(remaining)) {
      found.push(candidate.uid);
      // Blanked out rather than left in place, so a shorter name that is a
      // prefix of a longer one does not also match the text already claimed.
      remaining = remaining.replace(new RegExp(pattern, 'gi'), ' ');
    }
  }
  return found;
}

/** One run of message text, flagged if it is a mention so it can be styled. */
export interface TextRun {
  text: string;
  /** The uid this run names, or null for ordinary text. */
  mentionUid: string | null;
}

/**
 * Splits message text into plain runs and mention runs, for rendering.
 *
 * Only the names actually recorded in `mentions` are highlighted. Someone
 * writing "email it to @carrier" has not named a colleague, and colouring it
 * as though they had would teach people to distrust the highlight.
 */
export function splitOnMentions(text: string, named: MentionCandidate[]): TextRun[] {
  if (named.length === 0) return [{ text, mentionUid: null }];

  const byLength = [...named].sort((a, b) => b.displayName.length - a.displayName.length);
  const pattern = new RegExp(
    `@(?:${byLength.map((c) => escapeForRegex(c.displayName)).join('|')})\\b`,
    'gi',
  );

  const runs: TextRun[] = [];
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const at = match.index ?? 0;
    if (at > cursor) runs.push({ text: text.slice(cursor, at), mentionUid: null });
    const name = match[0].slice(1).toLowerCase();
    const who  = byLength.find((c) => c.displayName.toLowerCase() === name);
    runs.push({ text: match[0], mentionUid: who?.uid ?? null });
    cursor = at + match[0].length;
  }
  if (cursor < text.length) runs.push({ text: text.slice(cursor), mentionUid: null });
  return runs;
}
