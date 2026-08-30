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
/**
 * Thread replies, in a collection of their own beside the messages rather than
 * mixed in with them.
 *
 * Three things pushed it here rather than onto the messages themselves as a
 * `rootId` field:
 *
 *  - A room already full of messages has no such field on any of them, and a
 *    Firestore equality query skips documents that are missing the field
 *    entirely. Filtering the room by `rootId == null` would have hidden every
 *    message written before threads existed, on a live database, with no way
 *    to test it first.
 *  - A thread that runs to forty replies would otherwise eat the room's
 *    loading window, so opening the room would show forty replies and three
 *    messages.
 *  - The unread count is a Firestore aggregation over the messages collection.
 *    Replies landing in it would be counted as if they were said in the room.
 *
 * It is a subcollection of the *conversation*, not of the message, so that one
 * query can reach every reply in a room. That is what will let a search find
 * something said inside a thread; a subcollection hanging off each message
 * could only ever be searched one thread at a time.
 */
export const REPLIES_COLLECTION       = 'replies';
/** One document per user holding what they have read. See ChatReads. */
export const CHAT_READS_COLLECTION    = 'chatReads';
/**
 * Every thread one person is in, at `chatThreads/{uid}/threads/{rootMessageId}`.
 *
 * A written-down answer to a question no query can ask. "Threads I am in" spans
 * every room, and the only place membership of a thread is recorded is on the
 * messages themselves — so finding it would mean a collection-group query over
 * every message in the company, which the rules cannot gate (a collection-group
 * rule has no way to work out which conversation a document belongs to), or one
 * listener per room, which is the cost ChatContext exists to avoid.
 *
 * So the list is maintained as it happens: whoever writes a reply writes a row
 * into the list of each person that reply is for. It is the same trick this
 * codebase already uses for `lastMessage`, `mentionedAt` and `clientOwnerUids`
 * — when the query cannot be expressed, write the answer down.
 *
 * **A document per thread rather than a map on one document per user**, which
 * matters twice. A map would grow without bound towards Firestore's 1 MiB
 * limit and need pruning. And it would mean a colleague replying to you had to
 * be allowed to write your whole list — where this way the rules let them write
 * exactly one row of it, so the worst a member can do is put one wrong line in
 * somebody's list rather than empty it.
 */
export const CHAT_THREADS_COLLECTION  = 'chatThreads';

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
  /**
   * The last reaction somebody left on each person's own messages here, as
   * `{ [messageOwnerUid]: ReactionPing }`.
   *
   * It sits on the conversation for one reason: a reaction is written onto the
   * message document, and nobody has a listener on the messages of a
   * conversation they are not looking at. Without a copy up here, the only
   * person who could ever be told about a thumbs-up is the one already staring
   * at it. The conversation list is watched all day, so a mark here reaches
   * whoever it is for.
   *
   * One slot per person, overwritten each time: this drives a notification the
   * moment it lands, not a list to be read back later.
   */
  reactionPings?: Record<string, ReactionPing>;
  /**
   * The last thread reply aimed at each person here, as `{ [uid]: ThreadPing }`.
   *
   * Here for the same reason as `reactionPings`: a reply is written into the
   * replies collection, and nobody holds a listener on the replies of a thread
   * they do not have open. Without a mark up here the only person who could
   * learn of an answer is the one already reading it.
   *
   * It is written for the people the reply is *for* — see threadFollowers —
   * and not for the room. That is the whole bargain of a thread: four people
   * arguing about one load do not interrupt the twenty who are not in it.
   */
  threadPings?: Record<string, ThreadPing>;
}

/** Who reacted, with what, to which of your messages — enough for a notification. */
export interface ReactionPing {
  at: Timestamp;
  byUid: string;
  byName: string;
  /** The palette key, not the glyph — see REACTIONS and reactionGlyph. */
  key: string;
  messageId: string;
  /**
   * Set when the message reacted to was a thread reply, naming the thread it
   * sits in. Following the notification has to open that thread — the reply is
   * not in the room, so jumping to it in the room would find nothing.
   */
  rootId?: string | null;
  /** The opening of the message reacted to, so the notification says which one. */
  text: string;
}

/**
 * A reply in a thread, aimed at one person — enough for a notification and for
 * the mark in the conversation list.
 *
 * `rootId` rather than the reply's own id, because what somebody wants when
 * they click this is the thread, opened, not one line of it.
 */
