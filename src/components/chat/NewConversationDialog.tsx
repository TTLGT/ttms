'use client';

import { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useChat } from '@/context/ChatContext';
import { createGroupConversation, openDirectConversation } from '@/lib/chat';
import { UserAvatar } from '@/components/settings/UserAvatar';
import type { UserProfile } from '@/types/userProfile';

/**
 * Starting a conversation: a direct thread with one person, or a named room.
 *
 * Both live in one dialog because from where the user stands they are the same
 * intention — "I want to talk to someone" — and splitting them across two
 * buttons in the sidebar would mean deciding which one you meant before you
 * have picked anybody.
 *
 * The list of people is everyone who has signed in, which is the same set the
 * Directory shows. Chat crosses none of the ownership boundaries that orders
 * and parties are gated by: everyone on the allowlist is staff, and staff can
 * talk to staff.
 */
export default function NewConversationDialog({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const { people, setActiveId } = useChat();

  const [mode, setMode]       = useState<'direct' | 'room'>('direct');
  const [search, setSearch]   = useState('');
  const [roomName, setRoom]   = useState('');
  const [picked, setPicked]   = useState<string[]>([]);
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState('');

  // Never yourself: a thread with one participant is not a conversation, and
  // the server refuses it anyway.
  const others = useMemo(
    () => people
      .filter((p) => p.uid !== user?.uid)
      .sort((a, b) => (a.displayName || a.email).localeCompare(b.displayName || b.email)),
    [people, user?.uid],
  );

  const matching = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return others;
    return others.filter((p) =>
      `${p.displayName ?? ''} ${p.email ?? ''}`.toLowerCase().includes(q),
    );
  }, [others, search]);

  async function startDirect(otherUid: string) {
    setBusy(true);
    setError('');
    try {
      setActiveId(await openDirectConversation(otherUid));
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open that conversation.');
      setBusy(false);
    }
  }

  async function createRoom() {
    setBusy(true);
    setError('');
    try {
      setActiveId(await createGroupConversation(roomName, picked));
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create that room.');
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-full w-full max-w-md flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
        <div className="flex flex-shrink-0 items-start justify-between border-b border-gray-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">New conversation</h2>
            <p className="mt-1 text-xs text-gray-500">
              Message one person, or set up a room for a few of you.
            </p>
          </div>
          <button type="button" onClick={onClose} title="Close" className="text-gray-400 hover:text-gray-700">
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-shrink-0 gap-1 border-b border-gray-200 px-5 pt-3">
          <Tab active={mode === 'direct'} onClick={() => setMode('direct')}>One person</Tab>
          <Tab active={mode === 'room'}   onClick={() => setMode('room')}>A room</Tab>
        </div>

        <div className="flex min-h-0 flex-1 flex-col px-5 py-4">
          {mode === 'room' && (
            <input
              value={roomName}
              onChange={(e) => setRoom(e.target.value)}
              placeholder="Room name — Dispatch, Night shift, Acme move…"
              className="mb-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
          )}

          <div className="relative mb-3">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search people"
              className="w-full rounded-lg border border-gray-300 py-2 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {matching.length === 0 && (
              <p className="py-6 text-center text-sm text-gray-400">
                {others.length === 0
                  // Being on the allowlist is not enough to be messaged: there
                  // is no uid to address until the person has actually signed
                  // in once. Worth saying, or an empty list reads as a fault.
                  ? 'Nobody else has signed in to TTMS yet.'
                  : 'Nobody matches that.'}
              </p>
            )}

            {matching.map((p) => (
              <PersonRow
                key={p.uid}
                person={p}
                mode={mode}
                checked={picked.includes(p.uid)}
                disabled={busy}
                onClick={() => {
                  if (mode === 'direct') { void startDirect(p.uid); return; }
                  setPicked((was) =>
                    was.includes(p.uid) ? was.filter((u) => u !== p.uid) : [...was, p.uid],
                  );
                }}
              />
            ))}
          </div>

          {error && <p className="mt-3 text-xs text-red-500">{error}</p>}

          {mode === 'room' && (
            <div className="mt-4 flex flex-shrink-0 items-center justify-between border-t border-gray-200 pt-4">
              <span className="text-xs text-gray-500">
                {picked.length === 0
                  ? 'Pick who is in it'
                  : `${picked.length} ${picked.length === 1 ? 'person' : 'people'} plus you`}
              </span>
              <button
                type="button"
                onClick={() => void createRoom()}
                disabled={busy || !roomName.trim() || picked.length === 0}
                className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-600 disabled:opacity-40"
              >
                {busy ? 'Creating…' : 'Create room'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Tab({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-t-lg border-b-2 px-3 py-2 text-sm font-medium transition ${
        active
          ? 'border-brand-500 text-brand-700'
          : 'border-transparent text-gray-500 hover:text-gray-800'
      }`}
    >
      {children}
    </button>
  );
}

function PersonRow({
  person, mode, checked, disabled, onClick,
}: {
  person: UserProfile;
  mode: 'direct' | 'room';
  checked: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-gray-50 disabled:opacity-50 ${
        checked ? 'bg-brand-50' : ''
      }`}
    >
      <UserAvatar
        photoPath={person.photoPath}
        fallback={(person.displayName || person.email || '?').charAt(0).toUpperCase()}
        size={32}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-900">
          {person.displayName || person.email}
        </p>
        <p className="truncate text-xs text-gray-500">{person.email}</p>
      </div>
      {mode === 'room' && (
        // Rendered, not interactive: the whole row is the control, and a real
        // checkbox inside a button swallows the click that toggles it.
        <span
          aria-hidden
          className={`h-4 w-4 flex-shrink-0 rounded border ${
            checked ? 'border-brand-500 bg-brand-500' : 'border-gray-300'
          }`}
        />
      )}
    </button>
  );
}
