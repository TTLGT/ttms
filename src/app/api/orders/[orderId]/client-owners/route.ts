import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { AdminAuthError, adminDb } from '@/lib/firebase-admin';
import { requireCaller } from '@/lib/partyAccess';
import { getVisibleOrder } from '@/lib/orderAccess';

type RouteContext = { params: Promise<{ orderId: string }> };

/**
 * Recompute this order's mirror of its client's owners.
 *
 * Owning a client grants access to all of its orders, and rules cannot query
 * for that, so each order carries a copy of its client's owners. Moving an
 * order to a different client therefore invalidates the copy — and the rules
 * deliberately forbid the browser from writing those fields, since they decide
 * who can see the record. So the edit form calls this immediately after
 * changing the client.
 *
 * Guarded on being able to see the order, not on the ownership role: this
 * corrects a mirror to match data that already exists rather than deciding
 * anything. Anyone allowed to edit the order is allowed to keep it consistent.
 */
export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    const { orderId } = await params;
    const caller = await requireCaller(req);
    const order  = await getVisibleOrder(caller, orderId);

    const clientId = (order.clientId as string) ?? '';
    let clientOwnerUids: string[] = [];
    let clientOwnerGroupIds: string[] = [];

    if (clientId) {
      const party = await adminDb.collection('parties').doc(clientId).get();
      const d = party.data();
      if (d) {
        clientOwnerUids     = (d.assignedToUids ?? []) as string[];
        clientOwnerGroupIds = (d.assignedToGroupIds ?? []) as string[];
      }
    }

    await adminDb.collection('orders').doc(orderId).update({
      clientOwnerUids,
      clientOwnerGroupIds,
      updatedAt: Timestamp.now(),
    });

    return NextResponse.json({ clientOwnerUids, clientOwnerGroupIds });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