export interface ThreadPing {
  at: Timestamp;
  byUid: string;
  byName: string;
  /** The message the thread hangs under — what to open. */
  rootId: string;
  /** The opening of the reply itself. */
  text: string;
  /** The opening of the message being replied under, so it says which thread. */
  rootText: string;
  /**
   * Whether this reply named the reader with an @, rather than merely landing
   * in a thread they are in.
   *
   * It rides on the ping instead of on the conversation's `mentionedAt`, which
   * is cleared by reading the *room*. An @ written inside a thread has to
   * survive somebody glancing at the room without opening the thread, so it is
   * measured against the thread's own read mark like everything else here.
   */
  mention: boolean;
}

/**
 * One row of somebody's thread list — a thread they are in, and enough to draw
 * it without reading the message it hangs under or the room it is in.
 *
 * Everything here is copied at write time for the usual reason: the list has to
 * render in one read. It goes stale in the ways a copy does — renaming a room
 * does not rewrite the rows that name it, and correcting the message a thread
 * hangs under does not rewrite `rootText`. Nothing is decided from any of it.
 * It is a line of text and a timestamp, and opening the thread shows the truth.
 */
export interface ThreadEntry {
  /** The message the thread hangs under. Also this document's id. */
  rootId: string;
  /**
   * Which room to open before opening the thread.
   *
   * The room's *name* is deliberately not copied here. A direct thread is
   * titled from whoever else is in it, so its name is different for each of
   * the two people and there is no one value to store. The list resolves it
   * from the conversations it is already watching — which also means a thread
   * in a room somebody has since been removed from simply stops appearing,
   * rather than lingering as a row naming a room they can no longer open.
   */
  conversationId: string;
  /** The opening of the message being replied under — the row's title. */
  rootText: string;
  /** Whose message the thread hangs under, so a row can read "your message". */
  rootSenderUid: string;
  /** When the newest reply landed. What the list is ordered by. */
  lastReplyAt: Timestamp;
  lastReplyByUid: string;
  lastReplyByName: string;
  /** The opening of that reply, for the preview line. */
  lastReplyText: string;
  /** Whether that reply named the reader with an @. Drives the amber mark. */
  mention: boolean;
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
  /** Photos and files sent with it. A message may be nothing but these. */
  attachments?: Attachment[];
  /** Who reacted with what, as `{ [reactionKey]: uid[] }`. */
  reactions?: Record<string, string[]>;

  /* ------------------------------------------------------------- threads */

  /**
   * Replies only: the message in the room this one hangs under.
   *
   * Its presence is what tells a reply from a message — they are the same
   * shape otherwise, deliberately, so a reply can be edited, deleted, quoted,
   * reacted to and read exactly like anything else said in the room.
   */
  rootId?: string;
  /**
   * Root messages only. How many replies are under this one, kept as a running
   * count rather than worked out by asking.
   *
   * The room draws a "3 replies" line under a message from this, and a room
   * showing two hundred messages would otherwise mean two hundred count
   * queries on open — for a number that is nearly always zero.
   */
  replyCount?: number;
  /** When the newest reply landed. What "unread thread" is decided against. */
  lastReplyAt?: Timestamp | null;
  /**
   * Everyone who has replied here.
   *
   * Kept so the *next* reply knows who to tell without reading the thread
   * first — see threadFollowers. It is also what draws the faces beside the
   * reply count, which is how somebody decides whether a thread is theirs.
   */
  replyUids?: string[];
}

/**
 * A photo or file sent in a conversation.
 *
 * The **storage path** is kept, never the download URL, which is the same rule
 * the rest of this app follows for uploads: a download URL carries a token that
 * can be regenerated, so a stored one eventually stops working. The path is
 * resolved to a URL at render time and cached — see lib/useStorageUrl.ts.
 */
export interface Attachment {
  path: string;
  name: string;
  contentType: string;
  size: number;
  /** Drawn inline rather than as a row with a paperclip. */
  isImage: boolean;
}

/** Biggest file we accept. Enforced in the browser — see the note in chatUploads. */
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

