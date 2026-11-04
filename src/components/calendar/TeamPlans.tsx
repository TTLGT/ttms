'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarDays, CalendarRange, ChevronLeft, ChevronRight, GanttChart, List, Search, Table2, X,
} from 'lucide-react';
import { fetchTeamPlans } from '@/lib/dayPlans';
import { useDateFormatters } from '@/lib/useDateFormatters';
import { UserAvatar } from '@/components/settings/UserAvatar';
import { addDays } from '@/types/taskGame';
import { formatTime } from '@/types/task';
import {
  formatMinutes, itemLabel, itemSpan, mondayOf, planSummary,
  type DayPlan, type DayPlanItem, type TeamPlanPerson, type TeamPlansReply,
} from '@/types/dayPlan';

/**
 * Team plans: what the people the viewer may see planned, as they shared it.
 * Four ways of looking at the same copies — see src/types/dayPlan.ts.
 *
 * - Agenda: one card per person, their day in time order.
 * - Table: one row per person — when they shared, how much is planned, from
 *   when to when, and the task names.
 * - Timeline: people down the side, the hours of the day across, blocks
 *   where they planned something — who is on what at 10:30, and the gaps.
 * - Week: people down the side, Monday to Friday across, whether each day
 *   was shared and how much was planned. A square opens that day's agenda.
 *
 * The page asks for this only when the viewer could see anybody; the route
 * is what refuses everybody else.
 */

type View = 'agenda' | 'table' | 'timeline' | 'week';
const VIEW_KEY = 'ttms.teamPlans.view';

const VIEWS: { id: View; label: string; Icon: typeof List }[] = [
  { id: 'agenda', label: 'Agenda', Icon: List },
  { id: 'table', label: 'Table', Icon: Table2 },
  { id: 'timeline', label: 'Timeline', Icon: GanttChart },
  { id: 'week', label: 'Week', Icon: CalendarRange },
];

function storedView(): View {
  try {
    const v = window.localStorage.getItem(VIEW_KEY);
    return VIEWS.some((x) => x.id === v) ? (v as View) : 'agenda';
  } catch {
    return 'agenda';
  }
}

const itemTone = (item: DayPlanItem) => (item.busy
  ? 'border-gray-200 bg-gray-100 text-gray-500'
  : item.kind === 'task'
    ? 'border-brand-200 bg-brand-50 text-brand-800'
    : 'border-sky-200 bg-sky-50 text-sky-800');

function isWeekend(date: string): boolean {
  const d = new Date(`${date}T00:00:00Z`).getUTCDay();
  return d === 0 || d === 6;
}

