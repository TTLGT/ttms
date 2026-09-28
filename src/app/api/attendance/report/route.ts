import { NextRequest, NextResponse } from 'next/server';
import { attendanceCaller, authErrorResponse, buildReport, seesOthers } from '@/lib/attendanceServer';
import { isCalendarDateString } from '@/types/attendance';

/**
 * Attendance for a date range. `scope=self` is the caller's own, for their
 * profile page. Otherwise it is everybody the caller may see — the whole
 * company with `attendance.view`, a Sales Manager's own team without it —
 * and the narrowing happens server-side in buildReport, never from the
 * request.
 */
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  try {
    const caller = await attendanceCaller(req);
    const url = new URL(req.url);
    const from = url.searchParams.get('from') ?? '';
    const to = url.searchParams.get('to') ?? '';
    if (!isCalendarDateString(from) || !isCalendarDateString(to)) {
      return NextResponse.json({ error: 'Pick a date range.' }, { status: 400 });
    }
    const self = url.searchParams.get('scope') === 'self';
    if (!self && !seesOthers(caller)) {
      return NextResponse.json({ error: 'You can see your own attendance only.' }, { status: 403 });
    }
    return NextResponse.json(await buildReport(caller, from, to, self ? 'self' : 'visible', Date.now()));
  } catch (e) {
    const { error, status } = authErrorResponse(e);
    return NextResponse.json({ error }, { status });
  }
}
