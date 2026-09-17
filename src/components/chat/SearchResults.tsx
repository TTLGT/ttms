'use client';

import { Search, X } from 'lucide-react';
import { useChat } from '@/context/ChatContext';
import { useDateFormatters } from '@/lib/useDateFormatters';
import { chatSearchWords, conversationTitle, type Conversation } from '@/types/conversation';
import RoomAvatar from './RoomAvatar';
import type { ChatSearchHit } from '@/lib/chatSearch';

/**
 * What a search of the chat history found.
 *
 * Takes the place of the room on screen rather than opening beside it: the
 * results are a list of places to go, and every one of them replaces what is
 * showing anyway. Closing comes straight back to the room that was open.
 */
export default function SearchResults({
  myUid, onClose,
}: {
  myUid: string;
  onClose: () => void;
}) {
  const { search, conversations, nameOf, setActiveId, setOpenThread, setFocusMessage, clearSearch } =
    useChat();
  const { formatDateTime } = useDateFormatters();

  if (!search) return null;

  const roomOf = (id: string): Conversation | undefined => conversations.find((c) => c.id === id);

  /**
   * Opens a hit where it was said.
   *
   * A hit in a room is a jump in the room. A hit inside a thread opens the
   * thread over it — a reply was never in the room, so scrolling the room to
   * it would find nothing, the same reasoning as the reaction notifications.
   */
  const open = (hit: ChatSearchHit) => {
    setActiveId(hit.conversationId);
    if (hit.rootId) {
      setOpenThread({ conversationId: hit.conversationId, rootId: hit.rootId });
      setFocusMessage({ messageId: hit.rootId, at: null });
    } else {
      setFocusMessage({ messageId: hit.messageId, at: hit.at });
    }
    clearSearch();
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="flex flex-shrink-0 items-center gap-2 border-b border-gray-200 px-4 py-3">
        <Search size={16} className="flex-shrink-0 text-gray-400" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-gray-900">
            {search.loading ? 'Searching…' : resultLine(search.hits.length, search.truncated)}
          </p>
          <p className="truncate text-xs text-gray-500">“{search.query}”</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          title="Close search"
          className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
        >
          <X size={16} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-gray-50 p-3">
        {search.error && <p className="px-1 py-3 text-sm text-red-600">{search.error}</p>}

        {!search.loading && !search.error && search.hits.length === 0 && (
          <div className="px-1 py-3 text-sm text-gray-500">
            <p>Nothing was said matching that.</p>
            {/* The two ways this search misses, said plainly. Both are real
                limits of how it works rather than accidents, and somebody who
                knows they said the thing needs to be told why it is not here
                — otherwise the answer they take away is that search is
                unreliable. */}
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-gray-400">
              <li>Whole words only — “invoice” finds it, “invoic” does not.</li>
              <li>Only rooms you are in. A load room you have never opened is not searched.</li>
            </ul>
          </div>
        )}

        {search.hits.map((hit) => {
          const room = roomOf(hit.conversationId);
          return (
            // The avatar sits outside the button rather than in it, the way
            // the conversation list does it: a button may only hold text, and
            // an avatar is a picture.
            <div
              key={`${hit.conversationId}:${hit.messageId}`}
              className="mb-1.5 flex w-full items-start gap-2.5 rounded-lg bg-white p-2.5 shadow-sm transition hover:bg-brand-50"
            >
              {room && <RoomAvatar conversation={room} size={28} />}
              <button
                type="button"
                onClick={() => open(hit)}
                className="min-w-0 flex-1 text-left"
              >
                <span className="flex items-baseline gap-1.5">
                  <span className="truncate text-xs font-semibold text-gray-900">
                    {hit.senderName || nameOf(hit.senderUid)}
                  </span>
                  <span className="truncate text-[11px] text-gray-500">
                    {room ? conversationTitle(room, myUid, nameOf) : 'A room you have left'}
                    {hit.rootId ? ' · in a thread' : ''}
                  </span>
                  {/* Through the company date format like every other date on
                      screen — see src/lib/dateFormat.ts. With the time on it,
                      because two results from the same afternoon are otherwise
                      the same row twice. */}
                  <span className="ml-auto flex-shrink-0 text-[11px] text-gray-400">
                    {hit.at ? formatDateTime(new Date(hit.at)) : ''}
                  </span>
                </span>
                <Snippet text={hit.text} query={search.query} />
                {hit.attachmentNames.length > 0 && (
                  <span className="mt-0.5 block truncate text-[11px] text-gray-400">
                    {hit.attachmentNames.join(', ')}
                  </span>
                )}
              </button>
            </div>
          );
        })}

        {search.truncated && search.hits.length > 0 && (
          // "We stopped looking" and "there is no more" are different answers,
          // and somebody hunting for something from March needs to know which
          // one they have been given.
          <p className="px-1 py-2 text-center text-[11px] text-gray-400">
            Showing the most recent matches. Add another word to narrow it.
          </p>
        )}
      </div>
    </div>
  );
}

function resultLine(count: number, truncated: boolean): string {
  if (count === 0) return 'No matches';
  if (count === 1) return '1 message';
  return `${count}${truncated ? '+' : ''} messages`;
}

/**
 * The matching line of a message, with the words that matched picked out.
 *
 * Centred on the first match rather than starting at the beginning: a hit
 * forty words into a long message would otherwise show forty words of
 * something else, and the reason to show the text at all is to let somebody
 * tell one hit from another without opening either.
 */
function Snippet({ text, query }: { text: string; query: string }) {
  const words = chatSearchWords(query);
  if (!text) return <span className="block text-xs text-gray-400">No text</span>;

  const lower = text.toLowerCase();
  const first = words
    .map((w) => lower.indexOf(w))
    .filter((i) => i >= 0)
    .sort((a, b) => a - b)[0] ?? 0;

  const from = Math.max(0, first - 40);
  const cut  = text.slice(from, from + 180);

  // Split on the matched words so they can be marked. Escaped, because a search
  // for "c++" would otherwise be a broken regular expression rather than a
  // search.
  const pattern = words.length > 0
    ? new RegExp(`(${words.map(escapeRegExp).join('|')})`, 'gi')
    : null;

  return (
    <span className="mt-0.5 block text-xs leading-snug text-gray-600 line-clamp-2">
      {from > 0 && '… '}
      {pattern
        ? cut.split(pattern).map((part, i) =>
            words.includes(part.toLowerCase())
              ? <mark key={i} className="rounded bg-amber-100 px-0.5 text-gray-900">{part}</mark>
              : <span key={i}>{part}</span>)
        : cut}
      {from + 180 < text.length && ' …'}
    </span>
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
