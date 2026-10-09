import { formatLongDateRange } from '@/lib/dateFormat';
import { clientContactOf, readinessFactsFor } from '@/lib/orderReadinessServer';
import type { QuoteData } from '@/lib/quote-pdf';
import { confirmationFreight } from '@/lib/loadConfirmationServer';
import {
  orderDeliveries, orderDisplayNumber, orderPickups,
  type Order, type OrderStop,
} from '@/types/order';
import { orderReadiness, readinessOf } from '@/types/orderReadiness';

/**
 * What the quote PDF says about an order, worked out once for both places it
 * is made: the Quote button (`GET /api/orders/{id}/quote-pdf`) and the copy
 * attached to the load confirmation email. One definition, so the PDF a broker
 * downloads and the one the client receives cannot drift apart.
 *
 * Callers have already decided the caller may see the order.
 */
export async function buildQuoteData(
  order: Partial<Order> & Record<string, unknown>,
  preparedBy: { name: string; email: string },
): Promise<QuoteData> {
  const [contact, facts] = await Promise.all([clientContactOf(order.clientId), readinessFactsFor(order)]);
  const sa = readinessOf(orderReadiness(order, facts), 'sa');

  const stop = (st: OrderStop) => ({
    place: [st.address?.city, st.address?.state, st.address?.zip].filter(Boolean).join(', '),
    date: formatLongDateRange(st.date, st.dateEnd, ''),
  });
  const weight = Number(order.weight) || 0;

  return {
    orderNumber: orderDisplayNumber(order as { orderNumber?: string; batsId?: string }),
    issuedOn: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Guatemala' }),
    clientName: String(order.clientName || contact?.companyName || ''),
    contactName: contact?.name ?? '',
    pickups: orderPickups(order).filter((p) => p.address?.city || p.address?.zip).map(stop),
    deliveries: orderDeliveries(order).filter((p) => p.address?.city || p.address?.zip).map(stop),
    miles: order.laneMiles
      ? `${Math.round(Number(order.laneMiles)).toLocaleString('en-US')} miles${order.laneMilesSource === 'estimate' ? ' (estimated)' : ''}`
      : '',
    equipment: String(order.transportType ?? ''),
    items: confirmationFreight(order),
    totalWeight: weight ? `${Math.round(weight).toLocaleString('en-US')} lbs` : '',
    price: Number(order.agreedRate) || 0,
    notes: String(order.notes ?? ''),
    preparedBy: preparedBy.name,
    preparedByEmail: preparedBy.email,
    // Only what the client can supply. An email address on our client record
    // is ours to fix, not theirs, so it is left off the client's copy.
    stillNeeded: sa.missing.filter((i) => i.key !== 'clientEmail' && i.key !== 'client' && i.key !== 'agreedRate').map((i) => i.label),
  };
}