/**
 * The reactions people can leave, as a fixed set.
 *
 * A fixed palette rather than a full emoji picker, for two reasons. The whole
 * point of a reaction is that it is faster than typing "ok" — a picker with
 * three thousand faces in it is not faster than typing "ok". And the keys are
 * plain ASCII, which keeps them usable as Firestore field paths; an emoji as a
 * field name needs quoting every time it is written.
 *
 * These are the six a freight desk actually needs. Resist adding a seventh
 * without one being taken away.
 */
export const REACTIONS: { key: string; glyph: string; label: string }[] = [
  { key: 'up',       glyph: '👍', label: 'Got it' },
  { key: 'done',     glyph: '✅', label: 'Done' },
  { key: 'question', glyph: '❓', label: 'Question' },
  { key: 'eyes',     glyph: '👀', label: 'Looking' },
  { key: 'thanks',   glyph: '🙏', label: 'Thanks' },
  { key: 'heart',    glyph: '❤️', label: 'Love it' },
];

export function reactionGlyph(key: string): string {
  return REACTIONS.find((r) => r.key === key)?.glyph ?? key;
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
  /**
   * The same, per thread, as `{ [rootMessageId]: millis }`.
   *
   * A thread needs a mark of its own rather than riding on the room's. Opening
   * a room marks the room read, and if that also cleared the threads in it,
   * every answer written under a message you had scrolled past would be lost
   * the moment you glanced at the room — which is precisely the thing a thread
   * exists to keep hold of.
   *
   * Only threads somebody has actually opened appear here. An absent key reads
   * as "never opened", which is the right default: the first reply to your
   * message should be unread.
   */
  threadReadAt?: Record<string, number>;
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

/* ---------------------------------------------------------------- threads */

/**
 * How many replies a thread loads. Threads are short by nature — a thread that
 * has run past this is a conversation that wanted a room.
 */
export const THREAD_PAGE_SIZE = 200;

/**
 * Who a new reply should reach.
 *
 * A thread is quiet on purpose: it does not bump the room, does not mark the
 * room unread, and does not appear in anybody's list unless it is *for* them.
 * So "for them" has to be defined, and this is it — the three ways somebody is
 * demonstrably in a conversation they cannot see from the room:
 *
 *  - they wrote the message being replied under;
 *  - they have already replied in it;
 *  - they were named with an @ in the reply itself.
 *
 * The person writing the reply is never in the result. Telling somebody about
 * their own reply is the fastest way to teach them to ignore the mark.
 *
 * Anybody else in the room learns about the thread the ordinary way: the reply
 * count under the message, which everyone can see.
 */
export function threadFollowers(
  root: Pick<ChatMessage, 'senderUid' | 'replyUids'>,
  replyMentions: string[],
  replierUid: string,
): string[] {
  const all = new Set<string>([root.senderUid, ...(root.replyUids ?? []), ...replyMentions]);
  all.delete(replierUid);
  return [...all];
}

/**
 * Has this thread been answered since the reader last opened it?
 *
 * Two halves, and the second one matters more than it looks. A thread is only
 * unread for somebody it is *for* — the same test threadFollowers applies when
 * a reply is written. Without it, every thread in a room would show a mark to
 * everyone who had never opened it, which on the company room means every
 * thread anybody has ever started marking itself unread for forty people who
 * are not in it. That is the noise threads exist to remove.
 *
 * `pingedRootId` is how somebody first pulled into a thread by an @ counts as
 * being in it: they have not replied and did not write the message, so the
 * mark left for them on the conversation is the only evidence there is.
 *
 * Measured against `threadReadAt` rather than the room's read mark, so an
 * answer survives the reader glancing at the room. A reply of your own marks
 * the thread read as it is sent (see sendThreadReply), which is what keeps
 * your own answer from coming back at you as something unread.
 */
export function isThreadUnread(
  root: Pick<ChatMessage, 'id' | 'replyCount' | 'lastReplyAt' | 'senderUid' | 'replyUids'>,
  myUid: string,
  threadReadAt: Record<string, number>,
  pingedRootId?: string | null,
): boolean {
  if (!root.replyCount) return false;

  const follows = root.senderUid === myUid
    || (root.replyUids ?? []).includes(myUid)
    || pingedRootId === root.id;
  if (!follows) return false;

  const at   = root.lastReplyAt as { toMillis?: () => number } | null | undefined;
  const last = typeof at?.toMillis === 'function' ? at.toMillis() : 0;
  return last > (threadReadAt[root.id] ?? 0);
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

