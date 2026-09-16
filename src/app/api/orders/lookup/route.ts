import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthError } from '@/lib/firebase-admin';
import { requireCaller } from '@/lib/partyAccess';
import { readOrder, readOrderByNumber } from '@/lib/orderAccess';
import { orderDisplayNumber } from '@/types/order';

/**
 * One order, found by the number people say out loud or by the id in a link to
 * it, trimmed to what a card in a chat message shows.
 *
 * This exists for the loads that turn up in conversation — "who is on
 * TTL26000042", or the address bar pasted straight out of the order somebody
 * was already looking at — and it answers with a handful of fields rather than
 * the order itself. That is deliberate: a card is a summary, and shipping the
 * whole document to draw four lines would put rates and margins into a
 * response that a room full of people can each ask for.
 *
 * `id` and `number` are two ways to name the same load and are checked the
 * same way: `readOrder` and `readOrderByNumber` both apply `canSeeOrder()`
 * and both honour a standing grant from an approved access request. Neither
 * is a way to see a load the caller could not open by walking to it.
 *
 * 403 when the caller cannot see the load. The chat side draws nothing at all
 * in that case, leaving the number as the plain text it was typed as — which
 * is the honest outcome: the message is still readable, and the card was never
 * part of what was said.
 *
 * Guarded like every other route here; there is no middleware backstop.
 */
export async function GET(req: NextRequest) {
  try {
    const caller = await requireCaller(req);
    const number = (req.nextUrl.searchParams.get('number') ?? '').trim();
    const id     = (req.nextUrl.searchParams.get('id') ?? '').trim();
    if (!number && !id) {
      return NextResponse.json({ error: 'Which order?' }, { status: 400 });
    }

    // The id wins when both are given. It names one document, where a number
    // is a query — there is nothing to gain by preferring the looser of the two.
    const access = id
      ? await readOrder(caller, id)
      : await readOrderByNumber(caller, number);
    if (access.status === 'missing') {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }
    if (access.status === 'denied') {
      return NextResponse.json({ error: 'You do not have access to this order' }, { status: 403 });
    }

    const o = access.order as Record<string, string | number | null | undefined> & {
      origin?: { city?: string; state?: string };
      destination?: { city?: string; state?: string };
      pickupDate?: { toMillis?: () => number } | null;
    };

    return NextResponse.json({
      card: {
        id:           String(o.id ?? ''),
        number:       orderDisplayNumber(o as { orderNumber?: string; batsId?: string }),
        status:       String(o.status ?? ''),
        clientName:   String(o.clientName ?? ''),
        carrierName:  String(o.carrierName ?? ''),
        commodity:    String(o.commodity ?? ''),
        origin:       place(o.origin),
        destination:  place(o.destination),
        // Millis rather than a formatted string: how a date is written is a
        // company setting, and a server that formatted it here would be the
        // one screen in TTMS that ignores Settings → Date Format.
        pickupAt:     typeof o.pickupDate?.toMillis === 'function' ? o.pickupDate.toMillis() : null,
      },
    });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}

/** "Laredo, TX" — the two parts of an address a lane is read by. */
function place(address: { city?: string; state?: string } | undefined): string {
  if (!address) return '';
  return [address.city, address.state].filter(Boolean).join(', ');
}
