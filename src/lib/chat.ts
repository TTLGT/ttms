'use client';

import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getCountFromServer,
  increment,
  limit as limitTo,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { auth, db } from './firebase';
import {
  CHAT_READS_COLLECTION,
  CHAT_THREADS_COLLECTION,
  COMPANY_CONVERSATION_ID,
  CONVERSATIONS_COLLECTION,
  MAX_MESSAGE_LENGTH,
  notifyLevel,
  MAX_PINNED,
  MESSAGES_COLLECTION,
  REPLIES_COLLECTION,
  THREAD_PAGE_SIZE,
  threadFollowers,
  type Attachment,
  type ChatMessage,
  type ChatReads,
  type Conversation,
  type ConversationNotify,
  type MessageQuote,
  type PinnedMessage,
  type RecordKind,
  type ThreadEntry,
} from '@/types/conversation';

/**
 * Chat data access.
 *
 * This is the one part of TTMS that reads Firestore live from the browser
 * rather than through an API route, and the split is deliberate:
 *
 *  - **Reads and message sends go direct**, over `onSnapshot`. Orders go
 *    through /api/orders because the union of mine, my groups' and my clients'
 *    cannot be written as one query the rules would approve. Chat has no such
 *    problem: conversations I am a member of is a single array-contains query,
 *    and the rules can check exactly that. Routing it through the server would
 *    cost a round trip per message and lose the live updates, which are the
 *    entire point of a chat.
 *  - **Creating a conversation and changing who is in it go through
 *    /api/chat**, like every other structural write in this codebase. Those
 *    decide who can see what, so they are checked server-side.
 *
 * Every read below is still gated by firestore.rules. Nothing here is trusted.
 */

function conversationsCol() {
  return collection(db, CONVERSATIONS_COLLECTION);
}

function messagesCol(conversationId: string) {
  return collection(db, CONVERSATIONS_COLLECTION, conversationId, MESSAGES_COLLECTION);
}

/** Thread replies, beside the messages rather than under them — see the type. */
function repliesCol(conversationId: string) {
  return collection(db, CONVERSATIONS_COLLECTION, conversationId, REPLIES_COLLECTION);
}

/** One person's list of the threads they are in. See CHAT_THREADS_COLLECTION. */
function myThreadsCol(uid: string) {
  return collection(db, CHAT_THREADS_COLLECTION, uid, 'threads');
}

/**
 * One message, wherever it lives.
 *
 * A reply is the same shape as a message and can be edited, deleted and
 * reacted to in exactly the same ways, so everything that acts on one takes
 * this instead of hard-coding the collection. The single flag is the whole
 * difference between the two.
 */
function messageRef(conversationId: string, messageId: string, isReply = false) {
  return doc(isReply ? repliesCol(conversationId) : messagesCol(conversationId), messageId);
}

async function authHeaders(): Promise<HeadersInit> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in');
  return {
    'Content-Type':  'application/json',
    'Authorization': `Bearer ${await user.getIdToken()}`,
  };
}

async function unwrap<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as T;
}

/* ---------------------------------------------------------------- reading */

/**
 * Every conversation this user is in, kept live.
 *
 * Two listeners, because the company room cannot be found by the same query as
 * the rest: it has no `memberUids` to match on (see the note in
 * types/conversation.ts). They are merged here so callers see one list.
 *
 * Sorting is done in memory rather than with `orderBy('updatedAt')` on the
 * query. Combining array-contains with an order on another field needs a
 * composite index, and one person is in a handful of conversations, not
 * thousands — the sort is free and the index is one less thing to deploy.
 */
