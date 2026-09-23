import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthError, requirePermission } from '@/lib/firebase-admin';
import {
  getReminderSettings,
  listOneOffs,
  loadCalendarPeople,
} from '@/lib/celebrationReminders';
import { officeToday } from '@/types/celebration';

/**
 * Everything the Celebrations page needs, in one call: who is on the
 * calendar, and the caller's own reminders.
 *
 * `people.view` because that is what already shows these birthdays and start dates in
 * Settings → People — see the note at the top of src/types/celebrationCalendar.ts.
 * `today` is the office's, so the page's "today" and the 8am run agree even
 * for somebody working late in another timezone.
 */
export async function GET(req: NextRequest) {
  let caller: { uid: string };
  try {
    caller = await requirePermission(req, 'people.view');
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [people, settings, reminders] = await Promise.all([
    loadCalendarPeople(),
    getReminderSettings(caller.uid),
    listOneOffs(caller.uid),
  ]);

  return NextResponse.json({ today: officeToday(), people, settings, reminders });
}
