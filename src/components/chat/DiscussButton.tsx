'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MessagesSquare } from 'lucide-react';
import { useChat } from '@/context/ChatContext';
import { openRecordConversation } from '@/lib/chat';
import { recordConversationId, type RecordKind } from '@/types/conversation';

/**
 * "Discuss" — the way from a record into the conversation about it.
 *
 * This is the argument for having built chat inside TTMS rather than signing
 * up for Slack. Every conversation about load 41207 ends up in one room, and
 * that room is reachable from the load itself a year later — by whoever is
 * working it then, who may not have been in the company when it was said.
 *
 * There is no invitation and no membership to maintain: anyone who can see the
 * order is in its room, and pressing this is what joins them. The check that
 * decides that runs server-side in /api/chat/conversations — see
 * openRecordConversation.
 *
 * Must be rendered inside the dashboard layout, which is where ChatProvider is
 * mounted.
 */
export default function DiscussButton({
  recordType = 'order',
  recordId,
}: {
  recordType?: RecordKind;
  recordId: string;
}) {
  const router = useRouter();
  const { setActiveId, conversations, unreadIds, mentionIds } = useChat();
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState('');

  // The room may already be in this person's list, which is worth saying
  // before they click: a mark here is the difference between "start a
  // conversation" and "there is one waiting for you".
  const id     = recordConversationId(recordType, recordId);
  const exists = conversations.some((c) => c.id === id);
  const unread = unreadIds.includes(id) || mentionIds.includes(id);

  async function open() {
    setBusy(true);
    setError('');
    try {
      const opened = await openRecordConversation(recordType, recordId);
      // Both, in this order: the chat page opens on whatever is active, so
      // setting it first means the room is already there when the page draws.
      setActiveId(opened);
      router.push('/dashboard/chat');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That conversation could not be opened.');
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end">
      <button
        type="button"
        onClick={() => void open()}
        disabled={busy}
        title={exists ? 'Open the conversation about this load' : 'Start the conversation about this load'}
        className="relative flex items-center gap-1.5 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
      >
        <MessagesSquare size={15} className="opacity-70" />
        {busy ? 'Opening…' : 'Discuss'}
        {unread && (
          <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-brand-500 ring-2 ring-white" />
        )}
      </button>
      {error && <p className="mt-1 max-w-xs text-right text-xs text-red-600">{error}</p>}
    </div>
  );
}