export function watchConversations(
  uid: string,
  onChange: (conversations: Conversation[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  let company: Conversation | null = null;
  let mine: Conversation[] = [];

  // Both listeners fire independently and neither has the whole picture, so
  // each publishes the merge of whatever has arrived so far.
  const publish = () => {
    const all = company ? [company, ...mine] : [...mine];
    all.sort((a, b) => millis(b.updatedAt) - millis(a.updatedAt));
    onChange(all);
  };

  const stopCompany = onSnapshot(
    doc(db, CONVERSATIONS_COLLECTION, COMPANY_CONVERSATION_ID),
    (snap) => {
      // Absent until ensureChatReady() has created it. Not an error state —
      // it just means nobody has opened chat on this database yet.
      company = snap.exists() ? ({ id: snap.id, ...snap.data() } as Conversation) : null;
      publish();
    },
    (err) => onError?.(err),
  );

  const stopMine = onSnapshot(
    query(conversationsCol(), where('memberUids', 'array-contains', uid)),
    (snap) => {
      mine = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Conversation);
      publish();
    },
    (err) => onError?.(err),
  );

  return () => { stopCompany(); stopMine(); };
}

/**
 * The messages in one conversation, oldest first.
 *
 * `max` caps how far back a thread loads. A room a year old holds tens of
 * thousands of messages, every one of which would be read, billed and rendered
 * on open; nobody scrolls that far. The query takes the newest by ordering
 * descending, which is why the result is reversed before it is handed on.
 */
export function watchMessages(
  conversationId: string,
  onChange: (messages: ChatMessage[]) => void,
  max = 200,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    query(messagesCol(conversationId), orderBy('createdAt', 'desc'), limitTo(max)),
    (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ChatMessage);
      onChange(rows.reverse());
    },
    (err) => onError?.(err),
  );
}

/**
 * The replies under one message, oldest first.
 *
 * Capped like the room is, and for the same reason, though it should never
 * bind: a thread that has run past two hundred replies stopped being a thread
 * some time ago. The newest are the ones kept, so a thread that long still
 * opens on the part being argued about.
 */
export function watchReplies(
  conversationId: string,
  rootId: string,
  onChange: (replies: ChatMessage[]) => void,
  max = THREAD_PAGE_SIZE,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    query(
      repliesCol(conversationId),
      where('rootId', '==', rootId),
      orderBy('createdAt', 'desc'),
      limitTo(max),
    ),
    (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ChatMessage);
      onChange(rows.reverse());
    },
    (err) => onError?.(err),
  );
}

/**
 * One message in the room, kept live, so an open thread can show the message it
 * hangs under as it stands now.
 *
 * The thread panel cannot rely on the room's copy: the panel outlives a scroll
 * that pushes the root out of the loaded window, and a message edited or taken
 * back while its thread is open must say so at the top of the thread rather
 * than go on showing what it used to say.
 */
export function watchMessage(
  conversationId: string,
  messageId: string,
  onChange: (message: ChatMessage | null) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(messagesCol(conversationId), messageId),
    (snap) => onChange(snap.exists() ? ({ id: snap.id, ...snap.data() } as ChatMessage) : null),
    (err) => onError?.(err),
  );
}

/* ---------------------------------------------------------------- writing */

/**
 * Sends a message and bumps the conversation preview in the same batch.
 *
 * One batch, not two writes: a message that landed without moving its
 * conversation up everyone's list — and without marking it unread — is a
 * message nobody gets told about.
 */
export async function sendMessage(
  conversationId: string,
  text: string,
  sender: { uid: string; displayName: string },
  mentions: string[] = [],
  replyTo: MessageQuote | null = null,
  attachments: Attachment[] = [],
): Promise<void> {
  const body = text.trim();
  // A photo on its own is a message. Only an empty box with nothing attached
  // to it is not.
  if (!body && attachments.length === 0) return;
  if (body.length > MAX_MESSAGE_LENGTH) {
    throw new Error(`A message can be at most ${MAX_MESSAGE_LENGTH} characters.`);
  }

  const batch      = writeBatch(db);
  const newMessage = doc(messagesCol(conversationId));

  batch.set(newMessage, {
    text:       body,
    senderUid:  sender.uid,
    senderName: sender.displayName,
    createdAt:  serverTimestamp(),
    deletedAt:  null,
    editedAt:   null,
    mentions,
    attachments,
    reactions: {},
    // Firestore rejects `undefined` outright, so every optional field on the
    // quote is written as an explicit null rather than left off.
    replyTo: replyTo
      ? {
          messageId:            replyTo.messageId,
          text:                 replyTo.text,
          senderUid:            replyTo.senderUid,
          senderName:           replyTo.senderName,
          fromConversationId:   replyTo.fromConversationId ?? null,
          fromConversationName: replyTo.fromConversationName ?? null,
        }
      : null,
  });

  const conversationPatch: Record<string, unknown> = {
    lastMessage: {
      // A photo with no caption still needs a preview line, or the conversation
      // list shows an empty row and reads as broken.
      text:       body || attachments[0]?.name || '',
      senderUid:  sender.uid,
      senderName: sender.displayName,
      at:         serverTimestamp(),
    },
    updatedAt: serverTimestamp(),
  };
  // Written as dotted paths so each person's mark is set without rewriting the
  // whole map — two people mentioning different colleagues at the same moment
  // would otherwise overwrite each other's.
  for (const uid of mentions) {
    // Naming yourself is not a mention. It happens when someone reads their
    // own name off the screen while typing, and badging them for it is noise.
    if (uid === sender.uid) continue;
    conversationPatch[`mentionedAt.${uid}`] = serverTimestamp();
  }
  batch.update(doc(db, CONVERSATIONS_COLLECTION, conversationId), conversationPatch);

  await batch.commit();
}

