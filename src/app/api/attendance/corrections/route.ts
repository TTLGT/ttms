import { NextRequest, NextResponse } from 'next/server';
import { attendanceCaller, authErrorResponse } from '@/lib/attendanceServer';
import { createCorrection, decideCorrection, listCorrections } from '@/lib/attendanceAdmin';

/**
 * "I forgot to clock out." Anybody asks about their own days; only
 * `attendance.manage` decides, and never on their own request. An approval
 * rewrites the day and keeps the original beside it — see editDay.
 */
export async function GET(req: NextRequest) {
  try {
    const caller = await attendanceCaller(req);
    const scope = new URL(req.url).searchParams.get('scope') === 'all' ? 'all' : 'self';
    return NextResponse.json({ requests: await listCorrections(caller, scope) });
  } catch (e) {
    const { error, status } = authErrorResponse(e);
    return NextResponse.json({ error }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const caller = await attendanceCaller(req);
    const body = await req.json().catch(() => ({}));
    return NextResponse.json({ request: await createCorrection(caller, body) });
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
    return NextResponse.json({ request: await decideCorrection(caller, String(body.id ?? ''), body.decision, body.note) });
  } catch (e) {
    const { error, status } = authErrorResponse(e);
    return NextResponse.json({ error }, { status });
  }
}
