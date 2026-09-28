import { NextRequest, NextResponse } from 'next/server';
import { requireCompanyUser } from '@/lib/firebase-admin';
import { authErrorResponse, recordBeat } from '@/lib/attendanceServer';
import { normalizeEmail } from '@/lib/accessControl';
import { fullName } from '@/types/allowedUser';

/**
 * The five-minute heartbeat: online status for chat, and active or idle
 * minutes for the day's attendance. See recordBeat for what it writes.
 *
 * The lightest guard that is still a guard — requireCompanyUser, one read —
 * because this runs for everybody all day. It never reads the profile.
 */
export async function POST(req: NextRequest) {
  try {
    const { uid, email, entry } = await requireCompanyUser(req);
    const body = await req.json().catch(() => ({}));
    const normalized = normalizeEmail(email);
    await recordBeat(
      { uid, email: normalized, name: (entry ? fullName(entry) : '') || normalized },
      body,
      Date.now(),
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    const { error, status } = authErrorResponse(e);
    return NextResponse.json({ error }, { status });
  }
}
