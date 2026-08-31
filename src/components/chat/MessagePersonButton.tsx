'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { MessageSquare } from 'lucide-react';
import { useChat } from '@/context/ChatContext';
import { openDirectConversation } from '@/lib/chat';
import { useAuth } from '@/context/AuthContext';

/**
 * Opens a direct thread with one colleague.
 *
 * The counterpart of DiscussButton, which opens the room about a *record*.
 * This one is for the places where the record is not the point, or is not
 * reachable: the directory, and the panels that name the owner of something
 * the reader cannot open. A record's room is gated on being able to see the
 * record, so for a load somebody has no access to, a direct thread is the only
 * channel there is.
 *
 * Renders nothing when there is nobody to message — a work group, an invite
 * never accepted, or the reader themselves. A button that opens a thread with
 * yourself is not worth the row it sits on.
 *
 * Must be rendered inside the dashboard layout, which is where ChatProvider is
 * mounted.
 */
export default function MessagePersonButton({
  uid,
  name,
  label = 'Message',
  className = 'inline-flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 disabled:opacity-50',
  iconSize = 12,
}: {
  uid: string | null | undefined;
  name?: string;
  label?: string;
  className?: string;
  /** 0 draws no icon — for a caller that supplies its own, like Fact. */
  iconSize?: number;
}) {
  const pathname = usePathname();
  const { user } = useAuth();
  const { setActiveId, setPopupOpen } = useChat();
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState('');

  if (!uid || uid === user?.uid) return null;

  async function open() {
    if (!uid) return;
    setBusy(true);
    setError('');
    try {
      setActiveId(await openDirectConversation(uid));
      // The floating panel rather than the chat page: whoever pressed this was
      // part-way through something else and should not lose it to ask a
      // question. The popup hides itself on the chat page, where setting the
      // active room is all that is needed anyway.
      if (!pathname.startsWith('/dashboard/chat')) setPopupOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That conversation could not be opened.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void open()}
        disabled={busy}
        title={name ? `Message ${name}` : 'Message'}
        className={className}
      >
        {iconSize > 0 && <MessageSquare size={iconSize} className="opacity-70" />}
        {busy ? 'Opening…' : label}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </>
  );
}
