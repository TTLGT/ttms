'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Truck } from 'lucide-react';
import { loadOrderCard, orderRefsIn, type OrderCardData } from '@/lib/orderCards';
import { useDateFormatters } from '@/lib/useDateFormatters';
import StatusBadge from '@/components/orders/StatusBadge';
import type { OrderStatus } from '@/types/order';

/**
 * The loads a message mentions, drawn under it.
 *
 * A number in a message is a number and a link is a line of blue text; a card
 * is the answer to what everyone asks next — where is it going, who has it,
 * what state is it in. Slack cannot do this without an integration, and doing
 * it here means none of the load data leaves the company.
 *
 * Nothing is drawn for a load the reader cannot see. The lookup returns 403
 * and this renders nothing, leaving the number or the link as the plain text it
 * was typed as — so a message can be quoted into a room of mixed access
 * without deciding for anybody what they are allowed to know. See
 * /api/orders/lookup.
 */
export default function OrderCards({ text }: { text: string }) {
  const [cards, setCards] = useState<OrderCardData[]>([]);

  // No loading state on purpose. The cards appear when they arrive; a skeleton
  // in a chat bubble would make every message about a load jump under the
  // reader's eye, and most lookups are answered from the cache in the same
  // frame the bubble mounts.
  //
  // The refs are parsed in here rather than during render so that `text` — a
  // string, and the only thing they depend on — is the whole dependency list.
  useEffect(() => {
    const refs = orderRefsIn(text);
    if (refs.length === 0) return;

    let live = true;
    void Promise.all(refs.map(loadOrderCard)).then((found) => {
      if (!live) return;

      // Waiting for all of them together, rather than showing each as it
      // lands, is what makes this possible: the same load can be named by
      // number in one breath and linked in the next, and two identical cards
      // under one message reads as a bug. There are at most three.
      const seen = new Set<string>();
      setCards(found.filter((card): card is OrderCardData => {
        if (!card || seen.has(card.id)) return false;
        seen.add(card.id);
        return true;
      }));
    });

    return () => { live = false; };
  }, [text]);

  if (cards.length === 0) return null;

  return (
    <div className="mt-1.5 space-y-1.5">
      {cards.map((card) => <OrderCard key={card.id} card={card} />)}
    </div>
  );
}

function OrderCard({ card }: { card: OrderCardData }) {
  const { formatDate } = useDateFormatters();

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

      {(card.origin || card.destination) && (
        <p className="mt-1 flex items-center gap-1 truncate text-[11px] text-gray-600">
          {card.origin}
          {card.origin && card.destination && (
            <ArrowRight size={10} className="flex-shrink-0 text-gray-400" />
          )}
          {card.destination}
        </p>
      )}

      <p className="truncate text-[11px] text-gray-500">
        {[
          card.clientName,
          card.carrierName || 'No carrier yet',
          // Through the company date format like every date in TTMS — see
          // dateFormat.ts. A card that wrote its own would be the one screen
          // that ignores Settings → Date Format.
          card.pickupAt ? `Pickup ${formatDate(new Date(card.pickupAt))}` : '',
        ].filter(Boolean).join(' · ')}
      </p>
    </Link>
  );
}
