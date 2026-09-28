import { NextRequest, NextResponse } from 'next/server';
import {
  attendanceCaller,
  authErrorResponse,
  clockState,
  seesOthers,
  setHideLastSeen,
} from '@/lib/attendanceServer';

/**
 * The caller's own clock: whether they are in, on a break, their status and
 * their "hide last seen" choice. What the sidebar clock draws from.
 *
 * `seesOthers` tells the browser whether to offer the Attendance page — a
 * courtesy only; every route behind that page checks for itself.
 */
export async function GET(req: NextRequest) {
  try {
    const caller = await attendanceCaller(req);
    const state = await clockState(caller, Date.now());
    return NextResponse.json({ state, seesOthers: seesOthers(caller), manages: caller.manages });
  } catch (e) {
    const { error, status } = authErrorResponse(e);
    return NextResponse.json({ error }, { status });
  }
}

/**
 * The one preference a person sets for themselves here: hiding their last
 * seen from colleagues. Reads that one key and nothing else.
 */
export async function PATCH(req: NextRequest) {
  try {
    const caller = await attendanceCaller(req);
    const body = await req.json().catch(() => ({}));
    if (typeof body.hideLastSeen !== 'boolean') {
      return NextResponse.json({ error: 'Say whether to hide it.' }, { status: 400 });
    }
    await setHideLastSeen(caller, body.hideLastSeen);
    return NextResponse.json({ state: await clockState(caller, Date.now()) });
  } catch (e) {
    const { error, status } = authErrorResponse(e);
    return NextResponse.json({ error }, { status });
  }
}
