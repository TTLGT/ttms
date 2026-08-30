'use client';

import {
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  getCountFromServer,
  limit as limitTo,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { auth, db } from './firebase';
import {
  CHAT_READS_COLLECTION,
  COMPANY_CONVERSATION_ID,
  CONVERSATIONS_COLLECTION,
  MAX_MESSAGE_LENGTH,
  MESSAGES_COLLECTION,
  type Attachment,
  type ChatMessage,
  type Conversation,
  type MessageQuote,
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
  const messageRef = doc(messagesCol(conversationId));

  batch.set(messageRef, {
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
  options: { isLastMessage: boolean },
): Promise<void> {
  const body = text.trim();
  if (!body) throw new Error('An edited message cannot be empty. Delete it instead.');
  if (body.length > MAX_MESSAGE_LENGTH) {
    throw new Error(`A message can be at most ${MAX_MESSAGE_LENGTH} characters.`);
  }

  const batch = writeBatch(db);
  batch.update(doc(messagesCol(conversationId), messageId), {
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
  options: { isLastMessage: boolean } = { isLastMessage: false },
): Promise<void> {
  const batch = writeBatch(db);
  batch.update(doc(messagesCol(conversationId), messageId), {
    text:      '',
    deletedAt: serverTimestamp(),
  });
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
  message: { id: string; senderUid: string; text: string },
  reactionKey: string,
  reactor: { uid: string; displayName: string },
  add: boolean,
): Promise<void> {
  const batch = writeBatch(db);
  batch.update(doc(messagesCol(conversationId), message.id), {
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
        // Trimmed here rather than at render: this is a copy on a document
        // every member reads, and it only ever has to fill one line of a
        // desktop notification.
        text:      message.text.slice(0, 120),
      },
    });
  }

  await batch.commit();
}

/* ------------------------------------------------------------------ reads */

/** What this user has read, kept live, as `{ [conversationId]: millis }`. */
export function watchReads(
  uid: string,
  onChange: (lastReadAt: Record<string, number>) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, CHAT_READS_COLLECTION, uid),
    (snap) => onChange((snap.data()?.lastReadAt as Record<string, number>) ?? {}),
    (err) => onError?.(err),
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
 * Which conversations have something new in them for this user.
 *
 * Your own messages never count — you have read what you just typed — and a
 * conversation nobody has spoken in yet counts as read.
 */
export function unreadConversationIds(
  conversations: Conversation[],
  lastReadAt: Record<string, number>,
  myUid: string,
): string[] {
  return conversations
    .filter((c) => {
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
): string[] {
  return conversations
    .filter((c) => millis(c.mentionedAt?.[myUid]) > (lastReadAt[c.id] ?? 0))
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
