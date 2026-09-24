import type { Timestamp } from 'firebase/firestore';
import type { StickerRef } from './sticker';
import type { GifRef } from './gif';

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
 *  - `record` — the room about one order. Like a group in every way the rules
 *    care about, and different in the one way that matters: nobody is invited
 *    to it. Its id is derived from the record (see recordConversationId), and
 *    anyone who can already see that order joins by opening it — which is a
 *    check only the server can make, so /api/chat/conversations is the only
 *    way in. That is the whole point of chat living inside TTMS: every
 *    conversation about a load is reachable from the load, a year later.
 *  - `notice` — TTMS talking to one person, and nobody else in it. Today that
 *    is the birthday and anniversary reminders an admin or HR person sets up
 *    for themselves (see src/lib/celebrationReminders.ts). Its id is derived from
 *    the person (see noticeConversationId), it is created by the server the
 *    first time there is something to say, and **nobody can write in it** —
 *    not even its one member.
 *
 *    That last part needs no rule of its own, which is why this could ship
 *    without a rules deploy: the room is born with every `policy` key set to
 *    `admins`, and only a `group` (or the company room) has admins at all —
 *    see isRoomBoss() in firestore.rules. So `maySay()` refuses every message
 *    and every pin, and the PATCH route refuses to touch the policy of
 *    anything that is not a group. What the room holds is HR's planning
 *    data, so a member who could invite a colleague in would be a leak.
 */
export type ConversationKind = 'company' | 'direct' | 'group' | 'record' | 'notice';

/**
 * What a record room is about. Only orders for now.
 *
 * Kept as a field rather than baked into the id format because carriers and
 * clients are the obvious next two, and a room whose type has to be inferred
 * by parsing its id is a room nothing can query for.
 */
export type RecordKind = 'order';

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

/**
 * Who a message from TTMS itself is from.
 *
 * Not a uid and never one: Firebase uids are 28 characters of base64, so no
 * account can ever hold this value. That is what makes it safe as a sender —
 * the rules pin `senderUid` to the caller on every client write, so a browser
 * cannot produce a message claiming to be this even if it tried. Only the
 * Admin SDK can, which means only the server can. See src/lib/chatAlerts.ts.
 */
export const SYSTEM_SENDER_UID  = 'system';
export const SYSTEM_SENDER_NAME = 'TTMS';

/**
 * Two things the server says, which are not the same kind of thing.
 *
 * - `alert` is the load telling you about itself — "Carrier signed", "BOL
 *   added". Drawn as a thin line across the room, because it is furniture.
 * - `announcement` is the company addressing the room, which today means the
 *   daily birthday and work-anniversary post. It is signed with the company's
 *   name, drawn at a size somebody is meant to read, and never truncated.
 *
 * Absent means `alert`, so every line written before this existed keeps the
 * shape it already had and nothing needed backfilling.
 *
 * The distinction is on the message rather than worked out from its sender
 * name, because the name is editable and the shape must not be: a room whose
 * layout changed because somebody retitled something is a room nobody can
 * predict.
 */
export type SystemMessageKind = 'alert' | 'announcement';

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
  /**
   * The messages pinned to the top of this room, as `{ [messageId]: pin }`.
   *
   * **A map rather than an array**, which is what makes it safe to write from
   * the browser. An array has to be sent whole, so two people pinning at the
   * same moment would lose one of the pins — and a rule allowing the write
   * would be allowing anybody in the room to replace every pin in it. A map
   * keyed by message id is written one dotted path at a time: pinning touches
   * `pinned.<id>` and nothing else, and unpinning deletes that one field.
   *
   * The message is copied into the pin for the usual reason — the pin bar has
   * to draw in one read, and a pinned message is very often older than the
   * loaded window, so there is nothing on screen to read it off. It goes stale
   * the way every copy in this file does: editing a pinned message does not
   * rewrite the pin. Clicking it still jumps to the message itself when it is
   * loaded, which is where the truth is.
   */
  pinned?: Record<string, PinnedMessage>;

  /* --------------------------------------------- who runs it, and what it
                                                    lets everybody else do */

  /**
   * Group rooms only: who runs the room.
   *
   * **Read it through roomAdminUids(), never directly.** The raw field is
   * absent on every room that existed before admins did, and can be left
   * naming somebody who is no longer in the room — that function is where both
   * of those are answered.
   *
   * Written only through /api/chat/conversations, like the membership itself
   * and for a sharper version of the same reason: this decides who may change
   * the membership, so a browser that could write it could make itself an
   * admin, let itself into the room and lock everybody else out of it.
   */
  adminUids?: string[];
  /**
   * What the admins have decided everybody else may do here. Absent — or an
   * absent key — means `everyone`. See RoomPolicy.
   */
  policy?: Partial<RoomPolicy>;
  /**
   * People an admin has stopped from writing here, as `{ [uid]: millis }`,
   * holding the moment the mute lifts.
   *
   * **A deadline, not a list of names**, and that is the whole design. A mute
   * with no clock on it is somebody quietly silenced until an admin who has
   * since left the company remembers to undo it — and nothing in this project
   * runs on a schedule that could sweep them up. So the expiry is applied
   * where the mute is read, by isMuted() and by `firestore.rules`, both of
   * which compare it against the time of the request. That is exactly how an
   * order access grant expires and for exactly the same reason; see
   * isGrantLive() in src/types/orderAccessRequest.ts.
   *
   * A timestamp in the past is a mute that has lapsed. It is left in place
   * rather than tidied away: it is the record that the mute happened, and it
   * costs one number.
   */
  mutedUntil?: Record<string, number>;

  /**
   * Group rooms only: a picture standing in for the `#` the room is drawn
   * with otherwise. A storage path, never a download URL — a URL carries a
   * token that can be regenerated, so a stored one goes stale. It is resolved
   * at render time by useStorageUrl, whose per-session cache is only correct
   * because every upload writes a fresh random path instead of overwriting the
   * one before it.
   *
   * Written through PATCH /api/chat/conversations/{id}, the same way the name
   * and the membership are, and deliberately not from the browser: allowing a
   * free-text path here would let any member point their room at any file in
   * the bucket — a driver's licence, say — and have every other member's list
   * render it. The route checks the prefix; see roomPhotoBelongsTo() in
   * src/lib/chatServer.ts.
   */
  photoPath?: string | null;

  /* --------------------------------------------------------- record rooms */

  /** Record rooms only: what kind of record this room is about. */
  recordType?: RecordKind;
  /** Record rooms only: the document id of that record. */
  recordId?: string;
  /**
   * Record rooms only: what that record is called — an order's display number.
   *
   * Copied at creation so the room can be titled without reading the order,
   * which most people in the room could not do anyway at the moment the list
   * is drawn. An order number never changes once issued, so unlike the other
   * copies in this file this one does not go stale.
   */
  recordLabel?: string;
}

