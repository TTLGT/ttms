'use client';

import { useEffect, useState } from 'react';
import { getAppSettings, savePresence } from '@/lib/appSettings';
import { DEFAULT_APP_SETTINGS } from '@/types/appSettings';
import { useSaveBarEntry } from './kit/SaveBar';
import { Loading, Notice, OptionCards, PreviewBox, SettingsCard, useStagedAction } from './kit/ui';

/**
 * Whether chat shows "Online" and "Last seen" in a direct conversation.
 *
 * Admin and HR, through `presence.manage`. The panel says what it costs,
 * because cost is the reason the switch exists: every other chat feature is
 * paid for by somebody doing something, and this one is paid for by people
 * simply having TTMS open.
 */
export default function PresencePanel() {
  const [saved, setSaved] = useState(DEFAULT_APP_SETTINGS.presence);
  const [draft, setDraft] = useState(DEFAULT_APP_SETTINGS.presence);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const staged = useStagedAction('presence');

  useEffect(() => {
    getAppSettings()
      .then((res) => { setSaved(res.settings.presence); setDraft(res.settings.presence); })
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
      await savePresence(draft);
      setSaved(draft);
      return async () => { await savePresence(previous); setSaved(previous); setDraft(previous); };
    },
    discard: () => setDraft(saved),
  });

  return (
    <SettingsCard
      id="presence"
      title="Online status"
      description="Shows Online, Away or Last seen at the top of a one-on-one chat. Each person’s browser checks in at most once every five minutes while they are using TTMS — or clocked in — so “last seen” can be up to five minutes behind."
    >
      {loading ? <Loading /> : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
          <OptionCards
            name="presence"
            value={draft}
            saved={saved}
            onChange={setDraft}
            options={[
              {
                value: true, title: 'On',
                detail: 'Also records active and idle minutes on each person’s attendance. About 24 small database writes an hour for each person using TTMS — around 6,500 a day for 30 people, inside the free daily allowance of 20,000.',
              },
              {
                value: false, title: 'Off',
                detail: 'No check-ins and no status. One-on-one chats say “Just the two of you”, and attendance keeps clock times and breaks but no active or idle minutes.',
              },
            ]}
          />
          <PreviewBox title="The top of a chat" note="An example conversation. Nothing here is saved until you press Save.">
            <ChatHeaderSample on={draft} />
          </PreviewBox>
        </div>
      )}
      {!active && draft !== saved && (
        <button type="button" onClick={() => void savePresence(draft).then(() => setSaved(draft))}
          className="mt-4 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white">Save</button>
      )}
      {error && <Notice tone="red" className="mt-4">{error}</Notice>}
    </SettingsCard>
  );
}

/** Two made-up conversations' headers, as chat draws them, on or off. */
function ChatHeaderSample({ on }: { on: boolean }) {
  const rows = [
    { initials: 'AR', name: 'Ana Ruiz', status: 'Online', dot: 'bg-green-500' },
    { initials: 'LM', name: 'Luis Morales', status: 'Last seen 12 minutes ago', dot: 'bg-gray-300' },
  ];
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.name} className="flex items-center gap-2.5 rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-sm">
          <span className="relative flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
            {r.initials}
            {on && <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white ${r.dot}`} />}
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-gray-900">{r.name}</span>
            <span data-es className="block text-xs text-gray-500">{on ? r.status : 'Just the two of you'}</span>
          </span>
        </div>
      ))}
    </div>
  );
}
