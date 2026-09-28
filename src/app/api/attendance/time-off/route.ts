import { NextRequest, NextResponse } from 'next/server';
import { attendanceCaller, authErrorResponse } from '@/lib/attendanceServer';
import { createTimeOff, decideTimeOff, listTimeOff } from '@/lib/attendanceAdmin';

/**
 * Time off. Anybody asks for their own and sees their own; `attendance.manage`
 * sees everybody's, decides them, and can record time off for somebody,
 * which is approved as it is written.
 */
export async function GET(req: NextRequest) {
  try {
    const caller = await attendanceCaller(req);
    const scope = new URL(req.url).searchParams.get('scope') === 'all' ? 'all' : 'self';
    return NextResponse.json({ requests: await listTimeOff(caller, scope) });
  } catch (e) {
    const { error, status } = authErrorResponse(e);
    return NextResponse.json({ error }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const caller = await attendanceCaller(req);
    const body = await req.json().catch(() => ({}));
    return NextResponse.json({ request: await createTimeOff(caller, body) });
  } catch (e) {
    const { error, status } = authErrorResponse(e);
    return NextResponse.json({ error }, { status });
  }
}

/** `{ id, decision: 'approve' | 'refuse' | 'withdraw', note }`. */
export async function PATCH(req: NextRequest) {
  try {
    const caller = await attendanceCaller(req);
    const body = await req.json().catch(() => ({}));
    return NextResponse.json({ request: await decideTimeOff(caller, String(body.id ?? ''), body.decision, body.note) });
  } catch (e) {
    const { error, status } = authErrorResponse(e);
    return NextResponse.json({ error }, { status });
  }
}
