'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Truck } from 'lucide-react';
import { loadOrderCard, orderNumbersIn, type OrderCardData } from '@/lib/orderCards';
import { useDateFormatters } from '@/lib/useDateFormatters';
import StatusBadge from '@/components/orders/StatusBadge';
import type { OrderStatus } from '@/types/order';

/**
 * The loads a message mentions, drawn under it.
 *
 * A number in a message is a number; a card is the answer to what everyone
 * asks next — where is it going, who has it, what state is it in. Slack cannot
 * do this without an integration, and doing it here means none of the load
 * data leaves the company.
 *
 * Nothing is drawn for a load the reader cannot see. The lookup returns 403
 * and this renders null, leaving the number as the plain text it was typed as
 * — so a message can be quoted into a room of mixed access without deciding
 * for anybody what they are allowed to know. See /api/orders/lookup.
 */
export default function OrderCards({ text }: { text: string }) {
  const numbers = orderNumbersIn(text);
  if (numbers.length === 0) return null;

  return (
    <div className="mt-1.5 space-y-1.5">
      {numbers.map((number) => <OrderCard key={number} number={number} />)}
    </div>
  );
}

function OrderCard({ number }: { number: string }) {
  const { formatDate } = useDateFormatters();
  const [card, setCard] = useState<OrderCardData | null>(null);

  // No loading state on purpose. The card appears when it arrives; a skeleton
  // in a chat bubble would make every message about a load jump under the
  // reader's eye, and most lookups are answered from the cache in the same
  // frame the bubble mounts.
  useEffect(() => {
    let live = true;
    void loadOrderCard(number).then((found) => { if (live) setCard(found); });
    return () => { live = false; };
  }, [number]);

  if (!card) return null;

  const lane = [card.origin, card.destination].filter(Boolean).join(' → ');

  return (
    <Link
      href={`/dashboard/orders/${card.id}`}
      className="block rounded-lg border border-gray-300 bg-white/70 px-2.5 py-2 transition hover:border-brand-300 hover:bg-white"
    >
      <div className="flex items-center gap-1.5">
        <Truck size={12} className="flex-shrink-0 text-gray-400" />
        <span className="truncate font-mono text-xs font-semibold text-gray-900">{card.number}</span>
        {card.status && <StatusBadge status={card.status as OrderStatus} />}
      </div>

      {lane && (
        <p className="mt-1 flex items-center gap-1 truncate text-[11px] text-gray-600">
          {card.origin}
          <ArrowRight size={10} className="flex-shrink-0 text-gray-400" />
          {card.destination}
        </p>
      )}

      <p className="truncate text-[11px] text-gray-500">
        {[
          card.clientName,
          card.carrierName || 'No carrier yet',
          // Through the company date format like every date in TTMS — see
          // dateFormat.ts. A card that wrote its own would be the one screen
          // that ignores the setting.
          card.pickupAt ? `Pickup ${formatDate(new Date(card.pickupAt))}` : '',
        ].filter(Boolean).join(' · ')}
      </p>
    </Link>
  );
}
