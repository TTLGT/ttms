'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ExternalLink, Settings2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useChat } from '@/context/ChatContext';
import ConversationList from './ConversationList';
import MessageThread from './MessageThread';
import NewConversationDialog from './NewConversationDialog';
import RoomSettingsDialog from './RoomSettingsDialog';
import ThreadList from './ThreadList';
import ThreadPanel from './ThreadPanel';
import {
  COMPANY_CONVERSATION_ID,
  conversationTitle,
  type Conversation,
} from '@/types/conversation';

/**
 * The chat itself — the list beside a thread.
 *
 * One component behind both the full page and the floating popup, because the
 * two have to agree: which conversation is open, what has been read, what is
 * still bold. Two implementations of that would drift apart within a week.
 * They differ only in `compact`, which is about how much room there is, not
 * about what the thing does.
 */
export default function ChatPanel({ compact = false }: { compact?: boolean }) {
  const { user } = useAuth();
  const {
    conversations, activeId, setActiveId, nameOf, error, loading, openThread, setOpenThread,
  } = useChat();

  const [newOpen, setNewOpen]           = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Which list the left column is showing. Local rather than in ChatContext:
  // the page and the popup are two different places to be looking, and having
  // one flip the other to a list the reader did not ask for is worse than
  // letting each remember its own.
  const [showThreads, setShowThreads]   = useState(false);

  const myUid  = user?.uid ?? '';
  const active = conversations.find((c) => c.id === activeId) ?? null;

  // Guarded against the conversation rather than trusted on its own: the
  // provider clears a thread when its room closes, but this renders in the
  // frame before that effect runs, and a thread panel reading out of a room
  // that is no longer on screen is a permissions error waiting to happen.
  const thread = openThread && active && openThread.conversationId === active.id
    ? openThread
    : null;

  // Open on the company room the first time, so chat is never an empty screen
  // with nothing to click. Only when nothing is selected — this must not drag
  // someone out of a conversation when the list re-sorts under them.
  useEffect(() => {
    if (loading || activeId) return;
    if (compact) return; // The popup opens on the list; see below.
    const company = conversations.find((c) => c.id === COMPANY_CONVERSATION_ID);
    if (company) setActiveId(company.id);
  }, [loading, activeId, compact, conversations, setActiveId]);

  // A conversation you have just left, or been removed from, stops arriving in
  // the list. Without this the thread would stay on screen showing whatever it
  // had already loaded.
  useEffect(() => {
    if (!activeId || loading) return;
    if (!conversations.some((c) => c.id === activeId)) setActiveId(null);
  }, [activeId, conversations, loading, setActiveId]);

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="max-w-sm text-center text-sm text-gray-500">{error}</p>
      </div>
    );
  }

  // Narrow: one thing at a time, with a way back. Side by side in a 380px
  // popup would leave a thread about 200px wide, which is not a chat.
  if (compact) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        {/* One thing at a time here too: an open thread replaces the room
            rather than sitting beside it, and closing it comes straight back.
            Its own header carries the way out. */}
        {active && thread ? (
          <ThreadPanel
            conversation={active}
            rootId={thread.rootId}
            onClose={() => setOpenThread(null)}
          />
        ) : active ? (
          <>
            <Header
              conversation={active}
              myUid={myUid}
              nameOf={nameOf}
              onBack={() => setActiveId(null)}
              onSettings={() => setSettingsOpen(true)}
            />
            <div className="min-h-0 flex-1">
              <MessageThread conversation={active} />
            </div>
          </>
        ) : showThreads ? (
          <ThreadList onBack={() => setShowThreads(false)} />
        ) : (
          <ConversationList onNew={() => setNewOpen(true)} onShowThreads={() => setShowThreads(true)} />
        )}

        {newOpen && <NewConversationDialog onClose={() => setNewOpen(false)} />}
        {settingsOpen && active?.kind === 'group' && (
          <RoomSettingsDialog conversation={active} onClose={() => setSettingsOpen(false)} />
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      <div className="w-72 flex-shrink-0 border-r border-gray-200 bg-white">
        {showThreads ? (
          <ThreadList onBack={() => setShowThreads(false)} />
        ) : (
          <ConversationList onNew={() => setNewOpen(true)} onShowThreads={() => setShowThreads(true)} />
        )}
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-white">
        {active ? (
          <>
            <Header
              conversation={active}
              myUid={myUid}
              nameOf={nameOf}
              onSettings={() => setSettingsOpen(true)}
            />
            <div className="min-h-0 flex-1">
              <MessageThread conversation={active} />
            </div>
          </>
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-gray-400">Pick a conversation on the left.</p>
          </div>
        )}
      </div>

      {/* A column beside the room, not over it. The reason a thread exists is
          that the room carries on without it, and a panel covering the room
          would take that away at the moment it is most wanted — somebody
          answering one question while watching for the next. */}
      {active && thread && (
        <div className="w-[360px] flex-shrink-0 border-l border-gray-200 xl:w-[420px]">
          <ThreadPanel
            conversation={active}
            rootId={thread.rootId}
            onClose={() => setOpenThread(null)}
          />
        </div>
      )}

      {newOpen && <NewConversationDialog onClose={() => setNewOpen(false)} />}
      {settingsOpen && active?.kind === 'group' && (
        <RoomSettingsDialog conversation={active} onClose={() => setSettingsOpen(false)} />
      )}
    </div>
  );
}

