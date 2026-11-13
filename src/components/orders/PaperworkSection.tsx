'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight, History, LayoutList, ListTodo, Loader2, Search, ShieldCheck } from 'lucide-react';
import { listPaperwork } from '@/lib/paperworkClient';
import { listSaRounds } from '@/lib/saRequests';
import { useDateFormatters } from '@/lib/useDateFormatters';
import {
  PAPERWORK_KIND_LABEL, PAPERWORK_KIND_SHORT, PAPERWORK_STATUS_LABEL, agreementEvents, bolEvents, isPaperworkOpen,
  paperworkRows, type PaperworkEvent, type PaperworkKind, type PaperworkResponse, type PaperworkRow, type PaperworkStatus,
} from '@/types/paperwork';

/**
 * The Agreements and BOLs card on the Approvals screen (2026-11-13) — the
 * Shipper Agreements, Dispatch Sheets and BOLs that used to be two cards
 * ("Agreements to send", "BOLs to send"), now one list with three views on a
 * switch like the Route card's:
 *
 *  - To do: everything still in play, the longest-waiting first, each saying
 *    how long it has waited. Sent-back agreements stay here (they vanished
 *    before), and anything on a load that has ended drops out as Closed.
 *  - History: every step in a date range, newest first, grouped by day.
 *  - By load: one line per load with where its SA, Dispatch Sheet and BOL stand.
 *
 * Opening a row shows its story — asked, sent back and why, asked again,
 * sent, done — from the load's saved rounds. The list reloads every minute
 * while the screen is in view, and whenever the person comes back to it.
 *
 * The data and the rules (what counts as closed, what each row says) are in
 * src/types/paperwork.ts; the query in src/app/api/approvals/paperwork.
 */

type View = 'todo' | 'history' | 'loads';
type Preset = '7' | '30' | '90' | 'all' | 'custom';

const VIEW_KEY = 'ttms-approvals-view';
const DAY = 24 * 60 * 60 * 1000;
const REFRESH_MS = 60 * 1000;

const KIND_TAG: Record<PaperworkKind, string> = {
  sa:  'bg-purple-50 text-purple-700',
  ds:  'bg-orange-50 text-orange-700',
  bol: 'bg-teal-50 text-teal-700',
};

const STATUS_PILL: Record<PaperworkStatus, string> = {
  open:     'bg-brand-50 text-brand-700 border-brand-200',
  sent:     'bg-blue-50 text-blue-700 border-blue-200',
  returned: 'bg-amber-50 text-amber-800 border-amber-200',
  done:     'bg-green-50 text-green-700 border-green-200',
  closed:   'bg-gray-100 text-gray-600 border-gray-200',
};

const EVENT_DOT: Record<PaperworkEvent['tone'], string> = {
  open:     'border-brand-500 bg-white',
  sent:     'border-blue-500 bg-white',
  returned: 'border-amber-500 bg-amber-100',
  done:     'border-green-600 bg-green-500',
};

const STATUS_CHIPS: Record<View, PaperworkStatus[]> = {
  todo:    ['open', 'sent', 'returned'],
  history: ['open', 'sent', 'returned', 'done', 'closed'],
  loads:   [],
};

function readView(): View {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    return v === 'history' || v === 'loads' ? v : 'todo';
  } catch {
    return 'todo';
  }
}

