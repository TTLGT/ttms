import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthError } from '@/lib/firebase-admin';
import { formatLongDateRange } from '@/lib/dateFormat';
import { requireCaller } from '@/lib/partyAccess';
import { getVisibleOrder } from '@/lib/orderAccess';
import { generateQuoteBuffer } from '@/lib/quote-pdf';
import { clientContactOf, readinessFactsFor } from '@/lib/orderReadinessServer';
import {
  formatDimensions, itemWeightLb, orderCommodityItems, orderDeliveries, orderDisplayNumber, orderPickups,
  type Order, type OrderStop,
} from '@/types/order';
import { orderReadiness, readinessOf } from '@/types/orderReadiness';

type RouteContext = { params: Promise<{ orderId: string }> };

// One PDF render. Comfortably inside the default; the headroom is a cold start.
export const maxDuration = 30;

/**
 * The quote PDF for an order, built on the spot and handed straight back.
 *
 * Not stored, unlike the BOL: a quote changes every time the broker touches the
 * price, and a stored copy would be out of date the moment it was saved. It is
 * the order as it stands, which is what a broker on the phone wants to send.
 *
 * Same boundary as the order — anybody who can open the load can produce its
 * quote. It carries the client's price and nothing of ours (no carrier pay, no
 * fee), so it is safe for the load's owner to hand out.
 */
export async function GET(req: NextRequest, { params }: RouteContext) {
  const { orderId } = await params;
  try {
    const caller = await requireCaller(req);
    const order = (await getVisibleOrder(caller, orderId)) as Partial<Order> & Record<string, unknown>;

    const [contact, facts] = await Promise.all([clientContactOf(order.clientId), readinessFactsFor(order)]);
    const sa = readinessOf(orderReadiness(order, facts), 'sa');

    const stop = (st: OrderStop) => ({
      place: [st.address?.city, st.address?.state, st.address?.zip].filter(Boolean).join(', '),
      date: formatLongDateRange(st.date, st.dateEnd, ''),
    });
    const items = orderCommodityItems(order);
    const weight = Number(order.weight) || 0;

    const buffer = await generateQuoteBuffer({
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
      items: items.map((it) => ({
        description: it.description,
        quantity: it.quantity ? String(it.quantity) : '',
        dimensions: formatDimensions(it),
        weight: itemWeightLb(it) ? `${Math.round(itemWeightLb(it)).toLocaleString('en-US')} lbs` : '',
      })),
      totalWeight: weight ? `${Math.round(weight).toLocaleString('en-US')} lbs` : '',
      price: Number(order.agreedRate) || 0,
      notes: String(order.notes ?? ''),
      preparedBy: caller.displayName,
      preparedByEmail: caller.email ?? '',
      // Only what the client can supply. An email address on our client record
      // is ours to fix, not theirs, so it is left off the client's copy.
      stillNeeded: sa.missing.filter((i) => i.key !== 'clientEmail' && i.key !== 'client' && i.key !== 'agreedRate').map((i) => i.label),
    });

    const name = `Quote ${orderDisplayNumber(order as { orderNumber?: string; batsId?: string })}.pdf`;
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${name.replace(/"/g, '')}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (e) {
    if (e instanceof AdminAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
