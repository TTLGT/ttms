import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, adminDb, AdminAuthError, requireAdmin } from '@/lib/firebase-admin';

const COL = 'workGroups';

/**
 * Updates a group's name, notes or membership.
 *
 * Membership changes diff old against new and touch only the profiles that
 * actually changed, so re-saving a large group does not rewrite every member.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ groupId: string }> },
) {
  try {
    const { groupId } = await params;
    await requireAdmin(req);
    const body = await req.json().catch(() => ({}));

    const ref  = adminDb.collection(COL).doc(groupId);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: 'Group not found' }, { status: 404 });

    const before: string[] = snap.data()!.memberUids ?? [];
    const after: string[] = Array.isArray(body.memberUids)
      ? uniqueUids(body.memberUids)
      : before;

    const added   = after.filter((u) => !before.includes(u));
    const removed = before.filter((u) => !after.includes(u));

    const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
    if (typeof body.name === 'string' && body.name.trim()) patch.name = body.name.trim();
    if (typeof body.notes === 'string') patch.notes = body.notes.trim();
    if (Array.isArray(body.memberUids)) patch.memberUids = after;
    // Members who have not signed in yet have no uid and no profile to mirror
    // onto, so they are simply stored. /api/auth/session moves them across on
    // their first sign-in.
    if (Array.isArray(body.memberEmails)) patch.memberEmails = uniqueEmails(body.memberEmails);

    await adminDb.runTransaction(async (tx) => {
      tx.update(ref, patch);
      for (const uid of added) {
        tx.set(adminDb.collection('users').doc(uid),
          { groupIds: FieldValue.arrayUnion(groupId) }, { merge: true });
      }
      for (const uid of removed) {
        tx.set(adminDb.collection('users').doc(uid),
          { groupIds: FieldValue.arrayRemove(groupId) }, { merge: true });
      }
    });

    return NextResponse.json({ id: groupId, added: added.length, removed: removed.length });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}

/**
 * Deletes a group, first detaching it from every profile and party that
 * references it. Leaving dangling ids behind would silently strand records as
 * owned-by-nobody-visible.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ groupId: string }> },
) {
  try {
    const { groupId } = await params;
    await requireAdmin(req);

    const ref  = adminDb.collection(COL).doc(groupId);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: 'Group not found' }, { status: 404 });

    // Orders are group-owned too, and in two ways: directly, and through the
    // mirror of their client's owners. All three have to be detached or the
    // records would keep pointing at a group that no longer exists, which
    // reads as owned-by-nobody-visible rather than as unowned.
    const [owned, ownedOrders, mirroredOrders] = await Promise.all([
      adminDb.collection('parties').where('assignedToGroupIds', 'array-contains', groupId).get(),
      adminDb.collection('orders').where('assignedToGroupIds', 'array-contains', groupId).get(),
      adminDb.collection('orders').where('clientOwnerGroupIds', 'array-contains', groupId).get(),
    ]);

    const members: string[] = snap.data()!.memberUids ?? [];
    const batch = adminDb.batch();
    for (const uid of members) {
      batch.set(adminDb.collection('users').doc(uid),
        { groupIds: FieldValue.arrayRemove(groupId) }, { merge: true });
    }
    for (const d of owned.docs) {
      batch.update(d.ref, {
        assignedToGroupIds: FieldValue.arrayRemove(groupId),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    for (const d of ownedOrders.docs) {
      batch.update(d.ref, {
        assignedToGroupIds: FieldValue.arrayRemove(groupId),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    for (const d of mirroredOrders.docs) {
      batch.update(d.ref, {
        clientOwnerGroupIds: FieldValue.arrayRemove(groupId),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    batch.delete(ref);
    await batch.commit();

    return NextResponse.json({
      deleted: groupId,
      detachedParties: owned.size,
      detachedOrders: ownedOrders.size + mirroredOrders.size,
    });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}

/** Normalizes a JSON array of member ids into a deduplicated string list. */
function uniqueUids(raw: unknown): string[] {
  const list = Array.isArray(raw) ? (raw as unknown[]) : [];
  return Array.from(new Set(list.map((u) => String(u)).filter(Boolean)));
}

/** The same, lowercased — pending members are keyed by their allowlist email. */
function uniqueEmails(raw: unknown): string[] {
  const list = Array.isArray(raw) ? (raw as unknown[]) : [];
  return Array.from(new Set(list.map((u) => String(u).trim().toLowerCase()).filter(Boolean)));
}
