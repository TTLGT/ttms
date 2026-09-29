import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthError, FieldValue, adminDb, requireCompanyUser } from '@/lib/firebase-admin';
import { taskItems } from '@/lib/personalTasksServer';

/**
 * Renumbers a column, or the sticky notes, in the order given.
 *
 * Only needed when a drag has no room left between two neighbours — see
 * orderBetween() in src/types/task.ts. Every other move is a single PATCH.
 *
 * `update`, not `set`: an id that is not on the caller's own list fails the
 * batch rather than creating an empty task under their uid.
 */
const MAX_REORDER = 500;

export async function POST(req: NextRequest) {
  try {
    const { uid } = await requireCompanyUser(req);
    const body = await req.json().catch(() => ({}));
    const ids = Array.isArray(body?.ids)
      ? (body.ids as unknown[]).filter((v): v is string => typeof v === 'string' && v.length > 0 && v.length < 200)
      : [];

    if (ids.length === 0 || ids.length > MAX_REORDER || new Set(ids).size !== ids.length) {
      return NextResponse.json({ error: 'Nothing to reorder.' }, { status: 400 });
    }

    const batch = adminDb.batch();
    ids.forEach((id, i) => {
      batch.update(taskItems(uid).doc(id), { order: (i + 1) * 1000, updatedAt: FieldValue.serverTimestamp() });
    });

    try {
      await batch.commit();
    } catch {
      return NextResponse.json({ error: 'Some of those items no longer exist. Reload the page.' }, { status: 404 });
    }
    return NextResponse.json({ reordered: ids.length });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