export default function TeamPlans({ initialDate }: { initialDate: string }) {
  const { formatCalendarDate, formatDateTime } = useDateFormatters();
  const [view, setView] = useState<View>('agenda');
  const [date, setDate] = useState(initialDate);
  const [data, setData] = useState<TeamPlansReply | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [team, setTeam] = useState('');
  const [query, setQuery] = useState('');
  const [sharedOnly, setSharedOnly] = useState(false);

  useEffect(() => { setView(storedView()); }, []);
  const pickView = (v: View) => {
    setView(v);
    try { window.localStorage.setItem(VIEW_KEY, v); } catch { /* a remembered tab is a convenience */ }
  };

  // The week view reads Monday to Friday of the chosen day's week in one
  // request; the others read the one day.
  const monday = mondayOf(date);
  const range = view === 'week' ? { from: monday, to: addDays(monday, 4) } : { from: date, to: date };

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await fetchTeamPlans(range.from, range.to));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load team plans.');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from, range.to]);
  useEffect(() => { load(); }, [load]);

  const people = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.people.filter((p) =>
      (!team || p.teamId === team)
      && (!q || p.name.toLowerCase().includes(q) || p.email.includes(q))
      && (!sharedOnly || (view === 'week'
        ? Object.keys(data.plans[p.uid] ?? {}).length > 0
        : !!data.plans[p.uid]?.[date])));
  }, [data, team, query, sharedOnly, view, date]);

  const planOf = (p: TeamPlanPerson, d: string = date): DayPlan | null => data?.plans[p.uid]?.[d] ?? null;
  const teamName = (id: string | null) => data?.teams.find((t) => t.id === id)?.name ?? '';
  const sharedCount = data ? data.people.filter((p) => !!data.plans[p.uid]?.[date]).length : 0;

  const step = (n: number) => {
    let d = addDays(date, view === 'week' ? n * 7 : n);
    // Day by day, the weekend is stepped over: nobody plans it.
    if (view !== 'week') while (isWeekend(d)) d = addDays(d, n);
    setDate(d);
  };

  const person = (p: TeamPlanPerson, size = 28) => (
    <div className="flex min-w-0 items-center gap-2">
      <UserAvatar photoPath={p.photoPath} fallback={p.name.charAt(0).toUpperCase()} size={size} name={p.name} />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-gray-900">{p.name}</p>
        {teamName(p.teamId) && <p className="truncate text-xs text-gray-500">{teamName(p.teamId)}</p>}
      </div>
    </div>
  );

  const notShared = <span className="text-xs italic text-gray-400">Not shared yet</span>;

  // ── Agenda ──
  const agenda = (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {people.map((p) => {
        const plan = planOf(p);
        const sum = plan ? planSummary(plan.items) : null;
        return (
          <section key={p.uid} className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex items-start justify-between gap-2">
              {person(p, 32)}
              {plan && sum && (
                <span className="shrink-0 text-right text-xs text-gray-500">
                  {formatMinutes(sum.minutes)} planned
                </span>
              )}
            </div>
            {!plan ? (
              <p className="mt-3">{notShared}</p>
            ) : plan.items.length === 0 ? (
              <p className="mt-3 text-xs text-gray-500">Shared an empty plan.</p>
            ) : (
              <ol className="mt-3 space-y-1.5">
                {plan.items.map((item, i) => (
                  <li key={i} className={`flex items-start gap-2 rounded-md border px-2 py-1.5 text-sm ${itemTone(item)}`}>
                    <span className="w-28 shrink-0 text-xs tabular-nums opacity-80">
                      {item.start
                        ? `${formatTime(item.start)}${item.end ? ` – ${formatTime(item.end)}` : ''}`
                        : 'Any time'}
                    </span>
                    <span className={`min-w-0 flex-1 ${item.busy ? 'italic' : ''}`}>{item.title}</span>
                    <span className="shrink-0 text-[11px] opacity-70">{itemLabel(item)}</span>
                  </li>
                ))}
              </ol>
            )}
            {plan && <p className="mt-2 text-[11px] text-gray-400">Shared {formatDateTime(plan.sharedAt)}</p>}
          </section>
        );
      })}
    </div>
  );

  // ── Table ──
  const table = (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-3 py-2">Person</th>
            <th className="px-3 py-2">Shared</th>
            <th className="px-3 py-2 text-right">Items</th>
            <th className="px-3 py-2 text-right">Planned</th>
            <th className="px-3 py-2">From – to</th>
            <th className="px-3 py-2">What they planned</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {people.map((p) => {
            const plan = planOf(p);
            const sum = plan ? planSummary(plan.items) : null;
            return (
              <tr key={p.uid} className="align-top">
                <td className="px-3 py-2">{person(p)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-600">
                  {plan ? formatDateTime(plan.sharedAt) : notShared}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{sum ? sum.count : ''}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{sum ? formatMinutes(sum.minutes) : ''}</td>
                <td className="whitespace-nowrap px-3 py-2 text-xs tabular-nums text-gray-600">
                  {sum?.first && sum.last ? `${formatTime(sum.first)} – ${formatTime(sum.last)}` : ''}
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {plan?.items.map((item, i) => (
                      <span key={i} className={`rounded border px-1.5 py-0.5 text-xs ${itemTone(item)}`}
                        title={item.start ? `${formatTime(item.start)}${item.end ? ` – ${formatTime(item.end)}` : ''}` : 'Any time'}>
                        {item.start && <span className="mr-1 tabular-nums opacity-70">{formatTime(item.start)}</span>}
                        {item.title}
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  // ── Timeline ──
  // 7am to 6pm unless somebody planned outside it, rounded out to the hour.
  const bounds = useMemo(() => {
    let from = 7 * 60;
    let to = 18 * 60;
    for (const p of people) {
      for (const item of planOf(p)?.items ?? []) {
        const s = itemSpan(item);
        if (s) { from = Math.min(from, s.from); to = Math.max(to, s.to); }
      }
    }
    return { from: Math.floor(from / 60) * 60, to: Math.min(24 * 60, Math.ceil(to / 60) * 60) };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [people, data, date]);
  const hours = useMemo(() => {
    const out: number[] = [];
    for (let m = bounds.from; m < bounds.to; m += 60) out.push(m);
    return out;
  }, [bounds]);
  const pct = (m: number) => `${((m - bounds.from) / (bounds.to - bounds.from)) * 100}%`;
  const nowLine = data && date === data.today ? (() => {
    // Office time is UTC−6 all year; see OFFICE_UTC_OFFSET_MINUTES.
    const d = new Date(Date.now() - 6 * 60 * 60 * 1000);
    const m = d.getUTCHours() * 60 + d.getUTCMinutes();
    return m >= bounds.from && m <= bounds.to ? m : null;
  })() : null;

  const timeline = (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <div className="min-w-[760px]">
        <div className="flex border-b border-gray-100 text-[11px] text-gray-500">
          <div className="w-48 shrink-0 px-3 py-2 font-medium uppercase tracking-wide">Person</div>
          <div className="relative flex-1">
            {hours.map((m) => (
              <span key={m} className="absolute top-2 -translate-x-1/2" style={{ left: pct(m) }}>
                {formatTime(`${String(m / 60).padStart(2, '0')}:00`).replace(':00 ', ' ')}
              </span>
            ))}
          </div>
        </div>
        {people.map((p) => {
          const plan = planOf(p);
          const timed = (plan?.items ?? []).filter((i) => i.start);
          const anytime = (plan?.items ?? []).length - timed.length;
          // Overlapping blocks go on a second lane rather than on top of each other.
          const lanes: number[] = [];
          const placed = timed.map((item) => {
            const s = itemSpan(item)!;
            let lane = lanes.findIndex((end) => end <= s.from);
            if (lane < 0) { lane = lanes.length; lanes.push(0); }
            lanes[lane] = s.to;
            return { item, s, lane };
          });
          const laneCount = Math.max(1, lanes.length);
          return (
            <div key={p.uid} className="flex border-b border-gray-100 last:border-0">
              <div className="w-48 shrink-0 px-3 py-2">
                {person(p, 24)}
                {anytime > 0 && <p className="mt-0.5 text-[11px] text-gray-400">+{anytime} any time</p>}
              </div>
              <div className="relative flex-1" style={{ height: 12 + laneCount * 30 }}>
                {hours.map((m) => (
                  <span key={m} className="absolute inset-y-0 border-l border-gray-100" style={{ left: pct(m) }} />
                ))}
                {nowLine !== null && (
                  <span className="absolute inset-y-0 z-10 border-l-2 border-red-400" style={{ left: pct(nowLine) }} />
                )}
                {!plan && <span className="absolute left-2 top-2">{notShared}</span>}
                {placed.map(({ item, s, lane }, i) => (
                  <div key={i}
                    title={`${formatTime(item.start)}${item.end ? ` – ${formatTime(item.end)}` : ''} · ${item.title}`}
                    className={`absolute overflow-hidden truncate rounded border px-1.5 text-[11px] leading-[26px] ${itemTone(item)} ${item.busy ? 'italic' : ''}`}
                    style={{ left: pct(s.from), width: `calc(${pct(s.to)} - ${pct(s.from)} - 2px)`, top: 6 + lane * 30, height: 28 }}>
                    {item.title}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  // ── Week ──
  const weekDays = [0, 1, 2, 3, 4].map((n) => addDays(monday, n));
  const week = (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-3 py-2">Person</th>
            {weekDays.map((d) => (
              <th key={d} className={`px-3 py-2 ${d === data?.today ? 'text-brand-700' : ''}`}>{formatCalendarDate(d)}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {people.map((p) => (
            <tr key={p.uid}>
              <td className="px-3 py-2">{person(p)}</td>
              {weekDays.map((d) => {
                const plan = planOf(p, d);
                const sum = plan ? planSummary(plan.items) : null;
                return (
                  <td key={d} className="px-1.5 py-1.5">
                    <button type="button" onClick={() => { setDate(d); pickView('agenda'); }}
                      className={`w-full rounded-md border px-2 py-1.5 text-left text-xs hover:border-brand-300 ${
                        plan ? 'border-green-200 bg-green-50 text-green-800' : 'border-gray-100 text-gray-400'
                      }`}>
                      {plan && sum ? (
                        <>
                          <span className="block font-medium">{formatMinutes(sum.minutes)} · {sum.count} item{sum.count === 1 ? '' : 's'}</span>
                          {sum.first && sum.last && (
                            <span className="block tabular-nums opacity-80">{formatTime(sum.first)} – {formatTime(sum.last)}</span>
                          )}
                        </>
                      ) : d > (data?.today ?? '') ? 'Not yet' : 'Not shared'}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5">
          {VIEWS.map(({ id, label, Icon }) => (
            <button key={id} type="button" aria-pressed={view === id} onClick={() => pickView(id)}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium ${
                view === id ? 'bg-brand-600 text-white' : 'text-gray-600 hover:bg-gray-50'
              }`}>
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>

        <div className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-0.5">
          <button type="button" onClick={() => step(-1)} aria-label="Earlier" className="rounded-md p-1.5 text-gray-600 hover:bg-gray-50">
            <ChevronLeft size={14} />
          </button>
          <span className="min-w-[9rem] px-1 text-center text-sm font-medium text-gray-800">
            {view === 'week'
              ? `Week of ${formatCalendarDate(monday)}`
              : formatCalendarDate(date)}
          </span>
          <button type="button" onClick={() => step(1)} aria-label="Later" className="rounded-md p-1.5 text-gray-600 hover:bg-gray-50">
            <ChevronRight size={14} />
          </button>
          {data && date !== data.today && (
            <button type="button" onClick={() => setDate(data.today)}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50">
              <CalendarDays size={12} /> Today
            </button>
          )}
        </div>

        {data && data.teams.length > 1 && (
          <select value={team} onChange={(e) => setTeam(e.target.value)}
            className="rounded-lg border-gray-200 py-1.5 text-sm text-gray-700 focus:border-brand-500 focus:ring-brand-500">
            <option value="">All teams</option>
            {data.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}

        <label className="relative">
          <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a person"
            className="w-44 rounded-lg border-gray-200 py-1.5 pl-7 text-sm focus:border-brand-500 focus:ring-brand-500" />
        </label>

        <label className="flex items-center gap-1.5 text-xs text-gray-600">
          <input type="checkbox" checked={sharedOnly} onChange={(e) => setSharedOnly(e.target.checked)}
            className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
          Shared only
        </label>

        {data && view !== 'week' && (
          <span className="ml-auto text-xs text-gray-500">
            {sharedCount} of {data.people.length} shared
          </span>
        )}
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <span className="flex-1">{error}</span>
          <button type="button" onClick={() => setError('')} aria-label="Dismiss"><X size={14} /></button>
        </div>
      )}

      {loading && !data ? (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
        </div>
      ) : !data ? null : people.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
          {sharedOnly ? 'Nobody has shared a plan for this day yet.' : 'Nobody matches.'}
        </p>
      ) : (
        <div className={loading ? 'opacity-60' : ''}>
          {view === 'agenda' && agenda}
          {view === 'table' && table}
          {view === 'timeline' && timeline}
          {view === 'week' && week}
        </div>
      )}

      <p className="mt-4 text-xs text-gray-400">
        Each plan is what the person shared when they finished their planning, as a copy — names and times only.
        It does not change when they tick things off, and it does not say whether they did them.
        Items they marked Busy show the time without the name.
      </p>
    </div>
  );
}
