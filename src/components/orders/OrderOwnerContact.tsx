'use client';

import { Phone } from 'lucide-react';
import MessagePersonButton from '@/components/chat/MessagePersonButton';
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
  // No account on the other end: a work group, an invite nobody has accepted,
  // or an order with no owner at all. Naming it is still worth more than a
  // blank, but there is nothing to open and no desk to ring.
  const name = owner.name || 'an administrator';

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <span className="text-sm text-gray-600">{name}</span>
        <span className="text-[10px] font-medium uppercase tracking-wide text-gray-400 border border-gray-200 rounded px-1 py-px">
          Owner
        </span>
      </div>
      <div className="flex items-center gap-3">
        <MessagePersonButton uid={owner.uid} name={name} />
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
    </div>
  );
}
