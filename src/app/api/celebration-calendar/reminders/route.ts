import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthError, requirePermission } from '@/lib/firebase-admin';
import { ReminderError, createOneOff } from '@/lib/celebrationReminders';

/**
 * Sets a one-off reminder about one person's birthday or anniversary, for the caller.
 *
 * The owner is the caller, never a field in the body. What the reminder is
 * about is checked against the allowlist in createOneOff — the browser says
 * which day, the server confirms it is theirs.
 */
export async function POST(req: NextRequest) {
  let caller: { uid: string };
  try {
    caller = await requirePermission(req, 'people.view');
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  try {
    const reminder = await createOneOff({
      ownerUid:        caller.uid,
      kind:            body.kind,
      subjectEmail:    typeof body.subjectEmail === 'string' ? body.subjectEmail : '',
      date:            typeof body.date === 'string' ? body.date : '',
      leadDays:        body.leadDays,
    });
    return NextResponse.json({ reminder });
  } catch (e) {
    if (e instanceof ReminderError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }
}