/**
 * One pinned message: enough to draw the pin bar without reading the message.
 *
 * `at` is plain millis from the writer's clock, not a server timestamp.
 * Firestore refuses a server timestamp anywhere inside a map written as a
 * value, and the field only orders one short list — the same trade the read
 * marks make, for the same reason.
 */
export interface PinnedMessage {
  messageId: string;
  /** The message as it read when it was pinned, trimmed. '' for a file-only one. */
  text: string;
  senderUid: string;
  senderName: string;
  pinnedByUid: string;
  pinnedByName: string;
  at: number;
  /**
   * Set when what was pinned is a thread reply, naming the thread it sits in.
   * Following the pin has to open that thread — the reply is not in the room,
   * so jumping to it there would find nothing.
   */
  rootId?: string | null;
}

/**
 * How many messages one room can hold pinned.
 *
 * A pin bar is a place for the standing facts — the on-call number, this
 * week's priority load — and a list of thirty is not that. Enforced in the UI
 * and again in the rules, so nobody can park a room's worth of text up there.
 *
 * **Keep in sync with the `pinned` branch of the conversation update rule in
 * firestore.rules**, which cannot import this and carries the number written
 * out. Raising it here alone leaves the rules refusing the eleventh pin.
 */
export const MAX_PINNED = 10;