/**
 * What a thread is called where the message itself is not on screen — a row in
 * somebody's thread list, or a notification.
 *
 * A message may be nothing but an attachment, so the file name is the title in
 * that case. Without it the thread under a photo or a spreadsheet is stored
 * with an empty title, and every reader of that empty string has to guess what
 * it means — the list read it as a deleted message, which is the one thing it
 * definitely was not.
 *
 * A root that really was deleted says so, because a thread outlives the message
 * it hangs under and an empty title would otherwise be indistinguishable from a
 * file nobody named.
 */
function rootLabel(
  root: Pick<ChatMessage, 'text' | 'attachments' | 'deletedAt'>,
): string {
  if (root.deletedAt) return 'Message deleted';
  return (root.text || root.attachments?.[0]?.name || '').slice(0, 120);
}

/**
 * Answers a message in its own thread.
 *
 * The one write in chat that deliberately leaves the room alone. `updatedAt`
 * is untouched, `lastMessage` is untouched, and nothing here marks the room
 * unread — a thread that shoved the whole room to the top of everybody's list
 * on every reply would be a thread in name only.
 *
 * What it does instead, in the same batch:
 *
 *  - writes the reply;
 *  - moves the counters on the message it hangs under, which is what draws the
 *    "3 replies" line every member of the room can see;
 *  - leaves a mark on the conversation for the people the reply is actually
 *    for — see threadFollowers — which is how anyone not staring at the thread
 *    finds out it was answered;
 *  - marks the thread read for the person writing it, so their own reply does
 *    not come back at them as something unread.
 *
 * One batch rather than several writes for the same reason as sendMessage: a
 * reply that landed without its counters is a reply nobody can see is there,
 * and the room would go on saying "2 replies" over a thread holding three.
 */
