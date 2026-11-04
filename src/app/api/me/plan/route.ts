import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthError } from '@/lib/firebase-admin';
import { isPlanDate, myDayPlan, ownerOf, publishDayPlan } from '@/lib/dayPlansServer';
import { officeToday } from '@/types/celebration';
import { nextWorkingDay } from '@/types/dayPlan';

/**
 * The caller's own shared day plans — see src/types/dayPlan.ts.
 *
 * Same shape as /api/me/tasks: the uid is the one off the verified ID token,
 * and there is no parameter for whose plan. GET is what the caller's managers
 * can see for today and the next working day; POST shares a day again from
 * the list as it is now, with the items the caller wants shown as Busy.
 */

function fail(e: unknown) {
  if (e instanceof AdminAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
  throw e;
}

export async function GET(req: NextRequest) {
  try {
    const owner = await ownerOf(req);
    const today = officeToday();
    const next = nextWorkingDay(today);
    const [todayPlan, nextPlan] = await Promise.all([myDayPlan(owner.uid, today), myDayPlan(owner.uid, next)]);
    return NextResponse.json({ today, next, plans: { [today]: todayPlan, [next]: nextPlan } });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const owner = await ownerOf(req);
    const body = await req.json().catch(() => ({}));
    const date = body?.date;
    // Today or later only: a plan is shared ahead of the day, and rewriting
    // what was shared for a day already gone would make it a record of what
    // happened, which it is not.
    if (!isPlanDate(date) || date < officeToday()) {
      return NextResponse.json({ error: 'Pick today or a later day.' }, { status: 400 });
    }
    const busyIds = Array.isArray(body?.busyIds)
      ? (body.busyIds as unknown[]).filter((x): x is string => typeof x === 'string').slice(0, 500)
      : undefined;
    const plan = await publishDayPlan(owner, date, 'manual', busyIds);
    return NextResponse.json({ plan });
  } catch (e) {
    return fail(e);
  }
}
