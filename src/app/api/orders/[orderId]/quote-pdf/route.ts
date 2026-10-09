import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthError } from '@/lib/firebase-admin';
import { requireCaller } from '@/lib/partyAccess';
import { getVisibleOrder } from '@/lib/orderAccess';
import { generateQuoteBuffer } from '@/lib/quote-pdf';
import { buildQuoteData } from '@/lib/quoteData';
import { orderDisplayNumber, type Order } from '@/types/order';

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

    const buffer = await generateQuoteBuffer(
      await buildQuoteData(order, { name: caller.displayName, email: caller.email ?? '' }),
    );

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