export async function sendThreadReply(
  conversationId: string,
  root: Pick<ChatMessage, 'id' | 'text' | 'senderUid' | 'replyUids' | 'attachments' | 'deletedAt'>,
  text: string,
  sender: { uid: string; displayName: string },
  mentions: string[] = [],
  attachments: Attachment[] = [],
): Promise<void> {
  const body = text.trim();
  if (!body && attachments.length === 0) return;
  if (body.length > MAX_MESSAGE_LENGTH) {
    throw new Error(`A reply can be at most ${MAX_MESSAGE_LENGTH} characters.`);
  }

  const batch = writeBatch(db);

  batch.set(doc(repliesCol(conversationId)), {
    rootId:     root.id,
    text:       body,
    senderUid:  sender.uid,
    senderName: sender.displayName,
    createdAt:  serverTimestamp(),
    deletedAt:  null,
    editedAt:   null,
    mentions,
    attachments,
    reactions: {},
  });

  // `increment` rather than a read and a put back: two people answering the
  // same message in the same second is the ordinary case in a thread, and a
  // read-then-write would lose one of them and leave the count short for good.
  //
  // Nothing ever decrements it. A reply that is taken back leaves a tombstone
  // in the thread exactly as a message does, so the count still matches what
  // the thread shows.
  batch.update(doc(messagesCol(conversationId), root.id), {
    replyCount:  increment(1),
    lastReplyAt: serverTimestamp(),
    replyUids:   arrayUnion(sender.uid),
  });

  // Dotted paths, one per person, so two threads answered at the same moment
  // in the same room do not overwrite each other's marks.
  const followers = threadFollowers(root, mentions, sender.uid);
  if (followers.length > 0) {
    const patch: Record<string, unknown> = {};
    for (const uid of followers) {
      patch[`threadPings.${uid}`] = {
        at:      serverTimestamp(),
        byUid:   sender.uid,
        byName:  sender.displayName,
        rootId:  root.id,
        // Trimmed at the write rather than at render: this sits on a document
        // every member of the room reads, and it only has to fill one line of
        // a desktop notification.
        text:     (body || attachments[0]?.name || '').slice(0, 120),
        rootText: rootLabel(root),
        mention:  mentions.includes(uid),
      };
    }
    batch.update(doc(db, CONVERSATIONS_COLLECTION, conversationId), patch);
  }

  // Your own reply is not news to you. Written here rather than left to the
  // thread panel, because the panel marks the thread read on open and this
  // reply arrives after that.
  batch.set(
    doc(db, CHAT_READS_COLLECTION, sender.uid),
    { uid: sender.uid, threadReadAt: { [root.id]: Date.now() } },
    { merge: true },
  );

  /*
   * A row in the thread list of everybody this thread now belongs to — the
   * followers, and the person writing, who is plainly in it too.
   *
   * One document each rather than one shared list, so a colleague replying to
   * you writes exactly one row of your list and can neither empty it nor grow
   * it without bound. `merge` because the row for a thread already in somebody's
   * list is an update to it, not a second copy.
   *
   * The room's name is not copied: a direct thread is called something
   * different by each of the two people in it, and the list resolves it from
   * the conversations it is already watching. See ThreadEntry.
   */
  const entry = {
    rootId:          root.id,
    conversationId,
    rootText:        rootLabel(root),
    rootSenderUid:   root.senderUid,
    lastReplyAt:     serverTimestamp(),
    lastReplyByUid:  sender.uid,
    lastReplyByName: sender.displayName,
    lastReplyText:   (body || attachments[0]?.name || '').slice(0, 120),
  };
  for (const uid of [...followers, sender.uid]) {
    batch.set(
      doc(myThreadsCol(uid), root.id),
      // Only ever true for somebody the reply actually named. The writer's own
      // row is never a mention of themselves.
      { ...entry, mention: uid !== sender.uid && mentions.includes(uid) },
      { merge: true },
    );
  }

  await batch.commit();
}

/**
 * Corrects the wording of a message already sent.
 *
 * The thread marks it "(edited)" afterwards — the correction is allowed, and
 * the fact that it happened stays visible to whoever read the first version.
 *
 * Mentions are deliberately not re-resolved here. Adding an @ by editing a
 * message somebody has already scrolled past would badge them for something
 * that appears, from their side, to have been on screen all along. If you need
 * to pull someone in, send a new message.
 */
export async function editMessage(
  conversationId: string,
  messageId: string,
  text: string,
  options: { isLastMessage: boolean; isReply?: boolean },
): Promise<void> {
  const body = text.trim();
  if (!body) throw new Error('An edited message cannot be empty. Delete it instead.');
  if (body.length > MAX_MESSAGE_LENGTH) {
    throw new Error(`A message can be at most ${MAX_MESSAGE_LENGTH} characters.`);
  }

  const batch = writeBatch(db);
  batch.update(messageRef(conversationId, messageId, options.isReply), {
    text:     body,
    editedAt: serverTimestamp(),
  });
  // Only the preview text, and only when this *is* the preview. `updatedAt` is
  // left alone on purpose: fixing a typo is not new activity, and bumping it
  // would shove the conversation to the top of everyone's list for nothing.
  if (options.isLastMessage) {
    batch.update(doc(db, CONVERSATIONS_COLLECTION, conversationId), {
      'lastMessage.text': body,
    });
  }

  await batch.commit();
}

/**
 * Takes a message back.
 *
 * The document is emptied rather than removed. Deleting it outright would
 * leave the conversation preview quoting text that exists nowhere any more,
 * and would make a thread two people had already read change shape underneath
 * them. The rules let only the sender do this.
 */
export async function deleteMessage(
  conversationId: string,
  messageId: string,
  options: { isLastMessage: boolean; isReply?: boolean } = { isLastMessage: false },
): Promise<void> {
  const batch = writeBatch(db);
  batch.update(messageRef(conversationId, messageId, options.isReply), {
    text:      '',
    deletedAt: serverTimestamp(),
  });
  // A reply taken back leaves the count on the message alone. The tombstone is
  // still in the thread, so a count that dropped would disagree with what the
  // thread actually shows — and a message whose thread has been emptied out
  // still has a thread worth opening.
  // Otherwise the conversation list goes on quoting text the thread no longer
  // shows — the one place a deleted message would still be readable.
  if (options.isLastMessage) {
    batch.update(doc(db, CONVERSATIONS_COLLECTION, conversationId), {
      'lastMessage.text': '',
    });
  }
  await batch.commit();
}

