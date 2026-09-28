import { NextRequest, NextResponse } from 'next/server';
import { attendanceCaller, authErrorResponse, dayDetail } from '@/lib/attendanceServer';
import { editDay } from '@/lib/attendanceAdmin';
import { isCalendarDateString } from '@/types/attendance';

/**
 * One person's day in full: each clock action with its network, provider and
 * device, the breaks, and every correction ever made to it. Anybody may read
 * their own; see canSeePerson for the rest.
 */
export async function GET(req: NextRequest) {
  try {
    const caller = await attendanceCaller(req);
    const url = new URL(req.url);
    const email = url.searchParams.get('email') ?? caller.email;
    const date = url.searchParams.get('date') ?? '';
    if (!isCalendarDateString(date)) return NextResponse.json({ error: 'Pick a day.' }, { status: 400 });
    return NextResponse.json({ day: await dayDetail(caller, email, date) });
  } catch (e) {
    const { error, status } = authErrorResponse(e);
    return NextResponse.json({ error }, { status });
  }
}

/** HR changing a day directly. `attendance.manage`, with a reason that is kept. */
export async function PATCH(req: NextRequest) {
  try {
    const caller = await attendanceCaller(req);
    const body = await req.json().catch(() => ({}));
    const email = String(body.email ?? '');
    const date = String(body.date ?? '');
    await editDay(caller, email, date, body, body.reason);
    return NextResponse.json({ day: await dayDetail(caller, email, date) });
  } catch (e) {
    const { error, status } = authErrorResponse(e);
    return NextResponse.json({ error }, { status });
  }
}
