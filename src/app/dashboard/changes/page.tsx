'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, History, Search, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useDateFormatters } from '@/lib/useDateFormatters';
import DateField from '@/components/DateField';
import { listChanges } from '@/lib/changelog';
import {
  CHANGE_TYPES,
  CHANGE_TYPE_LABEL,
  canSeeChangelog,
  type Change,
  type ChangeType,
} from '@/types/changelog';

/**
 * Change history: every change made to TTMS, newest first, for the IT role
 * account only — see src/types/changelog.ts.
 *
 * Searched entirely in the browser: the route hands over the whole list once,
 * and filtering a few hundred entries per keystroke is instant. Every word in
 * the search box must appear somewhere in the change (title, description,
 * author or commit id), in any order, so "chat search" finds "Add a search
 * inside a single chat".
 *
 * The page checks the address too, but only to avoid a request it knows will
 * be refused. The route is the gate.
 */

const TYPE_STYLE: Record<ChangeType, string> = {
  feature:     'bg-green-50 text-green-700',
  improvement: 'bg-blue-50 text-blue-700',
  fix:         'bg-amber-50 text-amber-700',
  security:    'bg-red-50 text-red-700',
  maintenance: 'bg-gray-100 text-gray-600',
};

/**
 * A commit body is wrapped by hand at about 72 characters, which reads as a
 * ragged column in a wider box. Blank lines are the real paragraph breaks;
 * any other line break is joined back up — except before a list item, which
 * keeps its own line.
 */
function paragraphs(body: string): string[] {
  return body
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\n(?!\s*(?:[-*•]|\d+\.)\s)/g, ' ').trim())
    .filter(Boolean);
}

