'use client';

import Link from 'next/link';
import { orderDisplayNumber } from '@/types/order';
import type { Order } from '@/types/order';

/**
 * An order's number on a record that refers to it, linked to the load.
 *
 * The number is the thing people reach for first — it is how a load is named
 * on the phone and in an email — so it should be the thing that opens it,
 * rather than a "View" link parked at the far right of a wide table that has
 * to be scrolled to. The row keeps that link as well; this is a second way in,
 * not a replacement.
 *
 * Styled like every other order number in the app (mono, brand) so a reader
 * recognises it as one across screens.
 *
 * Deliberately not gated on canSeeOrder(): the lists that use this are already
 * built from listOrders(), which is the choke point that applies it, so an
 * order the reader cannot open never appears here in the first place.
 */
export default function OrderLink({ order }: { order: Order }) {
  return (
    <Link
      href={`/dashboard/orders/${order.id}`}
      className="font-mono font-medium text-brand-700 hover:underline"
    >
      {orderDisplayNumber(order)}
    </Link>
  );
}
