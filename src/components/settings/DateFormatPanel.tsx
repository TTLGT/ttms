'use client';

import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { getAppSettings, saveDateFormat } from '@/lib/appSettings';
import { formatCalendarDate } from '@/lib/dateFormat';
import { DEFAULT_APP_SETTINGS } from '@/types/appSettings';
import type { DateFormat } from '@/types/appSettings';

/**
 * Admin choice of how dates are written on screen. Applies to everyone: two
 * brokers reading the same order have to be reading the same day.
 */

/**
 * The 4th of March, in every example. A day of the month that is also a valid
 * month number is the whole point — 12-Dec or 25-Nov would look identical in
 * all three formats and demonstrate nothing.
 */
const SAMPLE = '2020-03-04';

const OPTIONS: { format: DateFormat; detail: string }[] = [
  {
    format: 'd-mmm-yyyy',
    detail:
      'Day, then the month by name, then the year. Longer, but the month is spelled out, so nobody can read it as the wrong day.',
  },
  {
    format: 'mm/dd/yyyy',
    detail: 'Month first, the usual US order. The 4th of March is written 03/04.',
  },
  {
    format: 'dd/mm/yyyy',
    detail:
      'Day first, the way it is written across Latin America and most of the world. The 4th of March is written 04/03.',
  },
];

export default function DateFormatPanel() {
  const [format, setFormat] = useState<DateFormat>(DEFAULT_APP_SETTINGS.dateFormat);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<DateFormat | ''>('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getAppSettings()
      .then((res) => setFormat(res.settings.dateFormat))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load the setting'))
      .finally(() => setLoading(false));
  }, []);

  async function choose(next: DateFormat) {
    if (next === format || saving) return;
    const previous = format;
    setFormat(next);
    setSaving(next);
    setError('');
    setSaved(false);
    try {
      await saveDateFormat(next);
      setSaved(true);
    } catch (e) {
      // Put the radio back: leaving it on a format that did not save would
      // claim dates now read a way they do not.
      setFormat(previous);
      setError(e instanceof Error ? e.message : 'Failed to save the setting');
    } finally {
      setSaving('');
    }
  }

  return (
    <section className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Date Format</h2>
      <p className="text-sm text-gray-500 mt-1 mb-4">
        How dates are written everywhere in TTMS — pickup and delivery dates, insurance expiry,
        start dates and birthdays. The examples below all show the same day, the 4th of March 2020.
      </p>

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        <div className="space-y-2">
          {OPTIONS.map((option) => {
            const selected = format === option.format;
            return (
              <label
                key={option.format}
                className={`flex gap-3 rounded-lg border p-4 cursor-pointer transition ${
                  selected ? 'border-brand-400 bg-brand-50/50' : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <input
                  type="radio"
                  name="dateFormat"
                  className="mt-1 accent-brand-600"
                  checked={selected}
                  disabled={Boolean(saving)}
                  onChange={() => void choose(option.format)}
                />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">
                    {formatCalendarDate(SAMPLE, option.format)}
                    {saving === option.format && (
                      <span className="ml-2 text-xs font-normal text-gray-500">Saving…</span>
                    )}
                  </p>
                  <p className="text-xs text-gray-600 mt-1 leading-relaxed">{option.detail}</p>
                </div>
              </label>
            );
          })}
        </div>
      )}

      {/* Both of these get asked the first time someone changes this, so they
          are answered here rather than left to be discovered. */}
      <div className="mt-4 space-y-2 text-xs text-gray-500 leading-relaxed">
        <p>
          Bills of lading, invoices, carrier agreements and the page carriers sign always spell the
          month out — “March 4, 2020” — whatever is chosen here. Those leave the company and stand
          as the record of a shipment, where a slashed date can be read as two different days.
        </p>
        <p>
          Typing a date follows this too — every date box in TTMS shows and accepts the format
          chosen here, and the calendar button beside it still opens the usual picker for clicking.
          A box that cannot read what was typed, or that could read it as two different days, says
          so rather than guessing.
        </p>
      </div>

      {saved && !error && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-green-700">
          <Check className="w-3.5 h-3.5" /> Saved. Everyone sees dates this way the next time their
          page loads.
        </p>
      )}
      {error && (
        <div className="mt-3 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600">{error}</div>
      )}
    </section>
  );
}
