'use client';

import { useEffect, useState } from 'react';
import { getAppSettings, saveReminderEmails } from '@/lib/appSettings';
import { DEFAULT_APP_SETTINGS } from '@/types/appSettings';

/**
 * Whether calendar reminders may go out by email — one switch for the whole
 * company, over everybody's own "Send them by: Email" tick.
 *
 * Admins only (`settings.manage`). It covers both kinds of calendar reminder:
 * the ones people set on their own tasks and events, and HR's birthday and
 * anniversary ones. The private chat message is not affected.
 */
export default function ReminderEmailsPanel() {
  const [on, setOn]           = useState(DEFAULT_APP_SETTINGS.reminderEmails);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState('');
  const [done, setDone]       = useState('');

  useEffect(() => {
    getAppSettings()
      .then((res) => setOn(res.settings.reminderEmails))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load the setting'))
      .finally(() => setLoading(false));
  }, []);

  async function choose(next: boolean) {
    if (next === on || busy) return;
    const previous = on;
    setOn(next);
    setBusy(true);
    setError('');
    setDone('');
    try {
      await saveReminderEmails(next);
      setDone('Saved. It applies from the next reminder sent.');
    } catch (e) {
      setOn(previous);
      setError(e instanceof Error ? e.message : 'Failed to save the setting');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-900">Reminder Emails</h2>
      <p className="mb-4 mt-1 text-sm text-gray-500">
        Whether calendar reminders can be sent by email — the reminders people set on their own tasks
        and events, and the birthday and anniversary reminders. The private chat message is sent either way.
      </p>

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        <div className="space-y-2">
          {[false, true].map((value) => (
            <label
              key={String(value)}
              className={`flex cursor-pointer gap-3 rounded-lg border p-4 transition ${
                on === value ? 'border-brand-400 bg-brand-50/50' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <input
                type="radio"
                name="reminder-emails"
                className="mt-1 accent-brand-600"
                checked={on === value}
                disabled={busy}
                onChange={() => void choose(value)}
              />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900">{value ? 'On' : 'Off'}</p>
                <p className="mt-1 text-xs leading-relaxed text-gray-600">
                  {value
                    ? 'Each person chooses on their Calendar whether to get their reminders by email, chat or both.'
                    : 'No reminder emails for anybody. The Email option is hidden on the Calendar, and reminders arrive only as a chat message. What people had ticked is kept, so turning this back on restores it.'}
                </p>
              </div>
            </label>
          ))}
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {done && <p className="mt-3 text-sm text-green-700">{done}</p>}
    </section>
  );
}
