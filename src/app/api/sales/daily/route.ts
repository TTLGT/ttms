import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthError } from '@/lib/firebase-admin';
import { requireCaller } from '@/lib/partyAccess';
import { SalesRefused, salesDaysFor, setStandingTargets, visibleSellers } from '@/lib/salesDayServer';
import { officeToday } from '@/types/celebration';
import { isCalendarDateString } from '@/types/attendance';

/**
 * Team numbers — see src/types/salesDay.ts.
 *
 * `GET ?date=YYYY-MM-DD` answers every broker and Sales Manager the caller may
 * see — their own team for a Sales Manager (`managedUids`), everybody for
 * `sales.viewAll` — with that day's targets and numbers. Anybody else is
 * refused; the people list is worked out here from the verified caller, never
 * taken from the request.
 *
 * `PUT { uid, targets }` sets one person's standing targets: an admin for
 * anybody, a Sales Manager for their own team, both under `incentives.manage`
 * (`maySetTargets()`).
 */
function fail(e: unknown) {
  if (e instanceof SalesRefused) return NextResponse.json({ error: e.message }, { status: e.status });
  if (e instanceof AdminAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
  throw e;
}

export async function GET(req: NextRequest) {
  try {
    const caller = await requireCaller(req);
    const date = req.nextUrl.searchParams.get('date') || officeToday();
    if (!isCalendarDateString(date) || date > officeToday()) {
      return NextResponse.json({ error: 'Pick today or an earlier day.' }, { status: 400 });
    }
    const people = await visibleSellers(caller);
    const days = await salesDaysFor(people.map((p) => p.uid), date);
    return NextResponse.json({ date, people, days });
  } catch (e) {
    return fail(e);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const caller = await requireCaller(req);
    const body = await req.json().catch(() => ({}));
    const uid = typeof body?.uid === 'string' && /^[A-Za-z0-9]{1,128}$/.test(body.uid) ? body.uid : '';
    if (!uid) return NextResponse.json({ error: 'Whose targets?' }, { status: 400 });
    const targets = await setStandingTargets(caller, uid, body.targets);
    return NextResponse.json({ targets });
  } catch (e) {
    return fail(e);
  }
}
