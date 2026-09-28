import { NextRequest, NextResponse } from 'next/server';
import { attendanceCaller, authErrorResponse, buildReport, seesOthers } from '@/lib/attendanceServer';
import { officeDateOf } from '@/types/attendance';

/**
 * Who is in today, for the dashboard card: the same report as the Attendance
 * page, one day wide. Nothing for somebody who can see nobody but themselves
 * — the card is not drawn for them.
 */
export async function GET(req: NextRequest) {
  try {
    const caller = await attendanceCaller(req);
    if (!seesOthers(caller)) return NextResponse.json({ report: null });
    const now = Date.now();
    const today = officeDateOf(now);
    return NextResponse.json({ report: await buildReport(caller, today, today, 'visible', now) });
  } catch (e) {
    const { error, status } = authErrorResponse(e);
    return NextResponse.json({ error }, { status });
  }
}