/**
 * Adds or removes your reaction to a message.
 *
 * Written as a dotted path with arrayUnion/arrayRemove rather than by reading
 * the map and putting it back: five people reacting to the same message at the
 * same moment is entirely normal, and a read-then-write would lose four of
 * them.
 *
 * Reaction keys are plain ASCII — see REACTIONS in types/conversation.ts. An
 * emoji as a Firestore field name would need quoting on every path it appears
 * in, and would be one bad escape away from writing to the wrong field.
 */
export async function toggleReaction(
  conversationId: string,
  // `rootId` is set only on a thread reply, and is the only thing that tells
  // the two apart — both for which collection to write to and for where a
  // notification about it has to land.
  message: { id: string; senderUid: string; text: string; rootId?: string | null },
  reactionKey: string,
  reactor: { uid: string; displayName: string },
  add: boolean,
): Promise<void> {
  const batch = writeBatch(db);
  batch.update(messageRef(conversationId, message.id, Boolean(message.rootId)), {
    [`reactions.${reactionKey}`]: add ? arrayUnion(reactor.uid) : arrayRemove(reactor.uid),
  });

  // A mark on the conversation so the person whose message it is can be told,
  // written in the same batch as the reaction itself — see ReactionPing. Only
  // when adding: taking a thumbs-up back is not news, and notifying somebody
  // that a colleague changed their mind would be worse than saying nothing.
  // Never for your own message either, which is the commonest reaction of all
  // and the one nobody needs telling about.
  if (add && message.senderUid !== reactor.uid) {
    batch.update(doc(db, CONVERSATIONS_COLLECTION, conversationId), {
      [`reactionPings.${message.senderUid}`]: {
        at:        serverTimestamp(),
        byUid:     reactor.uid,
        byName:    reactor.displayName,
        key:       reactionKey,
        messageId: message.id,
        // Carried so that following the notification opens the thread the
        // reply is in. Jumping to it in the room would find nothing — it was
        // never in the room.
        rootId:    message.rootId ?? null,
        // Trimmed here rather than at render: this is a copy on a document
        // every member reads, and it only ever has to fill one line of a
        // desktop notification.
        text:      message.text.slice(0, 120),
      },
    });
  }

  await batch.commit();
}

/* ------------------------------------------------------------------- pins */

/**
 * Pins a message to the top of the room it was said in.
 *
 * Unlike a pinned conversation, this one is the room's and everybody in it
 * sees it — which is the point. The on-call number, this week's priority load
 * and the thing dispatch keeps being asked twice a day belong at the top of
 * the room rather than in whoever remembers them.
 *
 * Anybody in the room may pin and anybody may unpin, not only the message's
 * sender and not only whoever pinned it. These are working rooms with no admin
 * to appeal to — the same reasoning that lets any member rename a room — and a
 * pin only the person who left it could remove is a pin that outlives them
 * leaving.
 *
 * Written at `pinned.<messageId>` so two people pinning different messages at
 * the same moment do not overwrite each other. See the field on Conversation
 * for why this is a map and not an array.
 */
export async function pinMessage(
  conversationId: string,
  message: Pick<ChatMessage, 'id' | 'text' | 'senderUid' | 'senderName' | 'attachments' | 'rootId'>,
  pinnedBy: { uid: string; displayName: string },
  alreadyPinned: number,
): Promise<void> {
  if (alreadyPinned >= MAX_PINNED) {
    throw new Error(`A room can hold ${MAX_PINNED} pinned messages. Unpin one first.`);
  }

  const pin: PinnedMessage = {
    messageId:    message.id,
    // A message may be nothing but a photo, so the file name is the label —
    // the same rule rootLabel follows, and for the same reason: an empty
    // string in a list reads as a message that was deleted.
    text:         (message.text || message.attachments?.[0]?.name || '').slice(0, 200),
    senderUid:    message.senderUid,
    senderName:   message.senderName,
    pinnedByUid:  pinnedBy.uid,
    pinnedByName: pinnedBy.displayName,
    // The browser's clock. A server timestamp cannot be written inside a map
    // value, and this only orders one short list — the same trade the read
    // marks make.
    at:           Date.now(),
    rootId:       message.rootId ?? null,
  };

  await updateDoc(doc(db, CONVERSATIONS_COLLECTION, conversationId), {
    [`pinned.${message.id}`]: pin,
  });
}

