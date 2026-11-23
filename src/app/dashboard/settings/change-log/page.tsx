'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, ChevronDown, Download, Search } from 'lucide-react';
import { listSettingsChanges } from '@/lib/settingsChanges';
import { useDateFormatters } from '@/lib/useDateFormatters';
import { downloadCsv, toCsv } from '@/lib/csv';
import { AREA_LABEL, isSettingsArea, type SettingsArea, type SettingsChange } from '@/types/settingsChange';
import TrackedChanges from '@/components/settings/TrackedChanges';
import { EmptyState, Loading, Notice, SettingsCard } from '@/components/settings/kit/ui';
import { Bi } from '@/components/spanish/Es';

/**
 * Settings → Change log: every change to a company setting — who, when, and
 * what it was before. See src/types/settingsChange.ts.
 *
 * Drawn as a timeline, a day at a time, because it is read as a story ("what
 * happened to lane distance last week?") rather than searched like a table.
 * Each reader sees only the settings they could change themselves; the route
 * narrows it, never the page.
 *
 * `?area=` (from a page's "See history" link) opens it already filtered.
 */
export default function ChangeLogPage() {
  const { formatDateTime, formatDate } = useDateFormatters();
  const [entries, setEntries] = useState<SettingsChange[] | null>(null);
  const [error, setError] = useState('');
  const [areas, setAreas] = useState<SettingsArea[]>([]);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const wanted = (new URL(window.location.href).searchParams.get('area') ?? '').split(',').filter(isSettingsArea);
    setAreas(wanted);
    listSettingsChanges({ limit: 500 })
      .then(setEntries)
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load the change log'));
  }, []);

  const present = useMemo(() => [...new Set((entries ?? []).map((e) => e.area))], [entries]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (entries ?? []).filter((e) =>
      (areas.length === 0 || areas.includes(e.area))
      && (!q || `${e.summary} ${e.byName} ${e.byEmail} ${AREA_LABEL[e.area]} ${e.changes.map((c) => `${c.field} ${c.from} ${c.to}`).join(' ')}`.toLowerCase().includes(q)));
  }, [entries, areas, query]);

  // A day at a time, newest first, in the company's date format.
  const days = useMemo(() => {
    const out: { day: string; items: SettingsChange[] }[] = [];
    for (const e of shown) {
      const day = e.at ? e.at.slice(0, 10) : 'pending';
      const last = out[out.length - 1];
      if (last && last.day === day) last.items.push(e);
      else out.push({ day, items: [e] });
    }
    return out;
  }, [shown]);

  function exportCsv() {
    const rows = shown.flatMap((e) => (e.changes.length ? e.changes : [{ field: '', from: '', to: '' }]).map((c) => [
      e.at ?? '', AREA_LABEL[e.area], e.summary, e.byName, e.byEmail, c.field, c.from, c.to,
    ]));
    downloadCsv(`settings-changes-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsv([['When', 'Setting', 'What happened', 'By', 'By (email)', 'Field', 'Before', 'After'], ...rows]));
  }

  const toggleArea = (a: SettingsArea) => setAreas((list) => (list.includes(a) ? list.filter((x) => x !== a) : [...list, a]));

  return (
    <div className="space-y-4">
      <SettingsCard>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[14rem] flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input id="change-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search who, what or a value"
              className="w-full rounded-lg border border-gray-200 py-2 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
          </div>
          <button type="button" onClick={exportCsv} disabled={shown.length === 0}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50">
            <Download size={14} /> <span data-es>Export CSV</span>
          </button>
        </div>
        {present.length > 1 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {present.map((a) => (
              <button key={a} type="button" onClick={() => toggleArea(a)} aria-pressed={areas.includes(a)}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                  areas.includes(a) ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}>
                {AREA_LABEL[a]}
              </button>
            ))}
            {areas.length > 0 && (
              <button type="button" data-es onClick={() => setAreas([])} className="px-2 text-xs font-medium text-brand-700 hover:underline">Show everything</button>
            )}
          </div>
        )}
      </SettingsCard>

      {error && <Notice tone="red">{error}</Notice>}
      {!entries && !error ? <SettingsCard><Loading /></SettingsCard> : entries && shown.length === 0 ? (
        <SettingsCard>
          <EmptyState art="list" title={entries.length === 0 ? 'Nothing recorded yet' : 'Nothing matches'}
            body={entries.length === 0 ? 'The log starts with the first setting saved after it was switched on. Earlier changes were not recorded.' : 'Try fewer words, or show every setting.'} />
        </SettingsCard>
      ) : (
        <div className="space-y-6">
          {days.map(({ day, items }) => (
            <section key={day}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
                {day === 'pending' ? 'Just now' : formatDate(day)}
              </p>
              <ol className="relative space-y-3 border-l-2 border-gray-200 pl-6">
                {items.map((e) => <Entry key={e.id} entry={e} when={e.at ? formatDateTime(e.at) : ''} />)}
              </ol>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function Entry({ entry, when }: { entry: SettingsChange; when: string }) {
  const [open, setOpen] = useState(entry.changes.length <= 3);
  const name = entry.byName || entry.byEmail || 'Somebody';
  const letters = name.split(/[\s@.]+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const isText = entry.area === 'agreementTerms' && entry.changes.length === 1 && entry.changes[0].from.length > 160;

  return (
    <li className="relative rounded-xl border border-gray-200 bg-white p-4">
      <span className="absolute -left-[2.15rem] top-4 flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-[11px] font-bold text-white ring-4 ring-gray-50">
        {letters || '?'}
      </span>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-gray-800"><span className="font-semibold text-gray-900">{name}</span> · {entry.summary}</p>
        <p className="text-xs tabular-nums text-gray-400">{when.split(', ').pop()}</p>
      </div>
      <p className="mt-0.5 text-xs text-gray-400">{AREA_LABEL[entry.area]}</p>

      {entry.changes.length > 0 && (
        isText ? (
          <details className="mt-3">
            <summary data-es className="cursor-pointer text-sm font-medium text-brand-700">Compare wording</summary>
            <div className="mt-2"><TrackedChanges before={entry.changes[0].from} after={entry.changes[0].to} /></div>
          </details>
        ) : (
          <div className="mt-3">
            {!open && (
              <button type="button" onClick={() => setOpen(true)} className="flex items-center gap-1 text-xs font-medium text-brand-700">
                <ChevronDown size={13} /> <Bi vars={{ n: entry.changes.length }}>{'Show the {n} changes'}</Bi>
              </button>
            )}
            {open && (
              <ul className="space-y-1.5">
                {entry.changes.map((c, i) => (
                  <li key={i} className="text-sm">
                    <span className="text-xs text-gray-500">{c.field}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                      <span className="rounded bg-red-50 px-1.5 py-0.5 text-red-700 line-through decoration-red-300">{c.from}</span>
                      <ArrowRight size={12} className="text-gray-400" />
                      <span className="rounded bg-green-50 px-1.5 py-0.5 font-medium text-green-800">{c.to}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {entry.truncated && <p className="mt-2 text-xs text-gray-400"><Bi>More fields changed than are listed here.</Bi></p>}
          </div>
        )
      )}
    </li>
  );
}