/** 'YYYY-MM-DD' in the browser's own day. */
function dayInput(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function rangeOf(preset: Preset, fromDay: string, toDay: string, now: number): { from: number; to: number } {
  if (preset === 'custom') {
    const from = new Date(`${fromDay}T00:00:00`).getTime();
    const to = new Date(`${toDay}T23:59:59.999`).getTime();
    if (Number.isFinite(from) && Number.isFinite(to) && from <= to) return { from, to };
  }
  if (preset === 'all') return { from: 0, to: now };
  return { from: now - Number(preset === 'custom' ? '30' : preset) * DAY, to: now };
}

export default function PaperworkSection() {
  const { formatDate, formatDateTime } = useDateFormatters();
  const [view, setViewState] = useState<View>('todo');
  useEffect(() => { setViewState(readView()); }, []);
  const setView = (v: View) => {
    setViewState(v);
    setStatusFilter(new Set());
    try { localStorage.setItem(VIEW_KEY, v); } catch { /* the default shows next time */ }
  };

  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<PaperworkKind | ''>('');
  const [statusFilter, setStatusFilter] = useState<Set<PaperworkStatus>>(new Set());
  const [preset, setPreset] = useState<Preset>('30');
  const [fromDay, setFromDay] = useState(() => dayInput(Date.now() - 30 * DAY));
  const [toDay, setToDay] = useState(() => dayInput(Date.now()));

  const [data, setData] = useState<PaperworkResponse | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  const load = useCallback(async (quiet: boolean) => {
    if (!quiet) setLoading(true);
    try {
      const { from, to } = rangeOf(preset, fromDay, toDay, Date.now());
      setData(await listPaperwork(from, to));
      setUpdatedAt(Date.now());
      setError('');
    } catch (e) {
      // A failed background refresh keeps the list it has; say so only when there is none.
      if (!quiet) setError(e instanceof Error ? e.message : 'Could not load the agreements and BOLs');
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [preset, fromDay, toDay]);

  useEffect(() => { void load(false); }, [load]);

  // Keep up with what other people do: every minute while in view, and on coming back.
  useEffect(() => {
    const tick = () => { if (document.visibilityState === 'visible') void load(true); };
    const timer = window.setInterval(tick, REFRESH_MS);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('focus', tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
      window.removeEventListener('focus', tick);
    };
  }, [load]);

  // "Updated 2 min ago" needs a clock of its own.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30 * 1000);
    return () => window.clearInterval(t);
  }, []);

  const rows = useMemo(() => (data ? paperworkRows(data) : []), [data]);
  const range = data ? { from: data.from, to: data.to } : null;

  const q = query.trim().toLowerCase();
  const matches = useCallback((r: PaperworkRow) =>
    (!kind || r.kind === kind) && (!q || r.search.includes(q)), [kind, q]);
  const byStatus = (r: PaperworkRow) => statusFilter.size === 0 || statusFilter.has(r.status);
  const inRange = (r: PaperworkRow) => !range || (r.at >= range.from && r.at <= range.to);

  const todoRows = rows.filter((r) => isPaperworkOpen(r.status));
  const todoCount = todoRows.length;

  // Opening a row: its story, loaded once per version of the row.
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [stories, setStories] = useState<Record<string, PaperworkEvent[] | 'loading' | 'error'>>({});
  const storyKey = (r: PaperworkRow) => `${r.key}@${r.at}`;
  const asked = useRef(new Set<string>());

  function toggle(r: PaperworkRow) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(r.key)) next.delete(r.key); else next.add(r.key);
      return next;
    });
  }

  useEffect(() => {
    for (const r of rows) {
      if (!open.has(r.key)) continue;
      const k = storyKey(r);
      if (asked.current.has(k)) continue;
      asked.current.add(k);
      if (r.bol) {
        setStories((s) => ({ ...s, [k]: bolEvents(r.bol!) }));
      } else if (r.sa) {
        const sa = r.sa;
        setStories((s) => ({ ...s, [k]: 'loading' }));
        listSaRounds(sa.orderId, sa.party)
          .then((rounds) => setStories((s) => ({ ...s, [k]: agreementEvents(rounds, sa) })))
          // The load may be one this person cannot open; what the row itself knows still tells most of it.
          .catch(() => setStories((s) => ({ ...s, [k]: agreementEvents([], sa) })));
      }
    }
  }, [rows, open]);

  if (error && !data) return <p className="text-sm text-red-600 mb-6">{error}</p>;
  if (data && !data.isReviewer && data.agreements.length === 0) return null;

  const isReviewer = data?.isReviewer ?? true;
  const chips = STATUS_CHIPS[view];

  function ageLine(r: PaperworkRow) {
    if (r.status === 'closed') return <span className="text-[11px] text-gray-500">{r.closedBecause}</span>;
    if (!isPaperworkOpen(r.status)) return <span className="text-[11px] text-gray-500">{formatDateTime(new Date(r.at))}</span>;
    const days = Math.floor((now - r.since) / DAY);
    const late = days >= 2 && r.status !== 'returned';
    const text = r.status === 'returned'
      ? (days === 0 ? 'With the broker since today' : `With the broker ${days} day${days === 1 ? '' : 's'}`)
      : (days === 0 ? 'Since today' : `Waiting ${days} day${days === 1 ? '' : 's'}`);
    return (
      <span title={formatDateTime(new Date(r.since))} className={`text-[11px] ${late ? 'font-semibold text-red-600' : 'text-gray-500'}`}>
        {text}
      </span>
    );
  }

  function story(r: PaperworkRow) {
    const s = stories[storyKey(r)];
    return (
      <div className="col-span-full mb-2 ml-3 mt-1 border-l-2 border-gray-200 pl-5">
        {s === undefined || s === 'loading' ? (
          <p className="flex items-center gap-1.5 py-1 text-xs text-gray-500"><Loader2 className="h-3.5 w-3.5 animate-spin" /> <span data-es>Loading its history…</span></p>
        ) : s === 'error' || s.length === 0 ? (
          <p data-es className="py-1 text-xs text-gray-500">No history saved for this one.</p>
        ) : (
          <ol className="space-y-2.5 py-1">
            {s.map((e, i) => (
              <li key={i} className="relative text-[13px]">
                <span className={`absolute -left-[27px] top-1 h-2.5 w-2.5 rounded-full border-2 ${EVENT_DOT[e.tone]}`} aria-hidden />
                <span className="font-medium text-gray-900">{e.title}</span>
                <span className="ml-2 text-xs text-gray-500">{formatDateTime(new Date(e.at))}</span>
                {e.detail && <span className="block text-xs text-gray-600">{e.detail}</span>}
              </li>
            ))}
            {r.status === 'closed' && (
              <li className="relative text-[13px]">
                <span className="absolute -left-[27px] top-1 h-2.5 w-2.5 rounded-full border-2 border-gray-400 bg-gray-300" aria-hidden />
                <span className="font-medium text-gray-900">Closed: {r.closedBecause?.toLowerCase()}</span>
                <span className="block text-xs text-gray-600" data-es>Nothing more to do on it unless the load opens again.</span>
              </li>
            )}
          </ol>
        )}
        <Link href={`/dashboard/orders/${r.orderId}`} className="mb-1 inline-block text-xs font-medium text-brand-600 hover:text-brand-700">
          <span data-es>Open the load</span> →
        </Link>
      </div>
    );
  }

  function rowItem(r: PaperworkRow) {
    const isOpen = open.has(r.key);
    return (
      <li key={r.key} className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 border-t border-gray-100 first:border-t-0">
        <Link href={`/dashboard/orders/${r.orderId}`} title="Open the load"
          className="font-mono text-sm font-semibold text-gray-900 hover:text-brand-600 hover:underline">
          {r.orderNumber}
        </Link>
        <button type="button" onClick={() => toggle(r)} aria-expanded={isOpen}
          className="-mr-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 rounded px-2 py-2.5 text-left hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500 sm:flex-nowrap">
          <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold ${KIND_TAG[r.kind]}`}>{PAPERWORK_KIND_LABEL[r.kind]}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm text-gray-800">{r.name || '—'}</span>
            <span className={`block truncate text-xs ${r.status === 'returned' ? 'text-amber-700' : 'text-gray-500'}`}>{r.line}</span>
          </span>
          <span className="flex shrink-0 flex-col items-end gap-0.5">
            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${STATUS_PILL[r.status]}`}>
              {r.status === 'closed' ? `Closed: ${r.closedBecause?.toLowerCase()}` : PAPERWORK_STATUS_LABEL[r.status]}
            </span>
            {ageLine(r)}
          </span>
          {isOpen ? <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" /> : <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />}
        </button>
        {isOpen && story(r)}
      </li>
    );
  }

  let body: ReactNode;
  if (!data) {
    body = <p className="flex items-center gap-1.5 py-3 text-sm text-gray-400"><Loader2 className="h-4 w-4 animate-spin" /> <span data-es>Loading…</span></p>;
  } else if (view === 'todo') {
    const list = todoRows.filter((r) => matches(r) && byStatus(r)).sort((a, b) => a.since - b.since);
    body = list.length
      ? <><p data-es className="pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Waiting longest first</p><ul>{list.map(rowItem)}</ul></>
      : <p data-es className="py-3 text-sm text-gray-400">Nothing waiting.</p>;
  } else if (view === 'history') {
    const list = rows.filter((r) => inRange(r) && matches(r) && byStatus(r)).sort((a, b) => b.at - a.at);
    const today = formatDate(new Date(now));
    let lastDay = '';
    body = list.length ? (
      <ul>
        {list.map((r) => {
          const day = formatDate(new Date(r.at));
          const head = day !== lastDay;
          lastDay = day;
          return (
            <Fragment key={r.key}>
              {head && (
                <li className="pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wide text-gray-400 first:pt-2">
                  {day === today ? `Today · ${day}` : day}
                </li>
              )}
              {rowItem(r)}
            </Fragment>
          );
        })}
      </ul>
    ) : <p data-es className="py-3 text-sm text-gray-400">Nothing in this date range. Try a wider one.</p>;
  } else {
    const groups = new Map<string, PaperworkRow[]>();
    for (const r of rows) {
      if (!(inRange(r) || isPaperworkOpen(r.status)) || !(!q || r.search.includes(q))) continue;
      groups.set(r.orderId, [...(groups.get(r.orderId) ?? []), r]);
    }
    const loads = [...groups.values()].sort((a, b) => Math.max(...b.map((x) => x.at)) - Math.max(...a.map((x) => x.at)));
    body = loads.length ? (
      <ul>
        {loads.map((rs) => {
          const first = rs.find((x) => x.kind === 'sa') ?? rs[0];
          const latest = Math.max(...rs.map((x) => x.at));
          return (
            <li key={first.orderId} className="grid grid-cols-1 items-center gap-x-4 gap-y-1.5 border-t border-gray-100 py-2.5 first:border-t-0 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
              <Link href={`/dashboard/orders/${first.orderId}`} className="font-mono text-sm font-semibold text-gray-900 hover:text-brand-600 hover:underline">
                {first.orderNumber}
              </Link>
              <span className="min-w-0">
                <span className="block truncate text-sm text-gray-800">{first.kind === 'bol' ? first.name : (rs.find((x) => x.kind === 'sa')?.name ?? first.name)}</span>
                <span className="mt-1 flex flex-wrap gap-1">
                  {(['sa', 'ds', 'bol'] as PaperworkKind[]).map((k) => {
                    const r = rs.find((x) => x.kind === k);
                    return (
                      <span key={k} className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${r ? STATUS_PILL[r.status] : 'border-gray-200 text-gray-400'}`}>
                        {PAPERWORK_KIND_SHORT[k]} · {r ? (r.status === 'closed' ? 'Closed' : PAPERWORK_STATUS_LABEL[r.status]) : 'Not started'}
                      </span>
                    );
                  })}
                </span>
              </span>
              <span className="text-[11px] text-gray-500">{formatDateTime(new Date(latest))}</span>
            </li>
          );
        })}
      </ul>
    ) : <p data-es className="py-3 text-sm text-gray-400">No loads in this date range.</p>;
  }

  const views: { id: View; label: string; Icon: typeof ListTodo }[] = [
    { id: 'todo', label: 'To do', Icon: ListTodo },
    { id: 'history', label: 'History', Icon: History },
    { id: 'loads', label: 'By load', Icon: LayoutList },
  ];
  const minutes = updatedAt ? Math.floor((now - updatedAt) / 60000) : null;

  return (
    <section className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-brand-600" />
          <span data-es>{isReviewer ? 'Agreements and BOLs' : 'Your agreement requests'}</span>
        </h2>
        <div role="group" aria-label="Show" className="inline-flex gap-0.5 rounded-lg border border-gray-200 bg-gray-50 p-0.5">
          {views.map(({ id, label, Icon }) => {
            const on = view === id;
            return (
              <button key={id} type="button" aria-pressed={on} title={label} data-es={label} onClick={() => setView(id)}
                className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition ${
                  on ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}>
                <Icon className="h-3.5 w-3.5" />
                <span>{label}</span>
                {id === 'todo' && data && (
                  <span className="rounded-full bg-brand-50 px-1.5 text-[10px] font-semibold text-brand-700">{todoCount}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
      <p className="text-xs text-gray-500 mt-1">
        <span data-es>
          {isReviewer
            ? 'Shipper Agreement (SA)s, Dispatch Sheets and BOLs. Open a row to see everything that happened to it; open the load to do the work.'
            : 'Where each request you made stands. Open a row to see everything that happened to it.'}
        </span>
        {minutes !== null && (
          <span className="ml-1 text-gray-400">
            {loading ? ' · Updating…' : minutes < 1 ? ' · Updated just now' : ` · Updated ${minutes} min ago`}
          </span>
        )}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="relative min-w-0 flex-[1_1_220px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <input id="paperwork-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search load #, client, carrier, person…" aria-label="Search"
            className="w-full rounded-lg border border-gray-200 bg-gray-50 py-1.5 pl-8 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-400 focus:outline-none" />
        </label>
        {isReviewer && (
          <select id="paperwork-kind" value={kind} onChange={(e) => setKind(e.target.value as PaperworkKind | '')} aria-label="Type"
            className="rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-sm text-gray-900">
            <option value="">All types</option>
            <option value="sa">{PAPERWORK_KIND_LABEL.sa}</option>
            <option value="ds">{PAPERWORK_KIND_LABEL.ds}</option>
            <option value="bol">{PAPERWORK_KIND_LABEL.bol}</option>
          </select>
        )}
        {view !== 'todo' && (
          <>
            <select id="paperwork-range" value={preset} onChange={(e) => setPreset(e.target.value as Preset)} aria-label="Date range"
              className="rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-sm text-gray-900">
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
              <option value="all">All time</option>
              <option value="custom">Pick dates…</option>
            </select>
            {preset === 'custom' && (
              <span className="flex items-center gap-1.5 text-xs text-gray-500">
                <input id="paperwork-from" type="date" value={fromDay} max={toDay} onChange={(e) => setFromDay(e.target.value)} aria-label="From"
                  className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 text-sm text-gray-900" />
                <span data-es>to</span>
                <input id="paperwork-to" type="date" value={toDay} min={fromDay} onChange={(e) => setToDay(e.target.value)} aria-label="To"
                  className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 text-sm text-gray-900" />
              </span>
            )}
          </>
        )}
      </div>

      {chips.length > 0 && (
        <div role="group" aria-label="Status" className="mt-2 flex flex-wrap gap-1.5">
          {chips.map((s) => {
            const on = statusFilter.has(s);
            return (
              <button key={s} type="button" aria-pressed={on} data-es={PAPERWORK_STATUS_LABEL[s]}
                onClick={() => setStatusFilter((prev) => {
                  const next = new Set(prev);
                  if (next.has(s)) next.delete(s); else next.add(s);
                  return next;
                })}
                className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition ${
                  on ? 'border-brand-600 bg-brand-600 text-white' : 'border-gray-200 text-gray-600 hover:border-gray-400'}`}>
                {PAPERWORK_STATUS_LABEL[s]}
              </button>
            );
          })}
        </div>
      )}

      {error && data && <p className="mt-2 text-xs text-red-600">{error}</p>}
      <div className="mt-1">{body}</div>
    </section>
  );
}
