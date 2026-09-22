'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import {
  getAppSettings,
  previewCelebrations,
  saveCelebrations,
  type CelebrationRun,
} from '@/lib/appSettings';
import { DEFAULT_APP_SETTINGS } from '@/types/appSettings';

/**
 * The daily birthday and work-anniversary post in the Everyone room.
 *
 * The panel shows what would go out this morning as well as the switch,
 * because this is the only thing in TTMS that happens while nobody is looking:
 * without the preview, the only way to find out whether it works — or what it
 * sounds like — is to wait until 8am and see. It is also the only way to
 * notice the ordinary reason for a quiet room, which is that nobody has a
 * birthday or a start date on file rather than anything being broken.
 *
 * The preview reads live records, so it names people. That is why the whole
 * panel sits behind `settings.manage`: whoever can turn this on is already
 * able to read the dates it works from.
 */

/** What each outcome means, in the admin's terms rather than the code's. */
const OUTCOME_NOTE: Record<CelebrationRun['outcome'], string> = {
  posted:           'Sent.',
  preview:          'This goes out at 8am Guatemala time.',
  'already-posted': 'This already went out this morning. It will not be sent twice.',
  disabled:         'Nothing will be posted while this is switched off.',
  nobody:           'Nobody has a birthday or a work anniversary today.',
  'no-room':        'The Everyone room does not exist yet — it is created the first time somebody opens chat.',
};

export default function CelebrationsPanel() {
  const [on, setOn]           = useState(DEFAULT_APP_SETTINGS.celebrations);
  const [run, setRun]         = useState<CelebrationRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');
  const [saved, setSaved]     = useState(false);

  const loadPreview = useCallback(async () => {
    try {
      setRun(await previewCelebrations());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not check today');
    }
  }, []);

  useEffect(() => {
    getAppSettings()
      .then((res) => setOn(res.settings.celebrations))
      .then(loadPreview)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load the setting'))
      .finally(() => setLoading(false));
  }, [loadPreview]);

  async function choose(next: boolean) {
    if (next === on || saving) return;
    const previous = on;
    setOn(next);
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      await saveCelebrations(next);
      setSaved(true);
      // Re-read rather than patch: with the switch off the preview reports
      // "disabled" and names nobody, and a stale list beside an off switch
      // would read as a list of people about to be posted anyway.
      await loadPreview();
    } catch (e) {
      setOn(previous);
      setError(e instanceof Error ? e.message : 'Failed to save the setting');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-900">Celebrations</h2>
      <p className="mb-4 mt-1 text-sm text-gray-500">
        A message from TTMS in the Everyone room at 8am Guatemala time, on the day, naming whoever
        has a birthday or a work anniversary. It carries a name and — for an anniversary — how many
        years. It never carries a date of birth, a birth year or an age.
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
                name="celebrations"
                className="mt-1 accent-brand-600"
                checked={on === value}
                disabled={saving}
                onChange={() => void choose(value)}
              />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900">{value ? 'On' : 'Off'}</p>
                <p className="mt-1 text-xs leading-relaxed text-gray-600">
                  {value
                    ? 'Post the message on the days somebody is celebrating. Nothing is posted on a day when nobody is.'
                    : 'Post nothing. Everybody keeps their own choice below, so switching back on puts it all back as it was.'}
                </p>
              </div>
            </label>
          ))}
        </div>
      )}

      {/* Today, as it stands. The empty cases are spelled out rather than left
          blank: "nothing here" and "something is wrong" look identical
          otherwise, and this is a feature nobody watches run. */}
      {run && (
        <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Today</p>
          {run.message ? (
            <p className="mt-2 whitespace-pre-line text-sm text-gray-900">{run.message}</p>
          ) : null}
          <p className="mt-2 text-xs text-gray-500">{OUTCOME_NOTE[run.outcome]}</p>
        </div>
      )}

      <div className="mt-4 space-y-2 text-xs leading-relaxed text-gray-500">
        <p>
          A birthday and a start date are only visible to administrators and HR, so being named
          here is each person&apos;s own decision: everyone can switch either one off on their own
          profile page, and nobody is asked or told when they do.
        </p>
        <p>
          Somebody with no birthday or start date on file is never named, and neither is anybody
          suspended or still waiting to sign in for the first time.
        </p>
      </div>

      {saved && !error && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-green-700">
          <Check className="h-3.5 w-3.5" /> Saved.
        </p>
      )}
      {error && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>
      )}
    </section>
  );
}
