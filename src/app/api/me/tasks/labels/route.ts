import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthError, FieldValue, requireCompanyUser } from '@/lib/firebase-admin';
import { taskOwnerDoc } from '@/lib/personalTasksServer';
import { cleanColorLabels } from '@/types/task';

/**
 * The caller's own names for the six task colours — see `ColorLabels` in
 * src/types/task.ts. Read along with the list by GET /api/me/tasks.
 *
 * The whole map is replaced, not merged, so clearing a name in the box puts
 * the colour back to its own name. `mergeFields` rather than `merge: true`
 * for exactly that: `merge` merges into a map key by key and would keep a
 * name the request left out.
 */
export async function PUT(req: NextRequest) {
  try {
    const { uid } = await requireCompanyUser(req);
    const body = await req.json().catch(() => ({}));
    const colorLabels = cleanColorLabels(body?.colorLabels);
    await taskOwnerDoc(uid).set(
      { colorLabels, updatedAt: FieldValue.serverTimestamp() },
      { mergeFields: ['colorLabels', 'updatedAt'] },
    );
    return NextResponse.json({ colorLabels });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
