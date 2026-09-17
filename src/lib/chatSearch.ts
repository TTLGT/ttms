import { adminDb } from './firebase-admin';
import {
  chatSearchWords,
  COMPANY_CONVERSATION_ID,
  CONVERSATIONS_COLLECTION,
  MESSAGES_COLLECTION,
  REPLIES_COLLECTION,
} from '@/types/conversation';

/**
 * Searching what has been said in chat.
 *
 * **This is the one part of chat that cannot be read from the browser**, and
 * the reason is the same shape as the one that keeps orders behind an API. A
 * search spans every room a person is in, so as a client query it would have
 * to be a collection-group query over `messages` — and a collection-group rule
 * has no way to work out which conversation a document belongs to, so there is
 * no rule that could gate it. Rather than open every message in the company to
 * every signed-in account, the search runs here with the Admin SDK and the
 * rooms are worked out from the caller's own uid.
 *
 * **Nothing about which rooms to search is taken from the request.** The
 * browser knows its own conversation list and passing it would save a query,
 * but a request that names the rooms to search is a request that can name
 * somebody else's.
 */

/** A message that matched, with enough around it to draw a result row. */
export interface ChatSearchHit {
  conversationId: string;
  messageId: string;
  /** Set when the hit was said inside a thread rather than in the room. */
  rootId: string | null;
  text: string;
  senderUid: string;
  senderName: string;
  /** Millis, so the browser can format it with the company's date setting. */
  at: number;
  /** File names sent with it, for a hit that matched an attachment. */
  attachmentNames: string[];
}

export interface ChatSearchResult {
  hits: ChatSearchHit[];
  /**
   * True when a room's own query filled its limit, so there is older matching
   * history that is not in this list.
   *
   * Said out loud on screen rather than silently dropped: "no more results" and
   * "we stopped looking" are different answers, and a person searching for
   * something they remember from March needs to know which one they got.
   */
  truncated: boolean;
}

/**
 * Most rooms one search will look in.
 *
 * A search costs roughly two queries per room — the messages and the replies —
 * so this is what stops one person who is in two hundred rooms turning a
 * keystroke into four hundred queries. The rooms are taken newest-active
 * first, which is the order the conversation list is already in.
 */
const MAX_ROOMS_SEARCHED = 60;

/** Most hits taken from any one room. */
const PER_ROOM_LIMIT = 40;

/** Most hits returned altogether. Beyond this nobody is reading, they are rephrasing. */
const MAX_HITS = 100;

/**
 * Every conversation this person may search: the company room, which everyone
 * is in without being listed, plus the ones naming them.
 *
 * A record room is only here once its owner has opened it — that is what puts
 * a uid in `memberUids`. So a load room nobody on this account has opened is
 * not searched, even where the load itself is visible. Reaching those would
 * mean running canSeeOrder over every record room in the company on every
 * search, which is a different and much more expensive feature.
 */
async function searchableConversationIds(uid: string): Promise<string[]> {
  const [mine, company] = await Promise.all([
    adminDb.collection(CONVERSATIONS_COLLECTION)
      .where('memberUids', 'array-contains', uid)
      .get(),
    adminDb.collection(CONVERSATIONS_COLLECTION).doc(COMPANY_CONVERSATION_ID).get(),
  ]);

  // Ordered here rather than with an `orderBy` on the query, which alongside
  // array-contains would need a composite index of its own. watchConversations
  // makes the same trade for the same reason: one person is in a handful of
  // rooms, so the sort is free and the index is one less thing to deploy.
  const ids = mine.docs
    .sort((a, b) =>
      (b.get('updatedAt')?.toMillis?.() ?? 0) - (a.get('updatedAt')?.toMillis?.() ?? 0))
    .map((d) => d.id);
  // First rather than appended: the company room is where most of what anybody
  // half-remembers was actually said.
  if (company.exists) ids.unshift(COMPANY_CONVERSATION_ID);
  return ids.slice(0, MAX_ROOMS_SEARCHED);
}

/**
 * Runs one term against one collection in one room.
 *
 * Firestore allows a single `array-contains` per query, so a search for three
 * words is filtered on one of them here and narrowed in memory below. The
 * first word is the one used: there is no way to know which is rarest without
 * a second index nobody is going to maintain, and a person's first word is
 * usually the specific one — they type "invoice", then "morris" to narrow it.
 */
async function hitsIn(
  conversationId: string,
  collection: string,
  term: string,
): Promise<ChatSearchHit[]> {
  const snap = await adminDb
    .collection(CONVERSATIONS_COLLECTION).doc(conversationId)
    .collection(collection)
    .where('searchTerms', 'array-contains', term)
    .orderBy('createdAt', 'desc')
    .limit(PER_ROOM_LIMIT)
    .get();

  const rows: ChatSearchHit[] = [];
  for (const d of snap.docs) {
    const m = d.data() as {
      text?: string;
      senderUid?: string;
      senderName?: string;
      rootId?: string;
      deletedAt?: unknown;
      createdAt?: { toMillis?: () => number } | null;
      attachments?: { name: string }[];
    };
    // A message that was taken back has its terms emptied in the same write,
    // so this should never fire. It is here because the one thing worse than a
    // search that misses something is a search that shows what somebody
    // deleted, and a backfill run against history could leave terms on a
    // tombstone written before this existed.
    if (m.deletedAt) continue;
    rows.push({
      conversationId,
      messageId:       d.id,
      rootId:          m.rootId ?? null,
      text:            m.text ?? '',
      senderUid:       m.senderUid ?? '',
      senderName:      m.senderName ?? '',
      at:              m.createdAt?.toMillis?.() ?? 0,
      attachmentNames: (m.attachments ?? []).map((a) => a.name),
    });
  }
  return rows;
}

/**
 * What one person can find by typing `query`.
 *
 * Returns newest first across every room, which is what a search box is for:
 * "what did we say about that" is nearly always a question about the most
 * recent time it was said.
 */
export async function searchChat(uid: string, query: string): Promise<ChatSearchResult> {
  const words = chatSearchWords(query);
  if (words.length === 0) return { hits: [], truncated: false };

  const conversationIds = await searchableConversationIds(uid);
  if (conversationIds.length === 0) return { hits: [], truncated: false };

  const [first, ...rest] = words;

  // Every room at once. They are independent queries against different
  // subcollections, and running them in series would make a search take as
  // long as the person has rooms.
  const perRoom = await Promise.all(
    conversationIds.flatMap((id) => [
      hitsIn(id, MESSAGES_COLLECTION, first),
      hitsIn(id, REPLIES_COLLECTION, first),
    ]),
  );

  const truncated = perRoom.some((rows) => rows.length >= PER_ROOM_LIMIT);

  // The remaining words are applied here rather than in the query. Matching is
  // done against the text and the sender's name the same way the stored terms
  // were built, so "vivian invoice" narrows to what Vivian said without the
  // caller needing a syntax for it.
  const matchesRest = (hit: ChatSearchHit): boolean => {
    if (rest.length === 0) return true;
    const haystack = new Set([
      ...chatSearchWords(hit.text),
      ...chatSearchWords(hit.senderName),
      ...hit.attachmentNames.flatMap((n) => chatSearchWords(n)),
    ]);
    return rest.every((w) => haystack.has(w));
  };

  const hits = perRoom
    .flat()
    .filter(matchesRest)
    .sort((a, b) => b.at - a.at)
    .slice(0, MAX_HITS);

  return { hits, truncated: truncated || hits.length >= MAX_HITS };
}
