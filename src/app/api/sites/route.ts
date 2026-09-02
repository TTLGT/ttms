import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, adminDb, AdminAuthError, requirePermission } from '@/lib/firebase-admin';
import { requireCaller } from '@/lib/partyAccess';

const COL = 'sites';

/** Every site. Readable by any signed-in user so pickers can render names. */
export async function GET(req: NextRequest) {
  try {
    await requireCaller(req);
    const snap = await adminDb.collection(COL).orderBy('name').get();
    return NextResponse.json({
      sites: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
    });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}

/** Creates a site. Names are unique so the picker can never show two alike. */
export async function POST(req: NextRequest) {
  try {
    const caller = await requirePermission(req, 'settings.manage');
    const body = await req.json().catch(() => ({}));

    const name = String(body.name ?? '').trim();
    if (!name) return NextResponse.json({ error: 'A site name is required.' }, { status: 400 });

    const existing = await adminDb.collection(COL).where('name', '==', name).limit(1).get();
    if (!existing.empty) {
      return NextResponse.json({ error: 'A site with that name already exists.' }, { status: 409 });
    }

    const ref = adminDb.collection(COL).doc();
    await ref.set({
      name,
      address:   String(body.address ?? '').trim(),
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