export default function ChangeHistoryPage() {
  const { user } = useAuth();
  const { formatDate, formatDateTime } = useDateFormatters();
  const allowed = canSeeChangelog(user?.email);

  const [changes, setChanges] = useState<Change[] | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [types, setTypes] = useState<Set<ChangeType>>(new Set());
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [open, setOpen] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!allowed) return;
    let live = true;
    listChanges()
      .then((list) => { if (live) setChanges(list); })
      .catch((e: Error) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [allowed]);

  const counts = useMemo(() => {
    const out = Object.fromEntries(CHANGE_TYPES.map((t) => [t, 0])) as Record<ChangeType, number>;
    for (const c of changes ?? []) out[c.type] += 1;
    return out;
  }, [changes]);

  const shown = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return (changes ?? []).filter((c) => {
      if (types.size > 0 && !types.has(c.type)) return false;
      // `day` and the fields are both YYYY-MM-DD, so a string compare is a date compare.
      if (from && c.day < from) return false;
      if (to && c.day > to) return false;
      if (words.length === 0) return true;
      const hay = `${c.subject}\n${c.body}\n${c.author}\n${c.hash}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [changes, query, types, from, to]);

  const filtering = query.trim() !== '' || types.size > 0 || from !== '' || to !== '';

  const toggleType = (t: ChangeType) =>
    setTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t); else next.add(t);
      return next;
    });

  const toggleOpen = (hash: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(hash)) next.delete(hash); else next.add(hash);
      return next;
    });

  const clear = () => { setQuery(''); setTypes(new Set()); setFrom(''); setTo(''); };

  // Grouped by day for reading; the groups follow the list's newest-first order.
  const byDay = useMemo(() => {
    const groups: { day: string; items: Change[] }[] = [];
    for (const c of shown) {
      const last = groups[groups.length - 1];
      if (last && last.day === c.day) last.items.push(c);
      else groups.push({ day: c.day, items: [c] });
    }
    return groups;
  }, [shown]);

  if (!allowed) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-4xl">
        <p className="rounded-xl border border-dashed border-gray-300 bg-white px-4 py-10 text-center text-sm text-gray-500">
          The change history is only available to the IT account.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
          <History size={22} className="text-gray-400" />
          Change history
        </h1>
        <p className="mt-0.5 text-sm text-gray-500">
          Every change made to TTMS, newest first. A new change is added here each
          time the site is rebuilt. The type is worked out from the wording of each
          change, so treat it as a guide.
        </p>
      </div>

      <div className="mb-4 space-y-3 rounded-xl border border-gray-200 bg-white p-3">
        <label className="relative block">
          <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by word, e.g. chat search, rules, invoice"
            className="w-full rounded-lg border border-gray-300 bg-white py-1.5 pl-8 pr-3 text-sm text-gray-900 focus:border-brand-500 focus:outline-none"
          />
        </label>

        <div className="flex flex-wrap gap-1.5">
          {CHANGE_TYPES.map((t) => {
            const on = types.has(t);
            return (
              <button
                key={t}
                type="button"
                aria-pressed={on}
                onClick={() => toggleType(t)}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                  on
                    ? 'border-brand-500 bg-brand-50 text-brand-700'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {CHANGE_TYPE_LABEL[t]} <span className="text-gray-400">{counts[t]}</span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <span className="text-xs font-medium text-gray-500">From</span>
          <DateField
            value={from}
            onChange={setFrom}
            ariaLabel="From date"
            className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900"
          />
          <span className="text-xs font-medium text-gray-500">to</span>
          <DateField
            value={to}
            onChange={setTo}
            ariaLabel="To date"
            className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900"
          />
          {filtering && (
            <button
              type="button"
              onClick={clear}
              className="inline-flex items-center gap-1 self-start rounded-lg px-2 py-1 text-xs font-medium text-gray-500 transition hover:bg-gray-50 hover:text-gray-800 sm:ml-auto sm:self-auto"
            >
              <X size={13} />
              Clear filters
            </button>
          )}
        </div>
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {changes === null && !error ? (
        <p className="py-10 text-center text-sm text-gray-500">Loading the change history…</p>
      ) : changes !== null && (
        <>
          <p className="mb-3 text-xs text-gray-500">
            {filtering
              ? `${shown.length} of ${changes.length} changes match`
              : `${changes.length} changes`}
          </p>

          {shown.length === 0 ? (
            <p className="rounded-xl border border-dashed border-gray-300 bg-white px-4 py-10 text-center text-sm text-gray-500">
              No change matches these filters.
            </p>
          ) : (
            <div className="space-y-5">
              {byDay.map(({ day, items }) => (
                <section key={day}>
                  <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    {formatDate(`${day}T12:00:00`)}
                  </h2>
                  <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white">
                    {items.map((c) => {
                      const expanded = open.has(c.hash);
                      return (
                        <li key={c.hash} className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => toggleOpen(c.hash)}
                            aria-expanded={expanded}
                            className="flex w-full items-start gap-2 text-left"
                          >
                            {c.body
                              ? (expanded
                                  ? <ChevronDown size={16} className="mt-0.5 flex-shrink-0 text-gray-400" />
                                  : <ChevronRight size={16} className="mt-0.5 flex-shrink-0 text-gray-400" />)
                              : <span className="w-4 flex-shrink-0" />}
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-medium text-gray-900">{c.subject}</span>
                              <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
                                <span className={`rounded px-1.5 py-0.5 font-medium ${TYPE_STYLE[c.type]}`}>
                                  {CHANGE_TYPE_LABEL[c.type]}
                                </span>
                                <span>{formatDateTime(c.date)}</span>
                                <span>{c.author}</span>
                                <span className="font-mono text-gray-400">{c.hash.slice(0, 7)}</span>
                              </span>
                            </span>
                          </button>
                          {expanded && c.body && (
                            <div className="ml-6 mt-2 space-y-2 text-sm text-gray-700">
                              {paragraphs(c.body).map((p, i) => (
                                <p key={i} className="whitespace-pre-line">{p}</p>
                              ))}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
