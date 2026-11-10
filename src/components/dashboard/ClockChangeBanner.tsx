'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, X } from 'lucide-react';
import {
  addDays, bannerChange, changesFor, daysBetween, jumpHours, noonOf, relativeDays, todayIn,
} from '@/types/clockChange';
import { useMyTimeZone } from '@/lib/useMyTimeZone';
import { useDateFormatters } from '@/lib/useDateFormatters';
import ClockFace from '@/components/timeZones/ClockFace';
import TimeZoneTool from '@/components/timeZones/TimeZoneTool';
import { checkLine, context, dayLabels, headline } from '@/components/timeZones/changeWords';
import { Es } from '@/components/spanish/Es';

/**
 * The week before and the week after a clock change, at the top of the
 * dashboard: what is changing, on which Sunday, how far each US zone moves
 * from where the reader sits, and a converter to check a booked time.
 *
 * Whose change: the US's, and the reader's own — see src/types/clockChange.ts.
 * Somebody in Guatemala or Chiapas sees two banners a year, somebody in the UK
 * four, because the UK changes on different Sundays.
 *
 * "Today" is the reader's own day, in their own zone, like CelebrationBanner:
 * one reader, so their midnight is the one that counts.
 *
 * Three ways to put it away, all per browser like the birthday banner:
 *  - **Got it** (or the X) closes it until the next change. Stored as the date
 *    of the change closed, so March's still comes after November's is closed.
 *  - **Remind me tomorrow** hides it for the rest of today.
 *  - **Show less** folds it to its title, and stays folded.
 *
 * Costs no read: everything comes from the browser's time zone data and the
 * profile AuthContext already holds.
 */

const COMPACT_KEY = 'ttms.clockChange.compact';
const closedKey = (tz: string) => `ttms.clockChange.closed.${tz}`;
const snoozedKey = (tz: string) => `ttms.clockChange.snoozed.${tz}`;

function read(key: string): string {
  try { return localStorage.getItem(key) ?? ''; } catch { return ''; }
}
function write(key: string, value: string | null) {
  try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch { /* private window */ }
}

const WEEKDAY_NARROW = new Intl.DateTimeFormat('en-US', { weekday: 'narrow', timeZone: 'UTC' });