/** Takes a message off the pin bar. The message itself is untouched. */
export async function unpinMessage(conversationId: string, messageId: string): Promise<void> {
  await updateDoc(doc(db, CONVERSATIONS_COLLECTION, conversationId), {
    [`pinned.${messageId}`]: deleteField(),
  });
}

/** The pins of one room, newest first — the order the bar draws them in. */
export function pinnedMessages(conversation: Conversation): PinnedMessage[] {
  return Object.values(conversation.pinned ?? {}).sort((a, b) => b.at - a.at);
}

/* ------------------------------------------------------------------ reads */

/**
 * Everything this user's own chat document holds, kept live.
 *
 * Read marks for rooms and for threads, how loud each room is, and what they
 * have pinned to the top of either list. All four out of one document and one
 * listener, because all four are answers to "what does this person want to see
 * first" and every one of them is needed to draw the same list. A thread's
 * mark cannot ride on its room's — opening a room would otherwise clear every
 * thread inside it, including the ones the reader never opened. See ChatReads.
 */
export interface ChatMarks {
  lastReadAt: Record<string, number>;
  threadReadAt: Record<string, number>;
  notify: Record<string, ConversationNotify>;
  pinnedConversations: string[];
  pinnedThreads: string[];
}

export function watchReads(
  uid: string,
  onChange: (marks: ChatMarks) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, CHAT_READS_COLLECTION, uid),
    (snap) => {
      const data = snap.data() as Partial<ChatReads> | undefined;
      onChange({
        lastReadAt:          data?.lastReadAt          ?? {},
        threadReadAt:        data?.threadReadAt        ?? {},
        notify:              data?.notify              ?? {},
        pinnedConversations: data?.pinnedConversations ?? [],
        pinnedThreads:       data?.pinnedThreads       ?? [],
      });
    },
    (err) => onError?.(err),
  );
}

/**
 * Sets how loud one room is for this user.
 *
 * Written as a dotted path so turning one room down does not rewrite the
 * settings for every other. 'all' is stored rather than removed: a key that is
 * there and says 'all' and a key that is missing mean the same thing, and
 * deleting it would be one more Firestore operation to get wrong for a
 * document that holds a handful of short strings.
 */
export async function setConversationNotify(
  uid: string,
  conversationId: string,
  level: ConversationNotify,
): Promise<void> {
  await setDoc(
    doc(db, CHAT_READS_COLLECTION, uid),
    { uid, notify: { [conversationId]: level } },
    { merge: true },
  );
}

/**
 * Pins a conversation to the top of this user's list, or takes it off.
 *
 * `arrayUnion`/`arrayRemove` rather than writing the array back: this document
 * is written from every tab the person has TTMS open in, and a read-then-write
 * would let one tab undo a pin made in another.
 *
 * The two lists are separate fields rather than one, because a thread and a
 * room are pinned to different lists and a shared array would put a thread's
 * root id into the room list, where nothing would ever resolve it.
 */
export async function setConversationPinned(
  uid: string,
  conversationId: string,
  pinned: boolean,
): Promise<void> {
  await setDoc(
    doc(db, CHAT_READS_COLLECTION, uid),
    { uid, pinnedConversations: pinned ? arrayUnion(conversationId) : arrayRemove(conversationId) },
    { merge: true },
  );
}

/** The same, for a row in the threads list. Keyed by the thread's root id. */
export async function setThreadPinned(
  uid: string,
  rootId: string,
  pinned: boolean,
): Promise<void> {
  await setDoc(
    doc(db, CHAT_READS_COLLECTION, uid),
    { uid, pinnedThreads: pinned ? arrayUnion(rootId) : arrayRemove(rootId) },
    { merge: true },
  );
}

/**
 * Marks a conversation read up to now.
 *
 * The clock here is the browser's, not the server's: a serverTimestamp cannot
 * be written into a map under a key like this. A skewed clock costs at worst a
 * badge that clears a few seconds early or late, which is not worth a round
 * trip to put right.
 */
