import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthError, requireCompanyUser } from '@/lib/firebase-admin';
import { taskHistory, toTask } from '@/lib/personalTasksServer';
import { isCalendarDateString } from '@/types/attendance';

/** At most this many days per request: a month view with its edges, with room to spare. */
const MAX_SPAN_DAYS = 62;

/**
 * The caller's own history for some days — what was moved out of the list
 * for being long over (see PERSONAL_TASK_HISTORY in src/types/task.ts). The
 * Calendar asks only when it is paged back that far, a month at a time, so
 * nothing reads history unless somebody is looking at it.
 *
 * `?from=YYYY-MM-DD&to=YYYY-MM-DD`. One range on `date`, which Firestore
 * indexes on its own. Same shape as /api/me/tasks: the uid off the token, no
 * parameter for whose. Read-only — there is no route that writes history
 * except the move into it.
 */
export async function GET(req: NextRequest) {
  try {
    const { uid } = await requireCompanyUser(req);
    const from = req.nextUrl.searchParams.get('from') ?? '';
    const to = req.nextUrl.searchParams.get('to') ?? '';
    if (!isCalendarDateString(from) || !isCalendarDateString(to) || to < from) {
      return NextResponse.json({ error: 'Which days?' }, { status: 400 });
    }
    const span = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
    if (span > MAX_SPAN_DAYS) {
      return NextResponse.json({ error: `At most ${MAX_SPAN_DAYS} days at a time.` }, { status: 400 });
    }

    const snap = await taskHistory(uid).where('date', '>=', from).where('date', '<=', to).get();
    const tasks = snap.docs.map((d) => ({ ...toTask(d), fromHistory: true }));
    return NextResponse.json({ tasks });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
