import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, adminDb, AdminAuthError } from '@/lib/firebase-admin';
import { requireCaller, findApproval } from '@/lib/partyAccess';
import { canSeeParty } from '@/lib/accessControl';
import { PARTY_ROLES } from '@/types/party';
import type { PartyRole } from '@/types/party';

/**
 * Spends an approval on an order and records who authorized it.
 *
 * The approval snapshot is written here with the Admin SDK rather than by the
 * browser, so the order's proof of authorization cannot be fabricated by the
 * person who benefits from it. The request is marked `expired` in the same
 * transaction — approval is per-order and single-use, so reusing the party on a
 * second order means asking again.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  try {
    const { orderId } = await params;
    const caller = await requireCaller(req);
    const body   = await req.json().catch(() => ({}));

    const partyId = String(body.partyId ?? '').trim();
    const role    = String(body.role ?? '') as PartyRole;
    if (!partyId)                    return bad('partyId is required');
    if (!PARTY_ROLES.includes(role)) return bad('a valid role is required');

    const orderRef  = adminDb.collection('orders').doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) return bad('Order not found', 404);

    const partySnap = await adminDb.collection('parties').doc(partyId).get();
    if (!partySnap.exists) return bad('Party not found', 404);
    const party = partySnap.data()!;

    // Owners and privileged roles need no approval — nothing to record.
    if (canSeeParty(party, caller.uid, caller.profile)) {
      return NextResponse.json({ recorded: false, reason: 'no approval needed' });
    }

    const approval = await findApproval(caller.uid, partyId);
    if (!approval) {
      return NextResponse.json(
        { error: 'You do not have an approved request for this record.' },
        { status: 403 },
      );
    }
    const a = approval.data();

    await adminDb.runTransaction(async (tx) => {
      tx.update(orderRef, {
        partyApprovals: FieldValue.arrayUnion({
          partyId,
          partyName:       party.companyName || party.contactName || '',
          role,
          requestId:       approval.id,
          approvedByUid:   a.decidedByUid  ?? '',
          approvedByName:  a.decidedByName ?? '',
          approvedByIp:    a.decidedByIp   ?? '',
          approvedAt:      a.decidedAt     ?? null,
          approvedByAdmin: a.decidedByAdmin === true,
        }),
        updatedAt: FieldValue.serverTimestamp(),
      });
      tx.update(approval.ref, {
        status:            'expired',
        consumedByOrderId: orderId,
        consumedAt:        FieldValue.serverTimestamp(),
        updatedAt:         FieldValue.serverTimestamp(),
      });
    });

    return NextResponse.json({ recorded: true });
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
