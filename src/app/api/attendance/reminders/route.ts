import { NextRequest, NextResponse } from 'next/server';
import { attendanceCaller, authErrorResponse, loadConfig, loadPeople } from '@/lib/attendanceServer';
import { listReminderOverrides, saveReminderOverride } from '@/lib/attendanceAdmin';

/**
 * Break reminders: the company's, and everybody who has their own.
 * `attendance.manage`. The company's are saved through PUT
 * /api/attendance/config with the rest of the setup; this route is for one
 * person at a time.
 */
export async function GET(req: NextRequest) {
  try {
    const caller = await attendanceCaller(req);
    if (!caller.manages) return NextResponse.json({ error: 'You cannot manage attendance.' }, { status: 403 });
    const [config, byEmail, people] = await Promise.all([loadConfig(), listReminderOverrides(), loadPeople()]);
    return NextResponse.json({
      company: config.reminders,
      byEmail,
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

/** `{ target: email, reminders: ReminderOverride | null }` — null puts them back on the company's. */
export async function PUT(req: NextRequest) {
  try {
    const caller = await attendanceCaller(req);
    if (!caller.manages) return NextResponse.json({ error: 'You cannot manage attendance.' }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    await saveReminderOverride(caller, String(body.target ?? ''), body.reminders ?? null);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const { error, status } = authErrorResponse(e);
    return NextResponse.json({ error }, { status });
  }
}