/** Who reacted, with what, to which of your messages — enough for a notification. */
export interface ReactionPing {
  at: Timestamp;
  byUid: string;
  byName: string;
  /** The reaction key, not the glyph — see reactionKeyFor and reactionGlyph. */
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
   * Set only when the person who took it back was **not** the person who wrote
   * it — a room admin removing somebody else's message.
   *
   * Recorded, and shown on the tombstone, because the two are not the same
   * event and must not look the same. A message that simply says "Message
   * deleted" invites its author to assume they did it, or that the software
   * ate it; the commonest reason an admin removes one is that it had a client
   * rate in the wrong room, which is exactly the situation where the author
   * needs to know it happened.
   *
   * The name is copied like `senderName` for the usual reason: a line about
   * somebody who has since left the company still has to read as a name.
   */
  deletedByUid?: string | null;
  deletedByName?: string | null;
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
  /**
   * Written by TTMS rather than by a person — "Carrier signed", "BOL added".
   *
   * Drawn as a line across the room rather than as a bubble, and inert: no
   * reactions, no thread, no menu. An automated line that could be replied to
   * under, reacted to and pinned would be pretending to be a colleague, and
   * the thing that makes these readable at all is that they are visibly not
   * one. Anything worth saying about an alert is said in the room under it.
   *
   * Only the server can write one — see SYSTEM_SENDER_UID.
   */
  system?: boolean;
  /**
   * Which kind of server message this is — see SystemMessageKind. Meaningless
   * unless `system` is true, and absent means `alert`.
   */
  systemKind?: SystemMessageKind;
  /** Uids named with an @ in this message. Drives the stronger unread mark. */
  mentions?: string[];
  /** The message this one is answering, quoted above it. */
  replyTo?: MessageQuote | null;
  /** Photos and files sent with it. A message may be nothing but these. */
  attachments?: Attachment[];
  /**
   * A sticker, when that is what this message is. Always on its own — the
   * composer sends it straight away, with no text and no files beside it.
   *
   * A copy rather than an id to look up: the sticker can be taken off the
   * company shelf later, and the message must go on showing what was sent.
   * See src/types/sticker.ts. Absent on everything else.
   */
  sticker?: StickerRef | null;
  /**
   * A GIF from Klipy, when that is what this message is. On its own, like a
   * sticker. It holds Klipy's address rather than a copy — see
   * src/types/gif.ts for why.
   */
  gif?: GifRef | null;
  /** Who reacted with what, as `{ [reactionKey]: uid[] }`. */
  reactions?: Record<string, string[]>;
  /**
   * The words this message can be found by — see chatSearchTerms. Derived on
   * save from the text, the sender's name and any file names; never edited by
   * hand and never shown.
   *
   * Absent on every message sent before search existed, and an `array-contains`
   * query skips a document missing the field entirely rather than failing — so
   * until scripts/backfill-chat-search-terms.js has run, the old history is
   * invisible to search and nothing says so.
   */
  searchTerms?: string[];
  /**
   * What this message is carrying, as a short list — see contentKindsFor.
   *
   * Exists for one reason: the Files panel asks "every photo in this room,
   * newest first", and Firestore cannot ask whether an array is non-empty or
   * whether a string holds a link. So the question is answered on save and
   * filed as words an `array-contains` can reach — the same trick as
   * `searchTerms` one field up.
   *
   * It is a **coarse filter, not the answer**: what the panel shows is read off
   * the document the query pulled back, so a message whose link was edited out
   * still matches and simply contributes no rows.
   *
   * Absent on everything said before this shipped, and an `array-contains`
   * skips a document missing the field rather than failing — so until
   * scripts/backfill-chat-content-kinds.js has run, the panel shows only what
   * has been sent since and nothing says so.
   */
  contentKinds?: SharedKind[];

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

/**
 * The one line that stands for a message where the message itself is not on
 * screen — the conversation list, a notification, a pin, a quote.
 *
 * A message may be nothing but a photo or a sticker, and an empty string there
 * reads as a deleted message, which it is not.
 */
export function messageSummary(
  m: Pick<ChatMessage, 'text' | 'attachments' | 'sticker' | 'gif'>,
): string {
  if (m.text) return m.text;
  if (m.sticker) return 'Sticker';
  if (m.gif) return 'GIF';
  return m.attachments?.[0]?.name ?? '';
}

/**
 * A picture sent as a message on its own — a sticker or a GIF, never both,
 * and never beside text or files. See sendMessage.
 */
export interface MessageMedia {
  sticker?: StickerRef | null;
  gif?: GifRef | null;
}

/** Biggest file we accept. Enforced in the browser — see the note in chatUploads. */
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

/**
 * Biggest room picture we accept.
 *
 * Far below the attachment cap on purpose: this one is drawn at 32 pixels in a
 * list that redraws all day, so a 25 MB photo would be downloaded in full by
 * everyone in the room to fill a circle the size of a thumbnail.
 */
export const MAX_ROOM_PHOTO_BYTES = 5 * 1024 * 1024;

/**
 * The quick reactions: the row that opens first, one click from the message.
 *
 * Any emoji can be a reaction now (see reactionKeyFor), but this row is still
 * what the picker leads with, and it is still short on purpose. The point of a
 * reaction is that it is faster than typing "ok"; the full picker is one click
 * further away for the rare "🔥", and these six are the ones a freight desk
 * reaches for all day. Resist adding a seventh without one being taken away.
 *
 * The keys are plain ASCII, which keeps them usable as Firestore field paths —
 * an emoji as a field name needs quoting every time it is written. They also
 * stay exactly as they were, because they are already stored on live messages.
 */
export const REACTIONS: { key: string; glyph: string; label: string }[] = [
  { key: 'up',       glyph: '👍', label: 'Got it' },
  { key: 'done',     glyph: '✅', label: 'Done' },
  { key: 'question', glyph: '❓', label: 'Question' },
  { key: 'eyes',     glyph: '👀', label: 'Looking' },
  { key: 'thanks',   glyph: '🙏', label: 'Thanks' },
  { key: 'heart',    glyph: '❤️', label: 'Love it' },
];

/**
 * Emoji presentation selector. Picker data carries it on emoji that also exist
 * as plain text symbols ("❤️" vs "❤"), and the palette above does not always —
 * so it is ignored when asking whether two emoji are the same one.
 */
const VS16 = /️/g;

/** `u` plus the code points in hex, joined by `_`: `u1f525`, `u1f44d_1f3fd`. */
const CODEPOINT_KEY = /^u[0-9a-f]{2,6}(_[0-9a-f]{2,6})*$/;

/**
 * The reaction key for any emoji.
 *
 * One of the six quick reactions keeps its old word key, so a 👍 chosen from
 * the full picker lands on the same count as a 👍 from the quick row rather
 * than starting a second one beside it. Anything else is spelled out as its
 * code points, which is ASCII, a legal unquoted field name, and turns straight
 * back into the emoji with no table to look it up in. The code points are kept
 * exactly as the picker gave them, selector included: some sequences (🏳️‍🌈)
 * do not draw without it.
 */
export function reactionKeyFor(glyph: string): string {
  const bare = glyph.replace(VS16, '');
  const quick = REACTIONS.find((r) => r.glyph.replace(VS16, '') === bare);
  if (quick) return quick.key;
  return 'u' + Array.from(glyph, (c) => c.codePointAt(0)!.toString(16)).join('_');
}

export function reactionGlyph(key: string): string {
  const quick = REACTIONS.find((r) => r.key === key);
  if (quick) return quick.glyph;
  if (CODEPOINT_KEY.test(key)) {
    try {
      return String.fromCodePoint(...key.slice(1).split('_').map((h) => parseInt(h, 16)));
    } catch {
      // Out of range. Rules check only that reactions are a map, so a key
      // nobody's picker produced can exist; show it as written.
    }
  }
  return key;
}

/* ----------------------------------------------------------------- search */

/**
 * Shortest word worth filing. One letter matches half the room, and "a", "to"
 * and "in" match all of it.
 */
const MIN_CHAT_TERM = 2;
/**
 * Most distinct words we file for one message.
 *
 * A guard on two limits at once. Firestore allows 40,000 index entries per
 * document and every element of an indexed array is one, and a message can be
 * 4,000 characters — somebody pasting a rate sheet into a room must not be
 * able to write a document that is refused, because the refusal would land on
 * them as "your message could not be sent".
 *
 * Six hundred distinct words is longer than anything anybody types by hand,
 * and a paste that runs past it is still findable by its first six hundred.
 */
const MAX_CHAT_TERMS = 600;

/**
 * The words one message can be found by.
 *
 * Firestore cannot search inside a string — there is no `LIKE '%invoice%'` —
 * so the words are worked out when the message is saved and stored beside it,
 * and searching becomes `array-contains`, a single indexed lookup however many
 * messages the company has said.
 *
 * **Whole words, not fragments**, which is the one place this deliberately
 * differs from orderSearchTerms. An order files every fragment of every word,
 * so "orris" finds Morris; doing that to a 4,000-character message would
 * produce hundreds of thousands of index entries and blow the per-document
 * limit. So chat search finds "invoice" and not "invoic", and the search box
 * says so rather than leaving people to work it out.
 *
 * The **sender's name is filed with the words**, which is what makes
 * "vivian invoice" narrow to what Vivian said about invoices rather than
 * needing a separate author filter. It is the name as it stood when the
 * message was sent, like senderName itself — a message from last year is
 * found under the name that was on it.
 *
 * Attachment file names are filed too. "Did somebody send the signed rate con"
 * is a question about a file, and the file name is the only text there is.
 */
export function chatSearchTerms(message: {
  text?: string | null;
  senderName?: string | null;
  attachments?: { name: string }[] | null;
}): string[] {
  const words = (value: string | null | undefined): string[] =>
    (value ?? '')
      .toLowerCase()
      // Punctuation out, but digits kept joined to letters: an order number is
      // one word here, and "ttl22001218" is exactly what somebody pastes.
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .split(/\s+/)
      .filter((w) => w.length >= MIN_CHAT_TERM);

  const terms = new Set<string>();
  for (const word of words(message.text))       terms.add(word);
  for (const word of words(message.senderName)) terms.add(word);
  for (const file of message.attachments ?? []) {
    for (const word of words(file.name)) terms.add(word);
  }
  return [...terms].slice(0, MAX_CHAT_TERMS);
}

/**
 * The words a search box full of typing is asking for.
 *
 * The same reduction as the stored side, so a query and the thing it is
 * matched against are shaped identically. Deduped, because typing a word twice
 * is not a narrower search.
 */
export function chatSearchWords(query: string): string[] {
  return [...new Set(
    (query ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .split(/\s+/)
      .filter((w) => w.length >= MIN_CHAT_TERM),
  )];
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
  /**
   * How loud each room is for this person, as `{ [conversationId]: level }`.
   *
   * Deliberately on this document rather than on the conversation. It is a
   * preference about the reader, not a fact about the room — two people in the
   * same room want different things from it, and the busiest room in the
   * company is the one nobody may leave. Keeping it here also means it needs
   * no rules change at all: this document is already the one thing a user
   * writes about themselves.
   *
   * An absent key is 'all', so nothing has to be written until somebody turns
   * a room down.
   */
  notify?: Record<string, ConversationNotify>;
  /**
   * Conversations this person keeps at the top of their list.
   *
   * Per person, for the same reason as `notify`: which rooms matter is a fact
   * about who is reading, not about the room. Order within the list is the
   * order the reader put them in — pinning appends, and dragging a row or
   * moving it with the menu rewrites the array. See `movePinned` below.
   */
  pinnedConversations?: string[];
  /** The same, for rows in the threads list. Keyed by the thread's root id. */
  pinnedThreads?: string[];
  /**
   * Conversations this person has marked a favourite.
   *
   * Its own field rather than one of the lists below, because Favorites is not
   * a list anybody made. It is always there, cannot be renamed and cannot be
   * deleted, so a name and a creation date to carry around would be two facts
   * nothing ever reads. Written with arrayUnion for the same reason as the
   * pinned lists: this document is open in every tab the person has TTMS in.
   */
  favorites?: string[];
  /**
   * The filter groups this person made for themselves, as `{ [listId]: list }`.
   *
   * A map rather than an array, for the same reason as `pinned` on the
   * conversation: adding one chat to one list has to touch that list alone. An
   * array is sent whole, so dropping a chat into one list from the popup would
   * put back whatever the other tab had just changed about every other list.
   * Keyed, the write is `lists.<id>.conversationIds` and nothing else moves.
   */
  lists?: Record<string, ChatList>;
}

/**
 * One filter group: a name, and the conversations somebody put in it.
 *
 * The membership is ids and nothing else. Unlike a pinned message, none of the
 * room is copied in here — a list is only ever drawn from conversations that
 * are already loaded and live, so a copy of a name would be a second version
 * of it to go stale.
 *
 * An id in here can outlive the conversation it names: rooms are left and
 * record rooms are cleared out, and nothing hunts through every list to tidy
 * up after them. That is deliberate. A dead id draws nothing — the list is
 * applied by filtering conversations that are in the list, not by looking each
 * id up — and chasing them would mean writing this document from the code path
 * that leaves a room, for no visible difference.
 *
 * `createdAt` is what orders the chips, so the row does not reshuffle itself
 * every time somebody adds a chat to a list. Millis rather than a Timestamp
 * because this sits inside a map, where a serverTimestamp cannot be written —
 * the same limit `lastReadAt` runs into.
 */
export interface ChatList {
  name: string;
  createdAt: number;
  conversationIds: string[];
}

/**
 * How many lists one person may keep, and how long a name may be.
 *
 * Both are kindnesses rather than boundaries — this document is the person's
 * own and the rules do not count anything in it — so there is nothing here to
 * keep in sync with firestore.rules. The cap on the name is what keeps a chip
 * a chip: the row scrolls sideways in a 288px column, and one list called
 * after a whole sentence pushes every other list off the end of it.
 */
export const MAX_CHAT_LISTS = 20;
export const CHAT_LIST_NAME_MAX = 24;

/**
 * Which slice of the list is being shown: a built-in id, or `list:<listId>`.
 *
 * One namespace for both, so the chip row, the selected filter and the empty
 * state are one value and not a pair of "which built-in" and "which list" that
 * can both be set at once.
 */
export type ChatFilterId = string;

/**
 * The built-in chips, in the order they sit in the row.
 *
 * `always` is whether the chip is drawn when it would match nothing. All,
 * Favorites and Unread are: the first two are where the feature is explained
 * to somebody who has never used it, and an Unread chip that comes and goes as
 * messages arrive is a row that moves under the cursor. Rooms and Loads are
 * not, because a broker who has never been added to a named room has no use
 * for a chip that is permanently empty.
 */
export const BUILT_IN_CHAT_FILTERS: { id: ChatFilterId; label: string; always: boolean }[] = [
  { id: 'all',       label: 'All',       always: true  },
  { id: 'favorites', label: 'Favorites', always: true  },
  { id: 'unread',    label: 'Unread',    always: true  },
  { id: 'rooms',     label: 'Rooms',     always: false },
  { id: 'loads',     label: 'Loads',     always: false },
];

/** The filter id for one of this person's own lists. */
export function chatListFilterId(listId: string): string {
  return `list:${listId}`;
}

/** The list id a filter names, or null when it is a built-in one. */
export function chatListIdOf(filter: ChatFilterId): string | null {
  return filter.startsWith('list:') ? filter.slice(5) : null;
}

/**
 * This person's lists as rows, oldest first — the order of the chips.
 *
 * Sorted on `createdAt` with the id as the tie-break, because two lists made
 * in the same millisecond would otherwise swap places between renders, and a
 * chip that moves while you are reaching for it is worse than either order.
 */
export function chatListsInOrder(
  lists: Record<string, ChatList>,
): { id: string; list: ChatList }[] {
  return Object.entries(lists)
    .map(([id, list]) => ({ id, list }))
    .sort((a, b) => (a.list.createdAt - b.list.createdAt) || a.id.localeCompare(b.id));
}

/**
 * Whether one conversation belongs in the slice being shown.
 *
 * Every filter here is answered from what the browser already holds — the
 * conversations are loaded, the favourites and lists ride on `chatReads`, and
 * the unread ids are already worked out for the badges. None of it is a query,
 * which is the whole reason this feature costs nothing to run: a filter must
 * never become a reason to read a conversation that was not going to be read.
 *
 * An unknown filter falls through to everything rather than to nothing: it can
 * only be reached by a list that has since been deleted in another tab, and
 * showing the full list is a better answer to that than an empty column.
 */
export function inChatFilter(
  c: Conversation,
  filter: ChatFilterId,
  ctx: { favorites: string[]; lists: Record<string, ChatList>; unreadIds: string[] },
): boolean {
  switch (filter) {
    case 'all':       return true;
    case 'favorites': return ctx.favorites.includes(c.id);
    case 'unread':    return ctx.unreadIds.includes(c.id);
    // The company room counts as a room. It is the one nobody chose to be in,
    // but somebody filtering to Rooms is asking for "not a private message",
    // and leaving the busiest one of those out would read as a bug.
    case 'rooms':     return c.kind === 'group' || c.kind === 'company';
    case 'loads':     return c.kind === 'record';
    default: {
      const listId = chatListIdOf(filter);
      return listId ? (ctx.lists[listId]?.conversationIds.includes(c.id) ?? false) : true;
    }
  }
}

/**
 * Moves one id to a new place in a pinned list, and hands back the whole list.
 *
 * Pure, and shared by both pinned lists and by both ways of reordering them —
 * the drag and the menu's Move up / Move down — so a row dropped onto the
 * second place and a row moved up once land in exactly the same order. Doing
 * this maths twice is how the drag and the arrows drift apart.
 *
 * An id that is not in the list, or a move that would run off either end, is
 * returned unchanged rather than clamped: the caller is asking to move
 * something that has since been unpinned in another tab, and quietly putting
 * it somewhere is worse than doing nothing.
 */
export function movePinnedTo(list: string[], id: string, index: number): string[] {
  const from = list.indexOf(id);
  if (from === -1 || index < 0 || index >= list.length || index === from) return list;
  const next = [...list];
  next.splice(from, 1);
  next.splice(index, 0, id);
  return next;
}

/** Moves an id one place up (-1) or down (1). Off either end is a no-op. */
export function movePinnedBy(list: string[], id: string, delta: number): string[] {
  return movePinnedTo(list, id, list.indexOf(id) + delta);
}

/**
 * Moves an id to where another one currently sits — what a drop means.
 *
 * Taken against the list as it stands, before the dragged row is lifted out,
 * which is the order the person can see while they are dragging.
 */
export function movePinnedOnto(list: string[], id: string, ontoId: string): string[] {
  return movePinnedTo(list, id, list.indexOf(ontoId));
}

/**
 * How much a room is allowed to interrupt this reader.
 *
 *  - `all` — the default. Unread marks, desktop notification, sound.
 *  - `mentions` — only what is addressed to them personally: an @, a reply in
 *    a thread they are in, a reaction on something they said. Ordinary traffic
 *    still arrives and is still readable; it simply stops badging and popping.
 *  - `none` — nothing at all, including mentions. Genuinely silent.
 *
 * The middle one is the important one and it is why this is not a switch. A
 * busy room that can only be all-or-nothing gets muted completely on its first
 * loud day, and then the one message that was actually for you is lost too.
 */
export type ConversationNotify = 'all' | 'mentions' | 'none';

export const NOTIFY_LABEL: Record<ConversationNotify, string> = {
  all:      'All messages',
  mentions: 'Only when I am named',
  none:     'Nothing — muted',
};

/** What a room is set to for this reader. Absent means the default. */
export function notifyLevel(
  notify: Record<string, ConversationNotify> | undefined,
  conversationId: string,
): ConversationNotify {
  return notify?.[conversationId] ?? 'all';
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

/**
 * The id of the room about one record, from the record itself.
 *
 * Derived rather than random for exactly the reason a direct thread's id is:
 * two brokers pressing Discuss on the same load in the same minute must land
 * in the same room. A random id would give them one each, and the second one
 * would be a room about load 41207 that nobody else would ever find.
 */
export function recordConversationId(kind: RecordKind, recordId: string): string {
  return `rec_${kind}_${recordId}`;
}

/**
 * The one person's notice room, from the person.
 *
 * Derived for the same reason a direct thread's id is: two reminder runs that
 * race each other must land in the same room rather than make one each.
 */
export function noticeConversationId(uid: string): string {
  return `notice_${uid}`;
}

/**
 * Everything a notice room forbids, written onto it at birth.
 *
 * Every key, not only `post`, because a notice room is not a room anybody
 * runs: there is nobody to pin for, nobody to rename it and nobody to invite.
 */
export const NOTICE_ROOM_POLICY: RoomPolicy = {
  post: 'admins', membership: 'admins', details: 'admins',
  files: 'admins', links: 'admins', pins: 'admins',
};

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
  // Titled from the record it is about, never renamed by hand: two people
  // looking for the conversation about a load have to arrive at the same name,
  // and the load already has one.
  if (c.kind === 'record')  return c.recordLabel || c.name || 'Record';
  if (c.kind === 'notice')  return c.name || 'Reminders';
  const other = otherMemberUid(c, myUid);
  return other ? nameOf(other) : 'Just you';
}

/** Can this user see this conversation? Keep in sync with firestore.rules. */
export function isConversationMember(c: Conversation, uid: string): boolean {
  return c.kind === 'company' || c.memberUids.includes(uid);
}

/* ------------------------------------------------ who runs a room, and what
                                                     the rest of it may do */

/**
 * Who a room allows to do one particular thing.
 *
 * Two values rather than a boolean, because the pair has to read as a sentence
 * in the settings panel — "Who can send messages: everyone / admins only" —
 * and because a third is plausible for at least one of these later. A boolean
 * called `postLocked` would have to be renamed on the day that happens, and by
 * then it is sitting on live rooms, which makes it a migration.
 */
export type RoomAudience = 'everyone' | 'admins';

/**
 * What a room's admins have decided everybody else may do.
 *
 * **Every key is optional, and absent means `everyone`.** That default is what
 * makes this safe to put on a live database with no migration and no deploy
 * order to get right: a room written before any of this existed carries no
 * `policy` at all and goes on behaving exactly as it did. Nothing has to be
 * backfilled, and a room that is never locked down never grows the field.
 *
 * **Where each one is actually enforced is not the same, and the split is not
 * arbitrary.** `post`, `files`, `links` and `pins` are enforced in
 * `firestore.rules`, because messages are written to Firestore straight from
 * the browser — see the note at the top of src/lib/chat.ts — so a check that
 * lived only in the composer would be a suggestion rather than a rule.
 * `membership` and `details` are enforced in
 * /api/chat/conversations/{id}, because those two already go through it and
 * the rules refuse them to the client outright.
 *
 * **Keep the keys and the `everyone` default in sync with firestore.rules**,
 * which cannot import this and carries both written out.
 */
export interface RoomPolicy {
  /** Who may send messages here, in the room and in its threads. */
  post: RoomAudience;
  /** Who may add people to the room and take them out of it. */
  membership: RoomAudience;
  /** Who may rename the room or change its picture. */
  details: RoomAudience;
  /** Who may attach a photo or a file. */
  files: RoomAudience;
  /** Who may post a link. */
  links: RoomAudience;
  /** Who may pin a message to the top of the room. */
  pins: RoomAudience;
}

/**
 * The policy switches as they are drawn in Room settings, in the order they
 * are drawn.
 *
 * Beside the type rather than in the dialog, for the same reason
 * PERMISSION_GROUPS sits beside the permission catalog: a switch that decides
 * what colleagues may do cannot be added without somebody having to write down
 * what it does. `restricted` is the whole of what the admin is turning on, in
 * the words the room will read it in.
 */
export const ROOM_POLICY_SETTINGS: {
  key: keyof RoomPolicy;
  label: string;
  /** What "admins only" means here, said as the consequence. */
  restricted: string;
}[] = [
  { key: 'post',       label: 'Send messages',        restricted: 'Only admins can write here. Everybody else can read.' },
  { key: 'membership', label: 'Add and remove people', restricted: 'Only admins can change who is in the room.' },
  { key: 'details',    label: 'Rename and set the picture', restricted: 'Only admins can change the name or the picture.' },
  { key: 'files',      label: 'Attach photos and files', restricted: 'Only admins can attach anything. Text still goes through.' },
  { key: 'links',      label: 'Post links',           restricted: 'Only admins can post a link.' },
  { key: 'pins',       label: 'Pin messages',         restricted: 'Only admins can pin a message to the top of the room.' },
];

/**
 * Who runs this room.
 *
 * Three cases, and the order they are answered in matters:
 *
 *  - A room made since this shipped names its admins outright.
 *  - A room made before it has no `adminUids` at all, so whoever created it is
 *    treated as its admin. That is what saves this from needing a backfill
 *    against the live database, and it names the person the room would have
 *    named anyway.
 *  - A room whose admins have all gone would otherwise be frozen in whatever
 *    state it was last locked into, with nobody able to unlock it and nobody
 *    to appeal to. So an empty result means everybody in the room is an admin
 *    until somebody sorts it out.
 *
 * That third case is meant to be unreachable — /api/chat/conversations refuses
 * to let the last admin leave without naming a successor — but an account
 * deleted in Settings → People never passes through that route, so it stays.
 *
 * The filter is what makes the empty case mean "nobody left who runs it"
 * rather than "the admins are elsewhere": the routes keep `adminUids` inside
 * `memberUids`, and this catches the one case they cannot, a legacy room whose
 * creator has since left it.
 *
 * **Keep in sync with roomAdmins() in firestore.rules**, which cannot filter a
 * list and asks `hasAny` instead — the same question, phrased the only way a
 * rule can phrase it.
 */
export function roomAdminUids(
  c: Pick<Conversation, 'kind' | 'createdBy' | 'adminUids' | 'memberUids'>,
): string[] {
  // Only a named room has admins. The company room is run by whoever holds
  // `chat.announce` (see isRoomAdmin), a direct thread is two equals, and a
  // record room is joined by whoever can open the load.
  if (c.kind !== 'group') return [];
  const stored = c.adminUids ?? (c.createdBy ? [c.createdBy] : []);
  return stored.filter((uid) => c.memberUids.includes(uid));
}

/**
 * Does this person run this room?
 *
 * `announcer` is whether they hold `chat.announce` — admin and HR by default.
 * It is passed in rather than read here because this module is imported by the
 * browser, the API routes and nothing that can reach a user profile; the
 * caller already has the answer.
 *
 * The company room is the one place that permission decides it outright.
 * There is no membership array to name admins in, and "who may address the
 * whole company" is a question the access list already answers.
 *
 * **Keep in sync with isRoomBoss() in firestore.rules.**
 */
export function isRoomAdmin(
  c: Pick<Conversation, 'kind' | 'createdBy' | 'adminUids' | 'memberUids'>,
  uid: string,
  opts: { announcer?: boolean } = {},
): boolean {
  if (c.kind === 'company') return opts.announcer === true;
  if (c.kind !== 'group')   return false;
  const admins = roomAdminUids(c);
  return admins.length === 0 ? c.memberUids.includes(uid) : admins.includes(uid);
}

/**
 * Does this room let this person do this?
 *
 * The one place the default lives on this side: an absent policy, or an absent
 * key in one, is `everyone`. Ask this rather than reading `c.policy` — a
 * screen that reads the field directly is a screen that breaks the day a room
 * that predates all of this is opened in it.
 */
export function roomAllows(
  c: Pick<Conversation, 'kind' | 'createdBy' | 'adminUids' | 'memberUids' | 'policy'>,
  key: keyof RoomPolicy,
  uid: string,
  opts: { announcer?: boolean } = {},
): boolean {
  return (c.policy?.[key] ?? 'everyone') === 'everyone' || isRoomAdmin(c, uid, opts);
}

/** When this person's mute lifts, as millis. 0 when they have never been muted. */
export function mutedUntilFor(
  c: Pick<Conversation, 'mutedUntil'>,
  uid: string,
): number {
  return c.mutedUntil?.[uid] ?? 0;
}

/**
 * Is this person muted here *right now*?
 *
 * The expiry is applied on the way out, not by anything that sweeps. See the
 * note on `mutedUntil` — there is no scheduler in this project, and a mute
 * that outlived its own deadline because nothing ran is the failure this
 * shape rules out rather than mitigates.
 */
export function isMuted(
  c: Pick<Conversation, 'mutedUntil'>,
  uid: string,
  now: number = Date.now(),
): boolean {
  return mutedUntilFor(c, uid) > now;
}

/**
 * Why this person cannot write here, or null when they can.
 *
 * Returned as a shape rather than a sentence because the mute has a date in
 * it, and every date on screen in this app goes through
 * src/lib/dateFormat.ts — a sentence built here would be a date formatted
 * outside the company setting. The composer turns this into the line it shows.
 *
 * The mute is tested first: somebody muted in a room that also only lets
 * admins post should be told the thing that is about them.
 */
export type PostingBlock =
  | { reason: 'muted'; until: number }
  | { reason: 'adminsOnly' }
  /** A notice room, which only TTMS writes in. See ConversationKind. */
  | { reason: 'systemOnly' }
  | null;

export function postingBlock(
  c: Pick<Conversation, 'kind' | 'createdBy' | 'adminUids' | 'memberUids' | 'policy' | 'mutedUntil'>,
  uid: string,
  opts: { announcer?: boolean } = {},
): PostingBlock {
  // Before the policy test, which would also refuse — but with "only this
  // room's admins", and a notice room has none to be.
  if (c.kind === 'notice') return { reason: 'systemOnly' };
  if (isMuted(c, uid)) return { reason: 'muted', until: mutedUntilFor(c, uid) };
  if (!roomAllows(c, 'post', uid, opts)) return { reason: 'adminsOnly' };
  return null;
}

/**
 * Does this text carry a link?
 *
 * **Keep in sync with the `links` branch of the message create rule in
 * firestore.rules**, which carries the same pattern written out in RE2 and is
 * the half that actually enforces it. This copy exists so the composer can say
 * no before the write rather than after it — a rule refusing a message returns
 * "Missing or insufficient permissions", which is not an explanation.
 *
 * Deliberately coarse. It is a house rule about what a room is for, not a
 * filter anybody is trying to defeat; somebody who writes "totaltransport dot
 * com" has got past it, and has also made their point in a way a link ban was
 * never going to stop.
 */
export function containsLink(text: string): boolean {
  return /https?:\/\/|www\./i.test(text);
}

/* ------------------------------------------- what a room has been sent */

/**
 * The three things the Files panel sorts a room's history into.
 *
 * Photos and documents are split rather than listed together because they are
 * looked for differently: a photo is recognised by seeing it, so media is a
 * grid, and a document is recognised by its name, so documents are rows. Links
 * are neither — they are the thing somebody pasted three weeks ago and now
 * needs again.
 */
export type SharedKind = 'media' | 'doc' | 'link';

/**
 * Every link in a message, in the order they were written.
 *
 * Deliberately stricter than containsLink(), which is a house rule about what
 * a room is for and is allowed to be coarse. This one produces something that
 * has to open in a browser, so a bare `www.` is given the scheme it is missing
 * and trailing punctuation is left behind — "see https://x.com/a." ends in a
 * full stop belonging to the sentence, not to the address.
 */
export function linksIn(text: string | null | undefined): string[] {
  const found = String(text ?? '').match(/(?:https?:\/\/|www\.)[^\s<>"']+/gi) ?? [];
  const out: string[] = [];
  for (const raw of found) {
    const trimmed = raw.replace(/[.,;:!?)\]}'"]+$/, '');
    if (!trimmed) continue;
    const url = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    // The same address pasted twice in one message is one link.
    if (!out.includes(url)) out.push(url);
  }
  return out;
}

/**
 * What a message is carrying, filed as words a query can reach — see
 * ChatMessage.contentKinds for why this is stored rather than asked.
 *
 * Written on send, rebuilt on an edit and emptied on a take-back, exactly like
 * `searchTerms`: a message whose link was removed must stop answering to one,
 * and a photo somebody took back must not go on hanging in the panel where the
 * room can still see it.
 *
 * `isImage` decides media rather than the content type being re-sniffed here,
 * because that flag is what the thread itself drew the message from — a file
 * shown inline in the bubble and listed under Documents in the panel would be
 * two answers to the same question.
 */
export function contentKindsFor(message: {
  text?: string | null;
  attachments?: { isImage?: boolean }[] | null;
}): SharedKind[] {
  const kinds = new Set<SharedKind>();
  for (const file of message.attachments ?? []) {
    kinds.add(file?.isImage ? 'media' : 'doc');
  }
  if (linksIn(message.text).length > 0) kinds.add('link');
  return [...kinds];
}

/**
 * One thing a room has been sent: a file, or a link somebody pasted.
 *
 * Carries where it was said as well as what it was, because the answer to
 * "what is this rate sheet" is nearly always the conversation around it — so
 * every row in the panel is a way back to the message it came from.
 */
export interface SharedItem {
  kind: SharedKind;
  /** The message or reply it was sent in. */
  messageId: string;
  /** Set when it was sent inside a thread, which is what opens it. */
  rootId: string | null;
  senderUid: string;
  senderName: string;
  /** Milliseconds, like every other `at` the chat passes around. */
  at: number;
  /** Set on `media` and `doc`. */
  attachment?: Attachment;
  /** Set on `link`. */
  url?: string;
  /** The message text, shown under a link so the paste has its sentence. */
  text: string;
}


/* ------------------------------------------------- who has been in a room */

/**
 * Who has been in a room, who put them there, and when.
 *
 * A room's membership is the only thing deciding who can read what is said in
 * it, and until this existed a change to it left no trace at all: anybody in a
 * room could add or remove anybody else, and a month later there was nothing
 * to say who had done it or that it had happened. The same argument as
 * `ownerEvents` on an order, one floor down — see src/types/ownerEvent.ts.
 *
 * Kept at `conversations/{id}/memberEvents/{eventId}`, a subcollection rather
 * than an array on the room, for the reasons that file gives: an array would
 * be rewritable by anything that can write the parent, and a room that runs
 * for years would grow the document without bound.
 *
 * **Group rooms only, deliberately.** A direct thread is defined by its two
 * people and cannot change; the company room has no membership to change; and
 * a record room is joined by whoever opens the load, so a row per reader would
 * record nothing but who has looked at it. The history is shown in Room
 * settings, which is itself group-only.
 *
 * Written only through /api/chat/conversations — the routes that change
 * membership are the only things that know a change happened. `firestore.rules`
 * closes writes outright and lets the room's members read.
 */
export const MEMBER_EVENTS_COLLECTION = 'memberEvents';

/**
 * `created` is the membership the room opened with, written when it is made,
 * so the history starts where the room did rather than at the first edit.
 * `left` is somebody removing themselves, which is a different act from being
 * removed and reads as one.
 */
/**
 * The last five are not membership, and they are kept in this collection
 * anyway.
 *
 * Making somebody an admin, muting them, or locking the room down are changes
 * of exactly the same weight as adding and removing people — they decide what
 * colleagues may do in a shared space — and the question somebody asks weeks
 * later is one question, not two: "what happened to this room?" A second
 * collection would answer half of it and order badly against the other half.
 */
export type MemberEventAction =
  | 'created' | 'added' | 'removed' | 'left'
  | 'admin_added' | 'admin_removed'
  | 'muted' | 'unmuted'
  | 'policy';

export interface MemberEvent {
  id: string;
  action: MemberEventAction;
  /** Who it happened to. Empty on `policy`, which is about the room itself. */
  uid: string;
  /**
   * Their name as it stood at the time, copied like `senderName` on a message.
   * Resolved once rather than on read so somebody who has since left the
   * company still reads as a name years later instead of a dangling uid.
   */
  name: string;
  /** Who did it. The same person as `uid` for `left` and for `created`. */
  byUid: string;
  byName: string;
  at: Timestamp;
  /**
   * `policy` only: what was changed and to what, already worded — "Send
   * messages: admins only".
   *
   * Written out at the time rather than stored as a key and a value, so a line
   * about a switch that has since been renamed or retired still reads as the
   * sentence it was. Everything else in this collection copies its names for
   * the same reason.
   */
  detail?: string;
  /** `muted` only: when the mute was set to lift. */
  until?: number;
}

/**
 * One entry as a line of English, for the history in Room settings.
 *
 * Both names come off the entry rather than being looked up, which is the
 * point of copying them at write time: a line about somebody who has since
 * left the company still reads as a sentence.
 */
export function memberEventLine(
  event: MemberEvent,
  /**
   * How to write the moment a mute lifts. Passed in because every date on
   * screen goes through the company date setting, which this module cannot
   * reach — see useDateFormatters(). Without one the line simply stops at the
   * mute rather than naming a date in the wrong format.
   */
  formatDateTime?: (millis: number) => string,
): string {
  switch (event.action) {
    case 'created':
      // One entry per opening member, so the creator's own reads as the room
      // being made and everybody else's as being in it from the start.
      return event.uid === event.byUid
        ? `${event.byName} made the room`
        : `${event.byName} made the room with ${event.name}`;
    case 'added':   return `${event.byName} added ${event.name}`;
    case 'removed': return `${event.byName} removed ${event.name}`;
    case 'left':    return `${event.name} left`;
    case 'admin_added':   return `${event.byName} made ${event.name} an admin`;
    case 'admin_removed':
      // Said as itself rather than as "removed X as an admin", because an
      // admin standing down is the commoner of the two and reads oddly in the
      // passive.
      return event.uid === event.byUid
        ? `${event.name} stood down as an admin`
        : `${event.byName} took ${event.name}'s admin away`;
    case 'muted':
      return event.until && formatDateTime
        ? `${event.byName} muted ${event.name} until ${formatDateTime(event.until)}`
        : `${event.byName} muted ${event.name}`;
    case 'unmuted': return `${event.byName} unmuted ${event.name}`;
    case 'policy':  return `${event.byName} changed ${event.detail ?? 'the room settings'}`;
  }
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

