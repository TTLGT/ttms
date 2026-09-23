import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthError, requirePermission } from '@/lib/firebase-admin';
import { saveReminderSettings } from '@/lib/celebrationReminders';
import { toReminderSettings } from '@/types/celebrationCalendar';

/**
 * The caller's own standing rule and channels.
 *
 * No parameter for whose settings: it is always the caller's own, keyed by the
 * uid off their verified token, so nobody can sign a colleague up for email.
 */
export async function PUT(req: NextRequest) {
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
  const settings = toReminderSettings(body);
  await saveReminderSettings(caller.uid, settings);
  return NextResponse.json({ settings });
}
