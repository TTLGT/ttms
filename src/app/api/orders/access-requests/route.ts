import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, adminDb, AdminAuthError } from '@/lib/firebase-admin';
import { requireCaller } from '@/lib/partyAccess';
import { canSeeOrder } from '@/lib/accessControl';
import { pendingForDecider } from '@/lib/accessRequests';
import { orderOwnerLabel, ownersForOrder, hasApprovedOrderAccess } from '@/lib/orderAccess';
import { orderDisplayNumber } from '@/types/order';
import { ORDER_ACCESS_REQUESTS_COLLECTION as COL, isGrantLive } from '@/types/orderAccessRequest';

/**
 * The approvals inbox for loads, alongside the one for parties.
 *
 * `box=incoming` — waiting on the caller to decide: requests against loads
 * they own, requests against loads their team owns if they are a Sales
 * Manager, and every pending request in the company for whoever holds
 * `access.decideAny`, so a request against an order whose owner has left is
 * never stuck. `box=outgoing` — the caller's own requests and their status.
 */
export async function GET(req: NextRequest) {
  try {
    const caller = await requireCaller(req);
    const box    = new URL(req.url).searchParams.get('box') ?? 'incoming';

    const docs = box === 'outgoing'
      ? (await adminDb.collection(COL).where('requestedByUid', '==', caller.uid).get()).docs
      : await pendingForDecider(COL, caller);

    const requests = docs
      .map((d) => ({ id: d.id, ...d.data() } as Record<string, unknown> & { id: string }))
      .sort((a, b) => millis(b.createdAt) - millis(a.createdAt));

    return NextResponse.json({ requests });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}

/**
 * Ask the owner of a load for permission to open it.
 *
 * Raised from the no-access panel, which is reached two ways: a colleague sent
 * a link, or the reader found a driver's licence on the Documents screen and
 * followed it to a load that is not theirs. Both arrive holding only the order
 * id, which is why an id is accepted here — and accepting one widens nothing.
 * An id has never been what grants access; the owner still has to approve.
 *
 * Approval grants a standing read of this one load, and nothing else. It is not
 * ownership: it does not put the requester in assignedToUids, so it does not
 * make them able to reassign the load or decide anybody else's request for it.
 */
export async function POST(req: NextRequest) {
  try {
    const caller  = await requireCaller(req);
    const body    = await req.json().catch(() => ({}));
    const orderId = String(body.orderId ?? '').trim();
    const reason  = String(body.reason ?? '').trim().slice(0, 500);

    if (!orderId) return bad('An order is required.');

    const snap = await adminDb.collection('orders').doc(orderId).get();
    if (!snap.exists) return bad('That load no longer exists.', 404);
    const order = snap.data()!;

    // Nothing to approve if they can already open it — by ownership or by a
    // grant they have forgotten they hold.
    if (canSeeOrder(order, caller.uid, caller.profile)
      || await hasApprovedOrderAccess(caller.uid, orderId)) {
      return NextResponse.json({ error: 'You already have access to this load.' }, { status: 409 });
    }

    // One live request per load per person, so the inbox cannot be flooded.
    // A grant that has run out does not count — asking again is exactly what
    // somebody should do when their week is up, and blocking it would leave
    // them with no way back in.
    const existing = await adminDb.collection(COL)
      .where('orderId', '==', orderId)
      .where('requestedByUid', '==', caller.uid)
      .where('status', 'in', ['pending', 'approved'])
      .get();
    const blocking = existing.docs.find((d) => {
      const r = d.data() as { status: string; expiresAt?: { toMillis?: () => number } };
      return r.status === 'pending' || isGrantLive(r);
    });
    if (blocking) {
      return NextResponse.json(
        { error: `You already have a ${blocking.data().status} request for this load.`, requestId: blocking.id },
        { status: 409 },
      );
    }

    const ref = await adminDb.collection(COL).add({
      orderId,
      // Snapshotted so the inbox can name the load without the reader needing
      // access to it — the requester still cannot see the order itself.
      orderNumber:      orderDisplayNumber(order),
      requestedByUid:   caller.uid,
      requestedByName:  caller.displayName,
      requestedByEmail: caller.email ?? '',
      reason,
      // Any member of an owning group can decide, so groups are expanded here.
      ownerUids:        await ownersForOrder(order),
      ownerName:        await orderOwnerLabel(order),
      status:           'pending',
      decidedByUid:     null,
      decidedByName:    null,
      decidedByIp:      null,
      decidedAt:        null,
      decidedByAdmin:   false,
      denyReason:       null,
      // Set when it is approved, from the duration the approver picks.
      expiresAt:        null,
      createdAt:        FieldValue.serverTimestamp(),
      updatedAt:        FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ id: ref.id, status: 'pending' }, { status: 201 });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function millis(value: unknown): number {
  const ts = value as { toMillis?: () => number } | null | undefined;
  return typeof ts?.toMillis === 'function' ? ts.toMillis() : 0;
}