export default function ClockChangeBanner() {
  const me = useMyTimeZone();
  const { formatCalendarDate } = useDateFormatters();
  const [today, setToday] = useState('');
  const [closed, setClosed] = useState('');
  const [snoozed, setSnoozed] = useState('');
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    if (!me.ready) return;
    setToday(todayIn(me.tz));
    setClosed(read(closedKey(me.tz)));
    setSnoozed(read(snoozedKey(me.tz)));
    setCompact(read(COMPACT_KEY) === '1');
  }, [me.ready, me.tz]);

  const change = useMemo(() => (today ? bannerChange(me.tz, today, closed) : null), [me.tz, today, closed]);
  const nearby = useMemo(() => (today ? changesFor(me.tz, today) : []), [me.tz, today]);

  if (!me.ready || !today || !change || snoozed === today) return null;

  const days = daysBetween(today, change.date);
  const day = dayLabels(change.date, formatCalendarDate);
  const title = headline(change, me.name, days, day);
  const why = context(change, me.tz, me.name, days, formatCalendarDate);
  const check = checkLine(days);
  const mover = change.us ?? change.local!;
  const [from, to] = jumpHours(mover, change.us ? 'America/New_York' : me.tz);
  const hasLocal = nearby.some((c) => c.local && Math.abs(daysBetween(c.date, change.date)) <= 7);

  const close = () => { write(closedKey(me.tz), change.date); setClosed(change.date); };
  const snooze = () => { write(snoozedKey(me.tz), today); setSnoozed(today); };
  const fold = (next: boolean) => { write(COMPACT_KEY, next ? '1' : null); setCompact(next); };

  // Fifteen days centred on the change, with today and every change marked.
  const strip = Array.from({ length: 15 }, (_, i) => {
    const d = addDays(change.date, i - 7);
    const c = nearby.find((x) => x.date === d);
    return { d, c, isToday: d === today, past: d < today };
  });

  return (
    <section
      role="region"
      aria-label="Clock change"
      className="mb-6 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm"
    >
      <div className="relative flex items-start gap-4 bg-gradient-to-r from-brand-50 to-white p-4 pr-12 sm:items-center">
        <div className="flex flex-none flex-col items-center gap-0.5">
          <ClockFace from={from} to={to} size={56} />
          <span className="whitespace-nowrap text-[11px] font-semibold tabular-nums text-amber-700">
            {from}:00 → {to}:00 am
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full border px-2 py-px text-[11px] font-semibold uppercase tracking-wide ${
                days > 0 ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-brand-100 bg-brand-50 text-brand-700'
              }`}
            >
              {relativeDays(days)}
            </span>
            <span className="text-xs text-gray-400">Your time zone: {me.name}</span>
          </div>
          <h2 className="mt-1 font-[family-name:var(--font-rajdhani)] text-2xl font-bold leading-tight text-gray-900 [text-wrap:balance]">
            {title.en}
            <Es vars={title.esVars}>{title.key}</Es>
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-gray-600">
            {why ? `${why.en} ` : ''}{check}
            {why && <Es vars={why.esVars}>{why.key}</Es>}
            <Es>{check}</Es>
          </p>
          {compact && (
            <button
              type="button"
              onClick={() => fold(false)}
              data-es="Show details"
              className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:underline"
            >
              Show details <ChevronDown size={14} />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={close}
          aria-label="Close until the next clock change"
          title="Close until the next clock change"
          className="absolute right-3 top-3 rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
        >
          <X size={16} />
        </button>
      </div>

      {!compact && (
        <>
          <div className="grid gap-4 px-4 pb-4 pt-2">
            <div>
              <div className="overflow-x-auto">
                <div className="grid min-w-[470px] grid-cols-[repeat(15,minmax(28px,1fr))] gap-[3px] pt-4">
                  {strip.map(({ d, c, isToday, past }) => {
                    const ring = c?.us && c?.local ? 'ring-2 ring-amber-500 ring-offset-1'
                      : c?.us ? 'ring-2 ring-inset ring-amber-500'
                      : c?.local ? 'ring-2 ring-inset ring-violet-500' : '';
                    const flag = isToday ? 'Today' : c?.us && c?.local ? 'Both' : c?.us ? 'US' : c?.local ? me.name : '';
                    return (
                      <div
                        key={d}
                        title={dayLabels(d, formatCalendarDate).en}
                        className={`relative grid justify-items-center rounded-lg py-1.5 tabular-nums ${ring} ${
                          isToday ? 'bg-brand-600 text-white' : 'bg-gray-50'
                        } ${past && !isToday ? 'opacity-50' : ''}`}
                      >
                        {flag && (
                          <span
                            className={`absolute -top-4 max-w-[72px] truncate text-[10px] font-bold uppercase tracking-wide ${
                              isToday ? 'text-brand-600' : c?.us ? 'text-amber-700' : 'text-violet-700'
                            }`}
                          >
                            {flag}
                          </span>
                        )}
                        <span className={`text-[10px] uppercase ${isToday ? 'text-white/80' : 'text-gray-400'}`}>
                          {WEEKDAY_NARROW.format(noonOf(d))}
                        </span>
                        <span className={`text-[13px] font-semibold ${isToday ? 'text-white' : 'text-gray-600'}`}>
                          {Number(d.slice(8))}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-amber-500" /><span data-es>US clocks change</span></span>
                {hasLocal && (
                  <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-violet-500" />Clocks in {me.name} change</span>
                )}
                <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-brand-600" /><span data-es>Today</span></span>
              </div>
            </div>

            <TimeZoneTool viewerTz={me.tz} change={change} changeLabel={formatCalendarDate(change.date)} />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-gray-100 bg-gray-50 px-4 py-3">
            <p className="text-xs text-gray-400">
              Shown because your time zone is {me.name}.{' '}
              <Link href="/dashboard/profile#time-zone" data-es="Change" className="font-medium text-brand-600 hover:underline">Change</Link>
              <Es vars={{ place: me.name }}>{'Shown because your time zone is {place}.'}</Es>
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => fold(true)}
                data-es="Show less"
                className="inline-flex items-center gap-1 px-1 py-1.5 text-sm font-semibold text-brand-600 hover:underline"
              >
                Show less <ChevronDown size={14} className="rotate-180" />
              </button>
              <button
                type="button"
                onClick={snooze}
                data-es="Remind me tomorrow"
                className="rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-sm font-semibold text-gray-700 transition hover:border-brand-500"
              >
                Remind me tomorrow
              </button>
              <button
                type="button"
                onClick={close}
                data-es="Got it"
                className="rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
              >
                Got it
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
