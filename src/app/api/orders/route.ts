import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthError } from '@/lib/firebase-admin';
import { requireCaller } from '@/lib/partyAccess';
import {
  listVisibleOrders,
  listVisibleOrdersPage,
  countVisibleOrdersByStatus,
  DOCUMENT_FIELDS,
  type DocumentField,
  type OrderQuery,
} from '@/lib/orderAccess';
import { resolveOwnerFilter } from '@/lib/ownerFilter';
import { ORDER_STATUSES } from '@/types/order';

/**
 * Every order the caller may see, a page at a time.
 *
 * Orders used to be read straight from Firestore by the browser, which worked
 * only because the rules let every signed-in user read the whole collection.
 * Now that they are owned records the filtering has to happen server-side —
 * a client-SDK query over `orders` cannot express "mine, my groups', or my
 * clients'" in a form the rules can approve.
 *
 * It also used to answer with the entire collection every time, which on ten
 * thousand orders meant a seventeen-second query and twelve megabytes on the
 * wire before the browser had drawn anything. Callers now say how much they
 * want:
 *
 *   ?limit=50&fields=list   one page, trimmed to the columns a list renders
 *   ?cursor=…               the next page, from the previous response's cursor
 *   ?status=booked          one status
 *   ?search=morris          orders findable by that text — see orderSearchTerms
 *   ?carrierId= / ?clientId= / ?parentOrderId=   the orders belonging to one record
 *   ?owner=maria@…          the loads one colleague holds
 *   ?counts=1               orders per status, instead of the orders themselves
 *
 * `owner` is an **email**, because that is how the directory names a person and
 * the only identifier a colleague who has never signed in has. It is resolved
 * to a uid here rather than accepted as one — see lib/ownerFilter.ts. The
 * filter needs no permission of its own: it narrows the caller's own visible
 * set, so every row it returns is one they were already entitled to, and an
 * address that belongs to nobody answers 404 rather than quietly widening back
 * to the unfiltered list.
 *
 * With no `limit` it still returns everything, because analytics genuinely
 * aggregates over the whole set. Nothing that merely lists orders should.
 */
export async function GET(req: NextRequest) {
  try {
    const caller = await requireCaller(req);
    const p = req.nextUrl.searchParams;

    // Resolved before anything else reads it, so a bad address fails the same
    // way for the counts and for the list rather than in one of the two.
    const ownerEmail = (p.get('owner') ?? '').trim();
    const owner = ownerEmail ? await resolveOwnerFilter(ownerEmail) : null;
    if (ownerEmail && !owner) {
      return NextResponse.json({ error: 'No such person' }, { status: 404 });
    }

    if (p.get('counts')) {
      const counts = await countVisibleOrdersByStatus(caller, ORDER_STATUSES, owner);
      return NextResponse.json({ counts });
    }

    // Capped rather than trusted. A caller asking for a million rows would be
    // asking the server to hold the whole collection in memory to answer.
    const rawLimit = Number(p.get('limit'));
    const limit = Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(Math.floor(rawLimit), 500)
      : undefined;

    const query: OrderQuery = {
      limit,
      cursor:        p.get('cursor'),
      status:        p.get('status')    ?? undefined,
      search:        p.get('search')    ?? undefined,
      carrierId:     p.get('carrierId') ?? undefined,
      clientId:      p.get('clientId')     ?? undefined,
      shipperId:     p.get('shipperId')    ?? undefined,
      consigneeId:   p.get('consigneeId')  ?? undefined,
      // Validated against the known list rather than passed through: this
      // becomes a field name in a query, and an arbitrary one from the client
      // would let a caller probe fields the projection deliberately withholds.
      hasDocument:   DOCUMENT_FIELDS.includes(p.get('hasDocument') as DocumentField)
        ? (p.get('hasDocument') as DocumentField)
        : undefined,
      // Distinguished from absent on purpose: `?parentOrderId=` with no value
      // means "top-level orders only", which is not the same as not asking.
      parentOrderId: p.has('parentOrderId') ? (p.get('parentOrderId') ?? '') : undefined,
      pickupFrom:    Number(p.get('pickupFrom')) > 0 ? Number(p.get('pickupFrom')) : undefined,
      fields:        (['list', 'analytics'] as const).find((f) => f === p.get('fields')) ?? 'full',
      owner,
    };

    if (!limit) {
      const orders = await listVisibleOrders(caller, query);
      return NextResponse.json({ orders, cursor: null });
    }

    const page = await listVisibleOrdersPage(caller, query);
    return NextResponse.json(page);
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
