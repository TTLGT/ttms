import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, adminDb, AdminAuthError, requirePermission } from '@/lib/firebase-admin';
import { ALLOWED_USERS_COLLECTION, USERS_COLLECTION } from '@/lib/accessControl';

const COL = 'sites';

/** Renames a site or edits its address. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  try {
    const { siteId } = await params;
    await requirePermission(req, 'settings.manage');
    const body = await req.json().catch(() => ({}));

    const ref  = adminDb.collection(COL).doc(siteId);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: 'Site not found' }, { status: 404 });

    const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };

    if (typeof body.name === 'string') {
      const name = body.name.trim();
      if (!name) return NextResponse.json({ error: 'A site name is required.' }, { status: 400 });

      // Uniqueness is what makes the picker unambiguous, so it has to hold on
      // rename too — not just at creation.
      const clash = await adminDb.collection(COL).where('name', '==', name).limit(1).get();
      if (!clash.empty && clash.docs[0].id !== siteId) {
        return NextResponse.json({ error: 'A site with that name already exists.' }, { status: 409 });
      }
      patch.name = name;
    }
    if (typeof body.address === 'string') patch.address = body.address.trim();

    await ref.update(patch);
    return NextResponse.json({ id: siteId });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}

/**
 * Deletes a site, first detaching everyone assigned to it.
 *
 * Both copies of the assignment have to go: the allowlist entry is what the
 * Settings list reads, and the profile is what the rest of the app reads.
 * Leaving either behind would point at a site that no longer exists.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  try {
    const { siteId } = await params;
    await requirePermission(req, 'settings.manage');

    const ref  = adminDb.collection(COL).doc(siteId);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: 'Site not found' }, { status: 404 });

    const [entries, profiles] = await Promise.all([
      adminDb.collection(ALLOWED_USERS_COLLECTION).where('siteId', '==', siteId).get(),
      adminDb.collection(USERS_COLLECTION).where('siteId', '==', siteId).get(),
    ]);

    const batch = adminDb.batch();
    for (const doc of entries.docs) batch.update(doc.ref, { siteId: null });
    for (const doc of profiles.docs) batch.update(doc.ref, { siteId: null });
    batch.delete(ref);
    await batch.commit();

    return NextResponse.json({ deleted: siteId, detachedUsers: entries.size });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
