import { NextRequest, NextResponse } from 'next/server';
import { requireCompanyUser } from '@/lib/firebase-admin';
import { authErrorResponse, setStatus } from '@/lib/attendanceServer';

/** Busy, In a meeting, Away, or null for available — shown to colleagues in chat. */
export async function PUT(req: NextRequest) {
  try {
    const { uid } = await requireCompanyUser(req);
    const body = await req.json().catch(() => ({}));
    await setStatus(uid, body.status ?? null, body.note);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const { error, status } = authErrorResponse(e);
    return NextResponse.json({ error }, { status });
  }
}
