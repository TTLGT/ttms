'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { MessageSquare, Phone } from 'lucide-react';
import { useChat } from '@/context/ChatContext';
import { openDirectConversation } from '@/lib/chat';
import { telHref } from '@/lib/phone';
import type { OwnerContact } from '@/types/order';

/**
 * Who to ask about a load this user cannot open.
 *
 * Shown in place of the shipper on the Documents screen's licence rows. The
 * reader can fetch the licence but not the load, so the useful thing to put in
 * front of them is not a blank cell — it is the person who can answer.
 *
 * A direct thread rather than the load's own room: the room is gated on being
 * able to see the order, which by definition this reader is not. Messaging the
 * owner is the one channel that is actually open to them.
 *
 * Must be rendered inside the dashboard layout, which is where ChatProvider is
 * mounted.
 */
export default function OrderOwnerContact({ owner }: { owner: OwnerContact }) {
  const pathname = usePathname();
  const { setActiveId, setPopupOpen } = useChat();
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState('');

  // No account on the other end: a work group, an invite nobody has accepted,
  // or an order with no owner at all. Naming it is still worth more than a
  // blank, but there is nothing to open and no desk to ring.
  const name = owner.name || 'an administrator';

  async function message() {
    if (!owner.uid) return;
    setBusy(true);
    setError('');
    try {
      setActiveId(await openDirectConversation(owner.uid));
      // The popup, not the chat page — the same reasoning as DiscussButton.
      // Whoever is looking at this row is part-way through finding a document
      // and should not lose the list to ask a question about it.
      if (!pathname.startsWith('/dashboard/chat')) setPopupOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That conversation could not be opened.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <span className="text-sm text-gray-600">{name}</span>
        <span className="text-[10px] font-medium uppercase tracking-wide text-gray-400 border border-gray-200 rounded px-1 py-px">
          Owner
        </span>
      </div>
      <div className="flex items-center gap-3">
        {owner.uid && (
          <button
            type="button"
            onClick={() => void message()}
            disabled={busy}
            title={`Message ${name}`}
            className="inline-flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 disabled:opacity-50"
          >
            <MessageSquare size={12} className="opacity-70" />
            {busy ? 'Opening…' : 'Message'}
          </button>
        )}
        {owner.phone && (
          <a
            href={telHref(owner.phone, 'US')}
            className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
          >
            <Phone size={12} className="opacity-70" />
            {owner.phone}
            {owner.extension && <span className="text-gray-400">ext. {owner.extension}</span>}
          </a>
        )}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
