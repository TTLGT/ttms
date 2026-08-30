'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, Settings2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useChat } from '@/context/ChatContext';
import ConversationList from './ConversationList';
import MessageThread from './MessageThread';
import NewConversationDialog from './NewConversationDialog';
import RoomSettingsDialog from './RoomSettingsDialog';
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
  const { conversations, activeId, setActiveId, nameOf, error, loading } = useChat();

  const [newOpen, setNewOpen]           = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const myUid  = user?.uid ?? '';
  const active = conversations.find((c) => c.id === activeId) ?? null;

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
        {active ? (
          <>
            <Header
              conversation={active}
              myUid={myUid}
              nameOf={nameOf}
              onBack={() => setActiveId(null)}
              onSettings={() => setSettingsOpen(true)}
            />
            <div className="min-h-0 flex-1">
              <MessageThread conversationId={active.id} />
            </div>
          </>
        ) : (
          <ConversationList onNew={() => setNewOpen(true)} />
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
        <ConversationList onNew={() => setNewOpen(true)} />
      </div>

      <div className="flex min-h-0 flex-1 flex-col bg-white">
        {active ? (
          <>
            <Header
              conversation={active}
              myUid={myUid}
              nameOf={nameOf}
              onSettings={() => setSettingsOpen(true)}
            />
            <div className="min-h-0 flex-1">
              <MessageThread conversationId={active.id} />
            </div>
          </>
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-gray-400">Pick a conversation on the left.</p>
          </div>
        )}
      </div>

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

      {/* Only rooms have anything to change. The company room belongs to
          everyone, and a direct thread is defined by its two people. */}
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

  const others = c.memberUids.filter((uid) => uid !== myUid).map(nameOf);
  if (others.length === 0) return 'Just you';
  // Past a few names the line is longer than the room name above it and stops
  // being readable, so it turns into a count.
  if (others.length > 4) return `You and ${others.length} others`;
  return `You, ${others.join(', ')}`;
}
