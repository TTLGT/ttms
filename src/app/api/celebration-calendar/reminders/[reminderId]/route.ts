import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthError, requirePermission } from '@/lib/firebase-admin';
import { deleteOneOff } from '@/lib/celebrationReminders';

type RouteContext = { params: Promise<{ reminderId: string }> };

/** Cancels one of the caller's own one-off reminders. */
export async function DELETE(req: NextRequest, { params }: RouteContext) {
  let caller: { uid: string };
  try {
    caller = await requirePermission(req, 'people.view');
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { reminderId } = await params;
  // Not found for somebody else's as well as for a missing one: nobody learns
  // what a colleague has asked to be reminded about by guessing ids.
  if (!(await deleteOneOff(caller.uid, reminderId))) {
    return NextResponse.json({ error: 'Reminder not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
