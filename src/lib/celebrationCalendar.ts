import { auth } from './firebase';
import type {
  CalendarPerson,
  CelebrationKind,
  OneOffReminder,
  ReminderLead,
  ReminderSettings,
} from '@/types/celebrationCalendar';

/**
 * The Celebrations page's data, from the browser.
 *
 * Through the API rather than the client SDK, because it is built from
 * `allowedUsers` — admin-and-HR data — and the reminder collections have no
 * client rules at all. See src/lib/celebrationReminders.ts.
 */

export interface CalendarData {
  /** The office's own date, `YYYY-MM-DD`. */
  today: string;
  people: CalendarPerson[];
  settings: ReminderSettings;
  reminders: OneOffReminder[];
}

async function call<T>(url: string, init: RequestInit = {}): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in');
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${await user.getIdToken()}`,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Something went wrong');
  return data as T;
}

export function fetchCalendar(): Promise<CalendarData> {
  return call<CalendarData>('/api/celebration-calendar');
}

export async function saveReminderSettings(settings: ReminderSettings): Promise<ReminderSettings> {
  const { settings: saved } = await call<{ settings: ReminderSettings }>('/api/celebration-calendar/settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  });
  return saved;
}

export async function addOneOffReminder(input: {
  kind: CelebrationKind;
  subjectEmail: string;
  date: string;
  leadDays: ReminderLead;
}): Promise<OneOffReminder> {
  const { reminder } = await call<{ reminder: OneOffReminder }>('/api/celebration-calendar/reminders', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return reminder;
}

export async function deleteOneOffReminder(id: string): Promise<void> {
  await call(`/api/celebration-calendar/reminders/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
