import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthError, FieldValue, adminDb, requireCompanyUser } from '@/lib/firebase-admin';
import { officeToday } from '@/types/celebration';
import { isCalendarDateString } from '@/types/attendance';
import { taskItems, taskOwnerDoc, toTask } from '@/lib/personalTasksServer';
import { MAX_TODAY_PICKS, canPickForToday, type TodayPicks } from '@/types/planner';
import { dayDistance } from '@/types/task';

/**
 * Today's 3 — the Planner's three things that matter most today. See
 * src/types/planner.ts.
 *
 * The whole pick, every time (`{ date, ids }`, up to three, in order), stored
 * on the list's parent document beside the board columns. Same shape as every
 * /api/me route: the uid off the ID token, no parameter for whose list.
 *
 * Each id is read from the caller's own list before it is saved, so a pick
 * can only ever point at one of their own open tasks — three reads, on a save
 * somebody makes a few times a day.
 *
 * The date is the browser's day, which is what every task view compares
 * against (`calendarToday()`), but only a day either side of the office's:
 * the pick is for today, and a stored "today" a week out would quietly never
 * show.
 */
export async function PUT(req: NextRequest) {
  try {
    const { uid } = await requireCompanyUser(req);
    const body = await req.json().catch(() => ({}));
    const date = typeof body?.date === 'string' ? body.date : '';
    if (!isCalendarDateString(date) || Math.abs(dayDistance(officeToday(), date)) > 1) {
      return NextResponse.json({ error: 'Which day is today? Reload the page.' }, { status: 400 });
    }
    const raw: unknown[] = Array.isArray(body?.ids) ? body.ids : [];
    const ids = [...new Set(raw.filter((v): v is string => typeof v === 'string' && /^[A-Za-z0-9]{1,64}$/.test(v)))];
    if (ids.length > MAX_TODAY_PICKS) {
      return NextResponse.json({ error: `Today's ${MAX_TODAY_PICKS} holds ${MAX_TODAY_PICKS} things at most.` }, { status: 400 });
    }

    const snaps = ids.length ? await adminDb.getAll(...ids.map((id) => taskItems(uid).doc(id))) : [];
    for (const snap of snaps) {
      if (!snap.exists) {
        return NextResponse.json({ error: 'One of those tasks no longer exists. Reload the page.' }, { status: 404 });
      }
      // A finished task may stay in the pick (it shows ticked off); only adding one is refused.
      const t = toTask(snap);
      if (t.kind !== 'task' || t.archived || (!canPickForToday(t) && t.status !== 'done')) {
        return NextResponse.json({ error: `“${t.title}” can't go in Today's ${MAX_TODAY_PICKS}: only your own open tasks can.` }, { status: 400 });
      }
    }

    const picks: TodayPicks = { date, ids };
    await taskOwnerDoc(uid).set({ todayPicks: picks, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return NextResponse.json({ picks });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
