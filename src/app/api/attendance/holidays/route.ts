import { NextRequest, NextResponse } from 'next/server';
import { requireCompanyUser } from '@/lib/firebase-admin';
import { attendanceCaller, authErrorResponse } from '@/lib/attendanceServer';
import { deleteOverride, listOverrides, saveOverride } from '@/lib/attendanceAdmin';

/**
 * HR's changes to the public holidays. Readable by any staff member —
 * whether the office is shut on Monday is not a secret, and the Celebrations
 * calendar and everybody's own attendance both draw from it.
 */
export async function GET(req: NextRequest) {
  try {
    await requireCompanyUser(req);
    return NextResponse.json({ overrides: await listOverrides() });
  } catch (e) {
    const { error, status } = authErrorResponse(e);
    return NextResponse.json({ error }, { status });
  }
}

/** Move, cancel or add — see HolidayOverride. `attendance.manage`. */
export async function POST(req: NextRequest) {
  try {
    const caller = await attendanceCaller(req);
    if (!caller.manages) return NextResponse.json({ error: 'You cannot change holidays.' }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    return NextResponse.json({ override: await saveOverride(caller, body) });
  } catch (e) {
    const { error, status } = authErrorResponse(e);
    return NextResponse.json({ error }, { status });
  }
}

/** Undo a change: the calculated holiday comes back. */
export async function DELETE(req: NextRequest) {
  try {
    const caller = await attendanceCaller(req);
    if (!caller.manages) return NextResponse.json({ error: 'You cannot change holidays.' }, { status: 403 });
    const id = new URL(req.url).searchParams.get('id') ?? '';
    if (!id) return NextResponse.json({ error: 'Which change?' }, { status: 400 });
    await deleteOverride(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const { error, status } = authErrorResponse(e);
    return NextResponse.json({ error }, { status });
  }
}
