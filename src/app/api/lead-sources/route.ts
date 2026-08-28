import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, adminDb, AdminAuthError, requireAdmin } from '@/lib/firebase-admin';
import { requireCaller } from '@/lib/partyAccess';
import { leadSourceDocId, toSourceKey } from '@/types/leadSource';

const COL = 'leadSources';

/**
 * Every lead source, active and retired.
 *
 * Readable by any signed-in user: the list grants nothing, and a record that
 * carries a retired source still has to be able to render its name. Callers
 * filter on `isActive` when building a picker.
 */
export async function GET(req: NextRequest) {
  try {
    await requireCaller(req);
    const snap = await adminDb.collection(COL).orderBy('name').get();
    return NextResponse.json({
      leadSources: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
    });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}

/**
 * Creates a lead source.
 *
 * The document id is derived from the normalized name, so two admins adding
 * "Google Ads" and "google ads" collide on the same document instead of
 * producing two entries that report separately — which is the exact failure a
 * managed list exists to prevent.
 */
export async function POST(req: NextRequest) {
  try {
    const caller = await requireAdmin(req);
    const body   = await req.json().catch(() => ({}));

    const name = String(body.name ?? '').trim();
    if (!name) return NextResponse.json({ error: 'A source name is required.' }, { status: 400 });

    const nameKey = toSourceKey(name);
    if (!nameKey) {
      return NextResponse.json({ error: 'That name has no letters or numbers in it.' }, { status: 400 });
    }

    const ref  = adminDb.collection(COL).doc(leadSourceDocId(nameKey));
    const snap = await ref.get();
    if (snap.exists) {
      return NextResponse.json(
        { error: `"${snap.get('name')}" is already on the list.` },
        { status: 409 },
      );
    }

    await ref.set({
      name,
      nameKey,
      isActive:  true,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: caller.email ?? caller.uid,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ id: ref.id, name }, { status: 201 });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
