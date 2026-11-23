'use client';

import { useEffect, useState } from 'react';
import { CalendarDays, FileText, ShieldCheck, Truck } from 'lucide-react';
import { getAppSettings, saveDateFormat } from '@/lib/appSettings';
import { formatCalendarDate } from '@/lib/dateFormat';
import { DEFAULT_APP_SETTINGS, isDateFormat } from '@/types/appSettings';
import type { DateFormat } from '@/types/appSettings';
import { Bi } from '@/components/spanish/Es';
import { useSaveBarEntry } from './kit/SaveBar';
import { Loading, Notice, OptionCards, PreviewBox, SettingsCard, useStagedAction } from './kit/ui';

/**
 * Admin choice of how dates are written on screen. Applies to everyone: two
 * brokers reading the same order have to be reading the same day.
 *
 * Held as a draft and saved through the Settings Save bar; the preview shows
 * a load card redrawn in the format being considered, before anybody else
 * sees it.
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
  const [saved, setSaved] = useState<DateFormat>(DEFAULT_APP_SETTINGS.dateFormat);
  const [draft, setDraft] = useState<DateFormat>(DEFAULT_APP_SETTINGS.dateFormat);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const staged = useStagedAction('dateFormat');

  useEffect(() => {
    getAppSettings()
      .then((res) => { setSaved(res.settings.dateFormat); setDraft(res.settings.dateFormat); })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load the setting'))
      .finally(() => setLoading(false));
  }, []);

  // A search action ("Write dates as 03/04/2020") arrives already staged.
  useEffect(() => {
    if (!loading && staged && isDateFormat(staged)) setDraft(staged);
  }, [loading, staged]);

  const { active } = useSaveBarEntry({
    dirty: !loading && draft !== saved,
    save: async () => {
      const previous = saved;
      await saveDateFormat(draft);
      setSaved(draft);
      return async () => { await saveDateFormat(previous); setSaved(previous); setDraft(previous); };
    },
    discard: () => setDraft(saved),
  });

  return (
    <SettingsCard
      id="date-format"
      title="Date format"
      description="How dates are written everywhere in TTMS — pickup and delivery dates, insurance expiry, start dates and birthdays. Every example shows the same day, the 4th of March 2020."
    >
      {loading ? <Loading /> : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
          <OptionCards
            name="dateFormat"
            value={draft}
            saved={saved}
            onChange={setDraft}
            options={OPTIONS.map((o) => ({ value: o.format, title: formatCalendarDate(SAMPLE, o.format), detail: o.detail }))}
          />
          <PreviewBox title="How a load reads" note="An example load, drawn in the format picked on the left. Nothing here is saved until you press Save.">
            <LoadCardSample format={draft} />
          </PreviewBox>
        </div>
      )}

      {/* Both of these get asked the first time someone changes this, so they
          are answered here rather than left to be discovered. */}
      <div className="mt-5 space-y-2 text-xs leading-relaxed text-gray-500">
        <p>
          <Bi>Bills of lading, invoices, dispatch sheets and the page carriers sign always spell the
          month out — “March 4, 2020” — whatever is chosen here. Those leave the company and stand
          as the record of a shipment, where a slashed date can be read as two different days.</Bi>
        </p>
        <p>
          <Bi>Typing a date follows this too — every date box in TTMS shows and accepts the format
          chosen here, and the calendar button beside it still opens the usual picker for clicking.</Bi>
        </p>
      </div>

      {!active && draft !== saved && (
        <button type="button" onClick={() => void saveDateFormat(draft).then(() => setSaved(draft))}
          className="mt-4 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white">Save</button>
      )}
      {error && <Notice tone="red" className="mt-4">{error}</Notice>}
    </SettingsCard>
  );
}

/** A made-up load, in the shape of the Orders list card, with its dates in `format`. */
function LoadCardSample({ format }: { format: DateFormat }) {
  const d = (iso: string) => formatCalendarDate(iso, format);
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 text-sm shadow-sm">
      <div className="flex items-center justify-between">
        <span className="font-[family-name:var(--font-rajdhani)] text-lg font-bold tracking-wide text-gray-900">TTL-10482</span>
        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-700">Booked</span>
      </div>
      <p className="mt-1 flex items-center gap-1.5 text-gray-700"><Truck size={13} className="text-gray-400" /> Dallas, TX → Atlanta, GA</p>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="flex items-center gap-1 text-gray-500"><CalendarDays size={12} /> <span data-es>Pickup</span></dt>
        <dd className="font-medium tabular-nums text-gray-900">{d('2020-03-04')}</dd>
        <dt className="flex items-center gap-1 text-gray-500"><CalendarDays size={12} /> <span data-es>Delivery</span></dt>
        <dd className="font-medium tabular-nums text-gray-900">{d('2020-03-06')}</dd>
        <dt className="flex items-center gap-1 text-gray-500"><ShieldCheck size={12} /> <span data-es>Insurance until</span></dt>
        <dd className="font-medium tabular-nums text-gray-900">{d('2020-12-11')}</dd>
        <dt className="flex items-center gap-1 text-gray-500"><FileText size={12} /> <span data-es>On the BOL</span></dt>
        <dd className="text-gray-600">March 4, 2020</dd>
      </dl>
    </div>
  );
}
