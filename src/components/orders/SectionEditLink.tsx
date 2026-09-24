import Link from 'next/link';
import { Pencil } from 'lucide-react';

/**
 * The parts of an order that can be edited on their own, from a button on the
 * matching card of the order page rather than the one Edit at the top.
 *
 * The id is three things at once: the `?section=` the edit screen reads, the
 * element id of the card on the order page, and the `#` it returns to after a
 * save — so the reader lands back on the card they started from.
 */
export const ORDER_SECTIONS = ['general', 'freight', 'price', 'route', 'notes'] as const;
export type OrderSection = (typeof ORDER_SECTIONS)[number];

export const ORDER_SECTION_LABEL: Record<OrderSection, string> = {
  general: 'General',
  freight: 'Freight',
  price:   'Price and Terms',
  route:   'Route',
  notes:   'Notes',
};

export function isOrderSection(v: string | null): v is OrderSection {
  return (ORDER_SECTIONS as readonly string[]).includes(v ?? '');
}

export default function SectionEditLink({ orderId, section }: { orderId: string; section: OrderSection }) {
  return (
    <Link href={`/dashboard/orders/${orderId}/edit?section=${section}`}
      title={`Edit ${ORDER_SECTION_LABEL[section]}`}
      className="inline-flex items-center gap-1 px-2 py-1 -my-1 text-xs font-medium text-gray-500 rounded-md hover:text-brand-700 hover:bg-gray-100 transition">
      <Pencil className="w-3.5 h-3.5" /> Edit
    </Link>
  );
}
