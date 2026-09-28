import { NextRequest, NextResponse } from 'next/server';
import { attendanceCaller, authErrorResponse, clockAction } from '@/lib/attendanceServer';

/**
 * Clock in, clock out, start or end a break — always the caller's own.
 * There is no parameter for whose clock it is: it is the verified email off
 * the ID token, the same arrangement as GET /api/me.
 *
 * The time is the server's. A browser clock can be set to anything.
 */
export const maxDuration = 15;

export async function POST(req: NextRequest) {
  try {
    const caller = await attendanceCaller(req);
    const body = await req.json().catch(() => ({}));
    const state = await clockAction(caller, req, body, Date.now());
    return NextResponse.json({ state });
  } catch (e) {
    const { error, status } = authErrorResponse(e);
    return NextResponse.json({ error }, { status });
  }
}
