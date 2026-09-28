import { NextRequest, NextResponse } from 'next/server';
import { attendanceCaller, authErrorResponse, loadConfig } from '@/lib/attendanceServer';
import { saveConfig } from '@/lib/attendanceAdmin';
import { requestIp } from '@/lib/networkInfo';

/**
 * Office networks and alert settings. `attendance.manage`.
 *
 * Also reports the caller's own IP address, so "Add this network" can be
 * offered to somebody sitting in the office — HR should not have to find out
 * what their IP address is.
 */
export async function GET(req: NextRequest) {
  try {
    const caller = await attendanceCaller(req);
    if (!caller.manages) return NextResponse.json({ error: 'You cannot manage attendance.' }, { status: 403 });
    return NextResponse.json({ config: await loadConfig(), yourIp: requestIp(req) });
  } catch (e) {
    const { error, status } = authErrorResponse(e);
    return NextResponse.json({ error }, { status });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const caller = await attendanceCaller(req);
    if (!caller.manages) return NextResponse.json({ error: 'You cannot manage attendance.' }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    return NextResponse.json({ config: await saveConfig(caller, body) });
  } catch (e) {
    const { error, status } = authErrorResponse(e);
    return NextResponse.json({ error }, { status });
  }
}
