'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import { allCityOptions, cityOfZone, offsetMinutes } from '@/types/clockChange';
import { saveMyTimeZone, useMyTimeZone } from '@/lib/useMyTimeZone';
import { Bi } from '@/components/spanish/Es';

/**
 * "Your time zone" on My profile — Automatic (this computer's zone) or a
 * city the person picks, which then follows them to every computer. Used by
 * the clock change banner and the dashboard's US time zones section.
 *
 * Saves as it changes, like the Celebrations card beside it, and says so: it
 * is a preference, not a request anybody approves.
 *
 * The list is every zone the browser knows, after the cities people here
 * actually type (Guatemala, the Chiapas towns, the UK). Typing narrows it;
 * only an exact pick from the list is saved, so nothing free-typed can reach
 * the account. The server checks the zone again.
 */
export default function TimeZoneSetting() {
  const me = useMyTimeZone();
  const [options, setOptions] = useState<ReturnType<typeof allCityOptions>>([]);
  const [text, setText] = useState('');
  const [manual, setManual] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  // Built in the browser: the server's list of zones is not the reader's.
  useEffect(() => { setOptions(allCityOptions()); }, []);
  useEffect(() => { setManual(me.picked); }, [me.picked]);
  // Reached from the banner's "Change" link as #time-zone. The profile page
  // draws this card only after its own data loads, by which time the browser
  // has already given up looking for the anchor.
  useEffect(() => {
    if (window.location.hash === '#time-zone') {
      document.getElementById('time-zone')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  const byLabel = useMemo(() => new Map(options.map((o) => [o.label, o])), [options]);

  async function save(pick: { tz: string; city: string } | null) {
    setSaving(true);
    setSaved(false);
    setError('');
    try {
      await saveMyTimeZone(pick);
      setSaved(true);
      setText('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that.');
    } finally {
      setSaving(false);
    }
  }

  function chooseAutomatic() {
    setManual(false);
    if (me.picked) void save(null);
  }

  function onType(value: string) {
    setText(value);
    const hit = byLabel.get(value);
    if (hit) void save({ tz: hit.tz, city: hit.city });
  }

  const now = Date.now();
  const differs = me.picked && me.detected && offsetMinutes(me.tz, now) !== offsetMinutes(me.detected, now);

  return (
    <section id="time-zone" className="mt-5 scroll-mt-6 rounded-xl border border-gray-200 bg-white">
      <header className="border-b border-gray-100 bg-gray-50 px-4 py-2.5">
        <h2 data-es className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Your time zone
        </h2>
        <p className="mt-0.5 text-[11px] text-gray-400">
          <Bi>Used for the clock change banner and the US time zones on your dashboard. Saved as you change it.</Bi>
        </p>
      </header>

      <div className="grid gap-3 px-4 py-3">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="radio"
            name="tz-mode"
            className="mt-1 accent-brand-600"
            checked={!manual}
            disabled={saving || !me.ready}
            onChange={chooseAutomatic}
          />
          <span className="min-w-0">
            <span className="block text-sm text-gray-900" data-es>Automatic</span>
            <span className="mt-0.5 block text-xs text-gray-500">
              Use this computer&rsquo;s time zone{me.detected ? `: ${cityOfZone(me.detected)} (${me.detected})` : ''}.
            </span>
          </span>
        </label>

        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="radio"
            name="tz-mode"
            className="mt-1 accent-brand-600"
            checked={manual}
            disabled={saving || !me.ready}
            onChange={() => setManual(true)}
          />
          <span className="min-w-0">
            <span className="block text-sm text-gray-900" data-es>Pick a city</span>
            <span className="mt-0.5 block text-xs text-gray-500">
              <Bi>For a computer set to the wrong time zone, or one shared between offices. Follows you to any computer.</Bi>
            </span>
          </span>
        </label>

        {manual && (
          <div className="grid gap-2 pl-7">
            {me.picked && (
              <p className="text-sm text-gray-700">
                Now: <span className="font-semibold">{me.name}</span>{' '}
                <span className="text-xs text-gray-400">({me.tz})</span>
              </p>
            )}
            <input
              list="tz-city-options"
              value={text}
              onChange={(e) => onType(e.target.value)}
              placeholder={me.picked ? 'Type to change city' : 'Start typing a city'}
              aria-label="City"
              autoComplete="off"
              disabled={saving}
              className="w-full max-w-sm rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-brand-500 focus:outline-none"
            />
            <datalist id="tz-city-options">
              {options.map((o) => <option key={o.label} value={o.label} />)}
            </datalist>
            <p className="text-[11px] text-gray-400">
              <Bi>Guatemala, the Chiapas towns and the UK come first. Any city in the world is in the list.</Bi>
            </p>
          </div>
        )}

        {differs && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
            This computer is set to {cityOfZone(me.detected)} time, which is different from {me.name}. If you have moved,
            switch back to Automatic or pick your new city.
          </p>
        )}
      </div>

      <div className="border-t border-gray-100 px-4 py-2.5">
        {error ? (
          <p className="text-xs text-red-600">{error}</p>
        ) : saved ? (
          <p data-es className="flex items-center gap-1.5 text-xs text-green-700">
            <Check className="h-3.5 w-3.5" /> Saved.
          </p>
        ) : (
          <p className="text-xs text-gray-400">
            <Bi>Attendance, birthdays and reminders stay on Guatemala time whatever you pick here.</Bi>
          </p>
        )}
      </div>
    </section>
  );
}
