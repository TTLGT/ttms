'use client';

import { useMemo, useState } from 'react';
import { LogOut, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useChat } from '@/context/ChatContext';
import { leaveConversation, updateGroupConversation } from '@/lib/chat';
import { UserAvatar } from '@/components/settings/UserAvatar';
import type { Conversation } from '@/types/conversation';

/**
 * Renaming a room and changing who is in it.
 *
 * Open to any member, not only whoever created it. A room is a working space,
 * not an owned record — the person who happened to open it is often not the
 * one still running it a month later, and there is no admin layer here to
 * appeal to. The server applies the same test.
 */
export default function RoomSettingsDialog({
  conversation,
  onClose,
}: {
  conversation: Conversation;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const { people, setActiveId } = useChat();
  const myUid = user?.uid ?? '';

  const [name, setName]       = useState(conversation.name);
  const [members, setMembers] = useState<string[]>(conversation.memberUids);
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState('');

  const others = useMemo(
    () => people
      .filter((p) => p.uid !== myUid)
      .sort((a, b) => (a.displayName || a.email).localeCompare(b.displayName || b.email)),
    [people, myUid],
  );

  async function save() {
    setBusy(true);
    setError('');
    try {
      await updateGroupConversation(conversation.id, { name: name.trim(), memberUids: members });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save those changes.');
      setBusy(false);
    }
  }

  async function leave() {
    setBusy(true);
    setError('');
    try {
      await leaveConversation(conversation.id);
      // Cleared before closing: the conversation is about to vanish from the
      // list, and a panel still pointing at it would sit there on a thread the
      // rules have just stopped allowing.
      setActiveId(null);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not leave the room.');
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-full w-full max-w-md flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
        <div className="flex flex-shrink-0 items-start justify-between border-b border-gray-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Room settings</h2>
            <p className="mt-1 text-xs text-gray-500">
              Anyone in the room can rename it or change who is in it.
            </p>
          </div>
          <button type="button" onClick={onClose} title="Close" className="text-gray-400 hover:text-gray-700">
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <label className="mb-1 block text-xs font-medium text-gray-600">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mb-4 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
          />

          <p className="mb-2 text-xs font-medium text-gray-600">Who is in it</p>
          {others.map((p) => {
            const inRoom = members.includes(p.uid);
            return (
              <button
                key={p.uid}
                type="button"
                onClick={() =>
                  setMembers((was) =>
                    was.includes(p.uid) ? was.filter((u) => u !== p.uid) : [...was, p.uid],
                  )
                }
                className={`mb-0.5 flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-gray-50 ${
                  inRoom ? 'bg-brand-50' : ''
                }`}
              >
                <UserAvatar
                  photoPath={p.photoPath}
                  fallback={(p.displayName || p.email || '?').charAt(0).toUpperCase()}
                  size={32}
                />
                <span className="min-w-0 flex-1 truncate text-sm text-gray-900">
                  {p.displayName || p.email}
                </span>
                <span
                  aria-hidden
                  className={`h-4 w-4 flex-shrink-0 rounded border ${
                    inRoom ? 'border-brand-500 bg-brand-500' : 'border-gray-300'
                  }`}
                />
              </button>
            );
          })}

          {/* Taking somebody out does not take their messages out. Said plainly
              here because the opposite is a reasonable thing to assume, and
              finding out afterwards is the wrong time. */}
          <p className="mt-3 text-[11px] text-gray-400">
            Removing someone stops them seeing the room from now on. What they already
            wrote stays in it.
          </p>
        </div>

        {error && <p className="flex-shrink-0 px-5 text-xs text-red-500">{error}</p>}

        <div className="flex flex-shrink-0 items-center justify-between border-t border-gray-200 px-5 py-4">
          <button
            type="button"
            onClick={() => void leave()}
            disabled={busy}
            className="flex items-center gap-1.5 text-sm text-red-500 transition hover:text-red-700 disabled:opacity-50"
          >
            <LogOut size={14} /> Leave room
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy || !name.trim() || members.length === 0}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-600 disabled:opacity-40"
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
