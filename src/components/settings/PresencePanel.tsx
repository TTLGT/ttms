'use client';

import { useEffect, useState } from 'react';
import { getAppSettings, savePresence } from '@/lib/appSettings';
import { DEFAULT_APP_SETTINGS } from '@/types/appSettings';

/**
 * Whether chat shows "Online" and "Last seen" in a direct conversation.
 *
 * Admin and HR, through `presence.manage`. The panel says what it costs,
 * because cost is the reason the switch exists: every other chat feature is
 * paid for by somebody doing something, and this one is paid for by people
 * simply having TTMS open.
 */
export default function PresencePanel() {
  const [on, setOn]           = useState(DEFAULT_APP_SETTINGS.presence);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState('');
  const [done, setDone]       = useState('');

  useEffect(() => {
    getAppSettings()
      .then((res) => setOn(res.settings.presence))
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
      await savePresence(next);
      setDone('Saved. It applies to each person the next time they open or refresh TTMS.');
    } catch (e) {
      setOn(previous);
      setError(e instanceof Error ? e.message : 'Failed to save the setting');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-900">Online Status</h2>
      <p className="mb-4 mt-1 text-sm text-gray-500">
        Shows <strong>Online</strong>, <strong>Away</strong> or <strong>Last seen</strong> at the top of a
        one-on-one chat. Each person&rsquo;s browser checks in at most once every five minutes while
        they are using TTMS — or clocked in — so &ldquo;last seen&rdquo; can be up to five minutes behind.
      </p>

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        <div className="space-y-2">
          {[true, false].map((value) => (
            <label
              key={String(value)}
              className={`flex cursor-pointer gap-3 rounded-lg border p-4 transition ${
                on === value ? 'border-brand-400 bg-brand-50/50' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <input
                type="radio"
                name="presence"
                className="mt-1 accent-brand-600"
                checked={on === value}
                disabled={busy}
                onChange={() => void choose(value)}
              />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900">{value ? 'On' : 'Off'}</p>
                <p className="mt-1 text-xs leading-relaxed text-gray-600">
                  {value
                    ? 'Also records active and idle minutes on each person’s attendance. About 24 small database writes an hour for each person using TTMS — around 6,500 a day for 30 people, inside the free daily allowance of 20,000.'
                    : 'No check-ins and no status. One-on-one chats say “Just the two of you”, and attendance keeps clock times and breaks but no active or idle minutes.'}
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