function Header({
  conversation, myUid, nameOf, onBack, onSettings,
}: {
  conversation: Conversation;
  myUid: string;
  nameOf: (uid: string) => string;
  onBack?: () => void;
  onSettings: () => void;
}) {
  return (
    <div className="flex flex-shrink-0 items-center gap-2 border-b border-gray-200 px-4 py-3">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          title="Back to conversations"
          className="-ml-1 rounded-lg p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
        >
          <ArrowLeft size={16} />
        </button>
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-gray-900">
          {conversationTitle(conversation, myUid, nameOf)}
        </p>
        <p className="truncate text-xs text-gray-500">{subtitle(conversation, myUid, nameOf)}</p>
      </div>

      {/* The record this room is about, one click away. A conversation about a
          load is only worth having here if the load is always to hand — the
          alternative is somebody reading four messages about a pickup date and
          then searching for the order to check it. Record rooms are never
          renamed, so there is no settings gear beside it. */}
      {conversation.kind === 'record' && conversation.recordId && (
        <Link
          href={`/dashboard/orders/${conversation.recordId}`}
          title="Open this order"
          className="flex flex-shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-brand-600 transition hover:bg-brand-50"
        >
          Open order
          <ExternalLink size={12} />
        </Link>
      )}

      {/* Only named rooms have anything to change. The company room belongs to
          everyone, a direct thread is defined by its two people, and a record
          room is titled by its record. */}
      {conversation.kind === 'group' && (
        <button
          type="button"
          onClick={onSettings}
          title="Room settings"
          className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
        >
          <Settings2 size={16} />
        </button>
      )}
    </div>
  );
}

/** Who is in here, in a line — the question people ask of a room they just opened. */
function subtitle(c: Conversation, myUid: string, nameOf: (uid: string) => string): string {
  if (c.kind === 'company') return 'Everyone at Total Transport Logistics';
  if (c.kind === 'direct')  return 'Just the two of you';
  // A record room says who is in it *so far*, because that is the honest
  // description: nobody was invited, and anybody who can see the order joins
  // by opening it. A count that read like a guest list would be misleading.
  if (c.kind === 'record') {
    const here = c.memberUids.length;
    return here <= 1
      ? 'About this load · you are the first one here'
      : `About this load · ${here} people here so far`;
  }

  const others = c.memberUids.filter((uid) => uid !== myUid).map(nameOf);
  if (others.length === 0) return 'Just you';
  // Past a few names the line is longer than the room name above it and stops
  // being readable, so it turns into a count.
  if (others.length > 4) return `You and ${others.length} others`;
  return `You, ${others.join(', ')}`;
}
