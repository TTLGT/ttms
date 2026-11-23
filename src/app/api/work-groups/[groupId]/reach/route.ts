import { NextRequest, NextResponse } from 'next/server';
import { adminDb, AdminAuthError, requirePermission } from '@/lib/firebase-admin';

/**
 * How much a work group shares: the clients, shippers and consignees it owns,
 * and the loads it owns directly or through its clients.
 *
 * For the preview on Settings → Work groups — "Luis will now see 14 clients
 * and 32 loads" — so an admin knows what joining a group hands over before
 * pressing Save. Counts only, never a record: the same people may already
 * read every one of them, and a count says nothing a list would not.
 *
 * Three aggregation queries, each billed as one read per thousand documents
 * counted, run only when somebody opens a group on that page — never on the
 * Settings home. Each is a single array-contains filter, which Firestore
 * serves without a composite index.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ groupId: string }> },
) {
  try {
    await requirePermission(req, 'settings.manage');
  } catch (e) {
    if (e instanceof AdminAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { groupId } = await params;
  const [parties, ownedOrders, clientOrders] = await Promise.all([
    adminDb.collection('parties').where('assignedToGroupIds', 'array-contains', groupId).count().get(),
    adminDb.collection('orders').where('assignedToGroupIds', 'array-contains', groupId).count().get(),
    adminDb.collection('orders').where('clientOwnerGroupIds', 'array-contains', groupId).count().get(),
  ]);

  return NextResponse.json({
    parties: parties.data().count,
    // A load can be the group's both ways, so this is an upper bound — the
    // page says "up to" rather than counting it twice and pretending.
    ordersUpTo: ownedOrders.data().count + clientOrders.data().count,
  });
}
