'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronUp, Globe2 } from 'lucide-react';
import { daysBetween, gapText, nearChange, nextChange, todayIn, zoneGaps } from '@/types/clockChange';
import { useMyTimeZone } from '@/lib/useMyTimeZone';
import { useDateFormatters } from '@/lib/useDateFormatters';
import TimeZoneTool from '@/components/timeZones/TimeZoneTool';
import { dayLabels } from '@/components/timeZones/changeWords';
import { Bi } from '@/components/spanish/Es';

/**
 * The clock change banner's map and converter, kept on the dashboard all year
 * as a tool: "it is 3pm in Denver, what is that for me?".
 *
 * Meant for the Broker Dashboard when that exists — it is one component
 * taking nothing, so moving it is one line. Folded by default, because a
 * dashboard is mostly read for its numbers; folded, its one line still
 * answers the common question (each zone's gap right now). Open or folded is
 * remembered per browser.
 *
 * Around a clock change it shows before and after, like the banner, even
 * after the banner has been closed — closing a reminder should not take the
 * tool's answer with it.
 */

const OPEN_KEY = 'ttms.timeZones.open';
const SUMMARY_ZONES = new Set(['et', 'ct', 'mt', 'pt']);

export default function TimeZonesSection() {
  const me = useMyTimeZone();
  const { formatCalendarDate } = useDateFormatters();
  const [open, setOpen] = useState(false);
  const [today, setToday] = useState('');

  useEffect(() => {
    try { setOpen(localStorage.getItem(OPEN_KEY) === 'open'); } catch { /* private window */ }
  }, []);
  useEffect(() => { if (me.ready) setToday(todayIn(me.tz)); }, [me.ready, me.tz]);

  const now = useMemo(() => (me.ready ? zoneGaps(me.tz, null) : []), [me.ready, me.tz]);
  const change = useMemo(() => (today ? nearChange(me.tz, today) : null), [me.tz, today]);
  const next = useMemo(() => (today ? nextChange(me.tz, today) : null), [me.tz, today]);

  if (!me.ready || !today) return null;

  const toggle = () => setOpen((was) => {
    const v = !was;
    try { localStorage.setItem(OPEN_KEY, v ? 'open' : 'closed'); } catch { /* private window */ }
    return v;
  });

  const nextIn = next ? daysBetween(today, next.date) : 0;
  const nextWho = next?.us ? 'Next US clock change' : `Next clock change in ${me.name}`;

  return (
    <section className="mt-8 rounded-xl border border-gray-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 text-left sm:px-6"
      >
        <span className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600"><Globe2 size={17} /></span>
          <span>
            <span className="block font-semibold text-gray-800" data-es="US time zones">US time zones</span>
            <span className="block text-xs text-gray-400">From {me.name}</span>
          </span>
        </span>

        {/* The quick answer, readable without opening anything. */}
        <span className="flex min-w-0 flex-1 flex-wrap gap-x-3 gap-y-1 text-xs tabular-nums text-gray-500">
          {now.filter((g) => SUMMARY_ZONES.has(g.id)).map((g) => (
            <span key={g.id} className="whitespace-nowrap">
              <span className="font-semibold text-gray-700">{g.name}</span> {gapText(g.after)}
            </span>
          ))}
        </span>

        <span className="ml-auto flex items-center gap-1 text-xs font-medium text-gray-400">
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          <span data-es={open ? 'Show less' : 'Show more'}>{open ? 'Show less' : 'Show more'}</span>
        </span>
      </button>

      {open && (
        <div className="grid gap-3 border-t border-gray-100 px-4 py-4 sm:px-6">
          {next && (
            <p className="text-xs text-gray-500">
              {nextWho}: <span className="font-semibold text-gray-700">{dayLabels(next.date, formatCalendarDate).en}</span>
              {' · '}{nextIn === 1 ? 'tomorrow' : `in ${nextIn} days`}
              {change && <> · <Bi>Showing before and after the change this week.</Bi></>}
            </p>
          )}
          <TimeZoneTool
            viewerTz={me.tz}
            change={change}
            changeLabel={change ? formatCalendarDate(change.date) : null}
          />
          <p className="text-[11px] text-gray-400">
            Measured from {me.name}.{' '}
            <Link href="/dashboard/profile#time-zone" className="text-brand-600 hover:underline" data-es="Change your time zone">
              Change your time zone
            </Link>
          </p>
        </div>
      )}
    </section>
  );
}