export async function markConversationRead(uid: string, conversationId: string): Promise<void> {
  await setDoc(
    doc(db, CHAT_READS_COLLECTION, uid),
    { uid, lastReadAt: { [conversationId]: Date.now() } },
    { merge: true },
  );
}

/**
 * Every thread this user is in, kept live, newest reply first.
 *
 * One listener over one small collection, which is the whole reason the list is
 * written down rather than worked out — see CHAT_THREADS_COLLECTION. The order
 * is a plain single-field sort, so unlike reading a thread this needs no
 * composite index.
 *
 * Capped, because a list nobody scrolls past the top of does not need to load
 * two years of side conversations. Anything older is still reachable from the
 * message it hangs under, in the room.
 */
export function watchMyThreads(
  uid: string,
  onChange: (threads: ThreadEntry[]) => void,
  max = 50,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    query(myThreadsCol(uid), orderBy('lastReplyAt', 'desc'), limitTo(max)),
    (snap) => onChange(snap.docs.map((d) => ({ ...d.data(), rootId: d.id }) as ThreadEntry)),
    (err) => onError?.(err),
  );
}

/**
 * Takes one thread off this user's list.
 *
 * Not "leave the thread" — a later reply that names them, or answers their
 * message, puts it straight back, which is right: the list is a record of the
 * threads they are in, not a subscription they can decline. This is for a row
 * somebody is finished with, and the rules let only its owner do it.
 */
export async function dismissThread(uid: string, rootId: string): Promise<void> {
  await deleteDoc(doc(myThreadsCol(uid), rootId));
}

/**
 * Marks one thread read up to now.
 *
 * Keyed on the message the thread hangs under, not on the room, so it survives
 * the room being read. The browser's clock, for the same reason as
 * markConversationRead: a serverTimestamp cannot be written into a map under a
 * key like this, and the cost of a skewed clock is a mark that clears a second
 * early.
 */
export async function markThreadRead(uid: string, rootId: string): Promise<void> {
  await setDoc(
    doc(db, CHAT_READS_COLLECTION, uid),
    { uid, threadReadAt: { [rootId]: Date.now() } },
    { merge: true },
  );
}

/**
 * Which conversations have something new in them for this user.
 *
 * Your own messages never count — you have read what you just typed — and a
 * conversation nobody has spoken in yet counts as read.
 *
 * A room turned down to mentions or muted outright produces nothing here, which
 * is the whole of what turning it down does: the messages still arrive and are
 * still there to read, they simply stop putting a number in front of anybody.
 * Being named is a separate question and survives it — see below.
 */
export function unreadConversationIds(
  conversations: Conversation[],
  lastReadAt: Record<string, number>,
  myUid: string,
  notify: Record<string, ConversationNotify> = {},
): string[] {
  return conversations
    .filter((c) => {
      if (notifyLevel(notify, c.id) !== 'all') return false;
      const last = c.lastMessage;
      if (!last || last.senderUid === myUid) return false;
      return millis(last.at) > (lastReadAt[c.id] ?? 0);
    })
    .map((c) => c.id);
}

/**
 * Which conversations have named this user with an @ since they last read.
 *
 * Kept separate from ordinary unread rather than folded into it: the point of
 * a mention is that it outranks the twenty other things also unread, so it has
 * to be countable on its own.
 */
export function unreadMentionIds(
  conversations: Conversation[],
  lastReadAt: Record<string, number>,
  myUid: string,
  notify: Record<string, ConversationNotify> = {},
): string[] {
  return conversations
    .filter((c) => notifyLevel(notify, c.id) !== 'none')
    .filter((c) => millis(c.mentionedAt?.[myUid]) > (lastReadAt[c.id] ?? 0))
    .map((c) => c.id);
}

/**
 * Which conversations hold a thread that has been answered for this user.
 *
 * Measured against the *thread's* read mark rather than the room's, which is
 * what makes it survive somebody glancing at the room without opening the
 * thread. The ping carries the thread it belongs to, so this needs nothing
 * from the messages themselves — the conversation list is the only thing
 * watched all day, and that is where the mark has to be readable from.
 *
 * One slot per person, so a conversation with two answered threads in it shows
 * one mark, naming the newer. That is the honest limit of a single slot, and
 * it is the same bargain reactionPings makes: this drives an interruption at
 * the moment it lands, not a list to be worked through.
 */
