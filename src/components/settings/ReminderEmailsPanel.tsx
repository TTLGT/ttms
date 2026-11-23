'use client';

import { useEffect, useState } from 'react';
import { Bell, Mail, MessageSquare } from 'lucide-react';
import { getAppSettings, saveReminderEmails } from '@/lib/appSettings';
import { DEFAULT_APP_SETTINGS } from '@/types/appSettings';
import { useSaveBarEntry } from './kit/SaveBar';
import { Loading, Notice, OptionCards, PreviewBox, SettingsCard, useStagedAction } from './kit/ui';

/**
 * Whether calendar reminders may go out by email — one switch for the whole
 * company, over everybody's own "Send them by: Email" tick.
 *
 * Admins only (`settings.manage`). It covers both kinds of calendar reminder:
 * the ones people set on their own tasks and events, and HR's birthday and
 * anniversary ones. The private chat message is not affected.
 */
export default function ReminderEmailsPanel() {
  const [saved, setSaved] = useState(DEFAULT_APP_SETTINGS.reminderEmails);
  const [draft, setDraft] = useState(DEFAULT_APP_SETTINGS.reminderEmails);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const staged = useStagedAction('reminderEmails');

  useEffect(() => {
    getAppSettings()
      .then((res) => { setSaved(res.settings.reminderEmails); setDraft(res.settings.reminderEmails); })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load the setting'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!loading && staged) setDraft(staged === 'on');
  }, [loading, staged]);

  const { active } = useSaveBarEntry({
    dirty: !loading && draft !== saved,
    save: async () => {
      const previous = saved;
      await saveReminderEmails(draft);
      setSaved(draft);
      return async () => { await saveReminderEmails(previous); setSaved(previous); setDraft(previous); };
    },
    discard: () => setDraft(saved),
  });

  return (
    <SettingsCard
      id="reminder-emails"
      title="Reminder emails"
      description="Whether calendar reminders can be sent by email — the reminders people set on their own tasks and events, and the birthday and anniversary reminders. The private chat message is sent either way."
    >
      {loading ? <Loading /> : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
          <OptionCards
            name="reminder-emails"
            value={draft}
            saved={saved}
            onChange={setDraft}
            options={[
              {
                value: false, title: 'Off',
                detail: 'No reminder emails for anybody. The Email option is hidden on the Calendar, and reminders arrive only as a chat message. What people had ticked is kept, so turning this back on restores it.',
              },
              {
                value: true, title: 'On',
                detail: 'Each person chooses on their Calendar whether to get their reminders by email, chat or both.',
              },
            ]}
          />
          <PreviewBox title="How a reminder arrives" note="An example reminder. Nothing here is saved until you press Save.">
            <ReminderSample emails={draft} />
          </PreviewBox>
        </div>
      )}
      {!active && draft !== saved && (
        <button type="button" onClick={() => void saveReminderEmails(draft).then(() => setSaved(draft))}
          className="mt-4 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white">Save</button>
      )}
      {error && <Notice tone="red" className="mt-4">{error}</Notice>}
    </SettingsCard>
  );
}

/** One made-up reminder: always the chat line, and the email when the setting allows it. */
function ReminderSample({ emails }: { emails: boolean }) {
  return (
    <div className="space-y-2">
      <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
          <MessageSquare size={12} /> <span data-es>In TTMS chat</span>
        </p>
        <p className="mt-1.5 flex items-start gap-1.5 text-sm text-gray-800">
          <Bell size={14} className="mt-0.5 text-amber-500" />
          Call Acme Freight about Friday&rsquo;s pickup — 10:00
        </p>
      </div>
      {emails ? (
        <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            <Mail size={12} /> <span data-es>By email, for whoever ticked it</span>
          </p>
          <p className="mt-1.5 text-xs text-gray-500">From: TTMS</p>
          <p className="text-sm font-semibold text-gray-900">Reminder: Call Acme Freight about Friday&rsquo;s pickup</p>
          <p className="mt-1 text-xs text-gray-600">Today at 10:00 (office time). Open TTMS to see it on your calendar.</p>
        </div>
      ) : (
        <p className="flex items-center gap-1.5 rounded-lg border border-dashed border-gray-200 px-3 py-2 text-xs text-gray-400">
          <Mail size={12} /> <span data-es>No email is sent</span>
        </p>
      )}
    </div>
  );
}
