import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthError, FieldValue, adminDb, requireCompanyUser } from '@/lib/firebase-admin';
import { taskItems, taskOwnerDoc } from '@/lib/personalTasksServer';
import { EXTRA_COLORS, cleanColorLabels } from '@/types/task';

/**
 * The caller's own names for the six task colours — see `ColorLabels` in
 * src/types/task.ts. Read along with the list by GET /api/me/tasks.
 *
 * The whole map is replaced, not merged, so clearing a name in the box puts
 * the colour back to its own name. `mergeFields` rather than `merge: true`
 * for exactly that: `merge` merges into a map key by key and would keep a
 * name the request left out.
 *
 * An extra colour exists while it has a name, so one whose name is cleared
 * here has been removed — and its tasks move to yellow in the same batch,
 * rather than keep a tag the person can no longer see or filter by. Only the
 * list is retagged; history is a record and keeps what it was. One
 * single-field `in` query, which Firestore indexes by itself.
 */
export async function PUT(req: NextRequest) {
  try {
    const { uid } = await requireCompanyUser(req);
    const body = await req.json().catch(() => ({}));
    const colorLabels = cleanColorLabels(body?.colorLabels);
    const owner = taskOwnerDoc(uid);
    const before = cleanColorLabels((await owner.get()).data()?.colorLabels);
    const removed = EXTRA_COLORS.filter((c) => before[c] && !colorLabels[c]);

    const batch = adminDb.batch();
    batch.set(owner, { colorLabels, updatedAt: FieldValue.serverTimestamp() }, { mergeFields: ['colorLabels', 'updatedAt'] });
    let retagged = 0;
    if (removed.length) {
      // Up to MAX_TASKS_PER_PERSON (1,000) tasks against a 500-write batch:
      // slices of 450, the first one carrying the name change with it.
      const snap = await taskItems(uid).where('color', 'in', removed).get();
      retagged = snap.size;
      const docs = snap.docs;
      for (const d of docs.slice(0, 450)) batch.update(d.ref, { color: 'yellow', updatedAt: FieldValue.serverTimestamp() });
      await batch.commit();
      for (let i = 450; i < docs.length; i += 450) {
        const more = adminDb.batch();
        for (const d of docs.slice(i, i + 450)) more.update(d.ref, { color: 'yellow', updatedAt: FieldValue.serverTimestamp() });
        await more.commit();
      }
    } else {
      await batch.commit();
    }
    return NextResponse.json({ colorLabels, removed, retagged });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