export function unreadThreadIds(
  conversations: Conversation[],
  threadReadAt: Record<string, number>,
  myUid: string,
  notify: Record<string, ConversationNotify> = {},
): string[] {
  return conversations
    .filter((c) => {
      // A thread reply is aimed at the people it is for, so it survives a room
      // turned down to mentions — that setting is about the room's ordinary
      // traffic, and a reply under your own message is not that. Only a fully
      // muted room silences it.
      if (notifyLevel(notify, c.id) === 'none') return false;
      const ping = c.threadPings?.[myUid];
      if (!ping) return false;
      return millis(ping.at) > (threadReadAt[ping.rootId] ?? 0);
    })
    .map((c) => c.id);
}

/**
 * How many messages have arrived in one conversation since `since`.
 *
 * A count aggregation, not a read of the messages themselves: Firestore bills
 * this as one document read per thousand it counts, so a badge saying "12"
 * costs the same as one saying "1" and the same as the dot it replaces. Adding
 * the messages up by fetching them — the reason this list carried a plain dot
 * before — would have cost a read per unread message, on every conversation,
 * every time anybody said anything.
 *
 * It cannot also exclude the reader's own messages: a second inequality on
 * senderUid would need its own composite index. It does not need to. A
 * conversation only counts as unread when somebody else spoke last, and
 * opening one to speak in it marks it read on the way in, so there is nothing
 * of your own inside the window being counted.
 */
export async function countUnreadMessages(conversationId: string, since: number): Promise<number> {
  const snap = await getCountFromServer(
    query(messagesCol(conversationId), where('createdAt', '>', Timestamp.fromMillis(since))),
  );
  return snap.data().count;
}

/** Timestamp to millis, tolerating the instant before the server stamp lands. */
export function millis(ts: { toMillis?: () => number } | null | undefined): number {
  return typeof ts?.toMillis === 'function' ? ts.toMillis() : 0;
}

/* -------------------------------------------------------- structure (API) */

/**
 * Makes sure the company room exists before the listeners go looking for it.
 *
 * Called once when chat first opens. It is a server call because creating the
 * room every employee is in is not something a browser should be trusted with.
 */
export async function ensureChatReady(): Promise<void> {
  await unwrap(await fetch('/api/chat/conversations', { headers: await authHeaders() }));
}

/** Opens — creating if needed — the direct thread with one colleague. */
export async function openDirectConversation(otherUid: string): Promise<string> {
  const res = await fetch('/api/chat/conversations', {
    method:  'POST',
    headers: await authHeaders(),
    body:    JSON.stringify({ kind: 'direct', otherUid }),
  });
  const { id } = await unwrap<{ id: string }>(res);
  return id;
}

/**
 * Opens — creating, or joining — the room about one record.
 *
 * The join is the part that has to be a server call. Whether somebody may be
 * in the room about load 41207 is exactly the question "may they see load
 * 41207", and that is a union of ownership rules the browser cannot be trusted
 * to answer about itself. The route checks it and adds the caller to the
 * membership the security rules read; nothing here can put anybody in a room.
 */
export async function openRecordConversation(
  recordType: RecordKind,
  recordId: string,
): Promise<string> {
  const res = await fetch('/api/chat/conversations', {
    method:  'POST',
    headers: await authHeaders(),
    body:    JSON.stringify({ kind: 'record', recordType, recordId }),
  });
  const { id } = await unwrap<{ id: string }>(res);
  return id;
}

/** Creates a named room. The creator is always in it. */
export async function createGroupConversation(name: string, memberUids: string[]): Promise<string> {
  const res = await fetch('/api/chat/conversations', {
    method:  'POST',
    headers: await authHeaders(),
    body:    JSON.stringify({ kind: 'group', name, memberUids }),
  });
  const { id } = await unwrap<{ id: string }>(res);
  return id;
}

/** Renames a room or changes who is in it. Members only. */
export async function updateGroupConversation(
  conversationId: string,
  patch: { name?: string; memberUids?: string[] },
): Promise<void> {
  await unwrap(await fetch(`/api/chat/conversations/${conversationId}`, {
    method:  'PATCH',
    headers: await authHeaders(),
    body:    JSON.stringify(patch),
  }));
}

/** Removes you from a room. The messages stay for everyone still in it. */
export async function leaveConversation(conversationId: string): Promise<void> {
  await unwrap(await fetch(`/api/chat/conversations/${conversationId}`, {
    method:  'DELETE',
    headers: await authHeaders(),
  }));
}
