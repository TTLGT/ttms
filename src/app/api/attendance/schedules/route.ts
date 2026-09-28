import { NextRequest, NextResponse } from 'next/server';
import { attendanceCaller, authErrorResponse, loadPeople } from '@/lib/attendanceServer';
import { listSchedules, saveSchedule } from '@/lib/attendanceAdmin';

/** Everybody's schedule and the company default. `attendance.manage`. */
export async function GET(req: NextRequest) {
  try {
    const caller = await attendanceCaller(req);
    if (!caller.manages) return NextResponse.json({ error: 'You cannot manage attendance.' }, { status: 403 });
    const [schedules, people] = await Promise.all([listSchedules(), loadPeople()]);
    return NextResponse.json({
      ...schedules,
      people: people
        .filter((p) => !p.suspended)
        .map((p) => ({ email: p.email, name: p.name, pending: !p.uid }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    });
  } catch (e) {
    const { error, status } = authErrorResponse(e);
    return NextResponse.json({ error }, { status });
  }
}

/** Set or clear one schedule: `{ target: email | '_default', schedule: Schedule | null }`. */
export async function PUT(req: NextRequest) {
  try {
    const caller = await attendanceCaller(req);
    if (!caller.manages) return NextResponse.json({ error: 'You cannot manage attendance.' }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    await saveSchedule(caller, String(body.target ?? ''), body.schedule ?? null);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const { error, status } = authErrorResponse(e);
    return NextResponse.json({ error }, { status });
  }
}
