import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthError, adminDb, requirePermission } from '@/lib/firebase-admin';
import { changeOwners, callerIp } from '@/lib/ownership';
import { requireCaller } from '@/lib/partyAccess';
import { getVisibleOrder } from '@/lib/orderAccess';
import { USERS_COLLECTION } from '@/lib/accessControl';
import { OWNER_EVENTS_SUBCOLLECTION } from '@/types/ownerEvent';

type RouteContext = { params: Promise<{ orderId: string }> };

/**
 * Who may hand an order to someone else.
 *
 * Deliberately narrower than who can *see* an order: a broker working a load
 * should not be able to quietly move it off their own book, or onto it. Admins
 * and dispatchers hold this permission by role; anybody else has to be given
 * it deliberately.
 */
async function actorFor(req: NextRequest) {
  const { uid } = await requirePermission(req, 'ownership.change');
  const profile = await adminDb.collection(USERS_COLLECTION).doc(uid).get();
  const d = profile.data();
  return { uid, name: d?.displayName || d?.email || uid, ip: callerIp(req) };
}

/** Owners named in the body, normalised into the three shapes a record holds. */
function ownersFrom(body: Record<string, unknown>) {
  const list = (v: unknown) =>
    Array.isArray(v) ? [...new Set(v.map((x) => String(x)).filter(Boolean))] : [];
  return {
    uids:     list(body.uids),
    groupIds: list(body.groupIds),
    emails:   list(body.emails).map((e) => e.toLowerCase()),
  };
}

/** The ownership history, newest first. */
export async function GET(req: NextRequest, { params }: RouteContext) {
  try {
    const { orderId } = await params;
    // Reading the history is gated the same way as reading the order itself,
    // not on the stricter role needed to change ownership — anyone who can see
    // a load may see how it came to be theirs.
    const caller = await requireCaller(req);
    await getVisibleOrder(caller, orderId);

    const snap = await adminDb
      .collection('orders').doc(orderId)
      .collection(OWNER_EVENTS_SUBCOLLECTION)
      .orderBy('at', 'desc')
      .get();

    return NextResponse.json({ events: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  return mutate(req, params, 'added');
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  return mutate(req, params, 'removed');
}

async function mutate(
  req: NextRequest,
  params: RouteContext['params'],
  action: 'added' | 'removed',
) {
  try {
    const { orderId } = await params;
    const actor  = await actorFor(req);
    const owners = ownersFrom(await req.json().catch(() => ({})));

    if (owners.uids.length + owners.groupIds.length + owners.emails.length === 0) {
      return NextResponse.json({ error: 'No owners were named.' }, { status: 400 });
    }

    const next = await changeOwners('orders', orderId, action, owners, actor);
    return NextResponse.json({ owners: next });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    if (e instanceof Error && e.message === 'Record not found') {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }
    throw e;
  }
}
