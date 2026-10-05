import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthError, FieldValue, adminDb, requireCompanyUser } from '@/lib/firebase-admin';
import { taskItems } from '@/lib/personalTasksServer';

/**
 * Sets the caller's queue order: each id gets its position as its `rank` —
 * see byQueue() in src/types/task.ts. Sent whenever somebody moves a task up
 * or down the queue or types it a new number, always as the whole queue, so
 * the numbers never collide and a task nobody had placed yet is placed too.
 *
 * `update`, not `set`: an id that is not on the caller's own list fails the
 * batch rather than creating an empty task under their uid.
 */
const MAX_QUEUE = 500;

export async function PUT(req: NextRequest) {
  try {
    const { uid } = await requireCompanyUser(req);
    const body = await req.json().catch(() => ({}));
    const ids = Array.isArray(body?.ids)
      ? (body.ids as unknown[]).filter((v): v is string => typeof v === 'string' && v.length > 0 && v.length < 200)
      : [];

    if (ids.length === 0 || ids.length > MAX_QUEUE || new Set(ids).size !== ids.length) {
      return NextResponse.json({ error: 'Nothing to put in order.' }, { status: 400 });
    }

    const batch = adminDb.batch();
    ids.forEach((id, i) => {
      batch.update(taskItems(uid).doc(id), { rank: i + 1, updatedAt: FieldValue.serverTimestamp() });
    });

    try {
      await batch.commit();
    } catch {
      return NextResponse.json({ error: 'Some of those tasks no longer exist. Reload the page.' }, { status: 404 });
    }
    return NextResponse.json({ ranked: ids.length });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
