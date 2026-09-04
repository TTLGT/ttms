import { NextRequest, NextResponse } from 'next/server';
import { adminDb, requirePermission, AdminAuthError, FieldValue } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { postOrderAlert, signatureWaivedAlert } from '@/lib/chatAlerts';

type RouteContext = { params: Promise<{ orderId: string }> };

/** Enough to say why without turning the box into a notes field. */
const MAX_REASON = 500;

/**
 * Dispatch a load without waiting for the client to sign.
 *
 * The carrier agreement is blocked until the client has signed the load
 * confirmation, because a rate confirmation commits us to paying a carrier for
 * freight nobody has yet agreed to pay us for. This is the one way past that,
 * and it is a route rather than a field on the order for two reasons.
 *
 * The first is that `orders.waiveSignature` is a narrower permission than
 * editing an order — admin and dispatch hold it, everybody else is given it one
 * person at a time — and the security rules cannot express "this field, but
 * only for these people". So the rules refuse the waiver fields from the client
 * outright and the check lives here, where it can be made properly.
 *
 * The second is that a waiver is a commercial risk taken deliberately, and who
 * took it is the part worth keeping. It is recorded, never cleared, and said in
 * the load's room. It is emphatically not a signature: `shipperSignedAt` stays
 * null, and the client can still be sent the confirmation and sign it after.
 */
export async function POST(req: NextRequest, { params }: RouteContext) {
  let caller: { uid: string; email: string | undefined };
  try {
    caller = await requirePermission(req, 'orders.waiveSignature');
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }

  const { orderId } = await params;

  const body = (await req.json().catch(() => ({}))) as { reason?: string };
  const reason = (body.reason ?? '').trim().slice(0, MAX_REASON);

  const orderRef  = adminDb.collection('orders').doc(orderId);
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }
  const order = orderSnap.data()!;

  // Nothing to waive, and saying so is better than recording a decision that
  // changed nothing — the point of the record is that it explains an unsigned
  // load, and one attached to a signed load only muddies the history.
  if (order.shipperSignedAt) {
    return NextResponse.json(
      { error: 'The client has already signed this load confirmation' },
      { status: 409 },
    );
  }
  if (order.signatureWaivedAt) {
    return NextResponse.json(
      { error: 'This load has already been dispatched without a signature' },
      { status: 409 },
    );
  }

  // The name as colleagues know it, off the caller's own profile — the room
  // needs a person, and the uid alone would make the audit trail unreadable.
  const profile   = await adminDb.collection('users').doc(caller.uid).get();
  const byName    =
    (profile.data()?.displayName as string | undefined)?.trim() ||
    caller.email ||
    'Someone';
  const waivedAt  = Timestamp.now();

  await orderRef.update({
    signatureWaivedAt:     waivedAt,
    signatureWaivedByUid:  caller.uid,
    signatureWaivedByName: byName,
    signatureWaivedReason: reason || null,
    // The queryable mirror. See the field's note in src/types/order.ts.
    signatureWaived:       true,
    updatedAt:             FieldValue.serverTimestamp(),
  });

  // After the write and swallowed: the decision is recorded either way, and a
  // chat room being unreachable is not a reason to fail it.
  await postOrderAlert(orderId, signatureWaivedAlert(byName, reason)).catch(() => {});

  return NextResponse.json({
    success:               true,
    signatureWaivedAt:     waivedAt.toDate().toISOString(),
    signatureWaivedByName: byName,
    signatureWaivedReason: reason || null,
  });
}
