'use client';

import { useCallback, useMemo, useState } from 'react';
import { Download, ScrollText, UserMinus, UserPlus, UserRoundCheck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { listPeopleEvents } from '@/lib/allowedUsers';
import { downloadCsv, toCsv } from '@/lib/csv';
import { useDateFormatters } from '@/lib/useDateFormatters';
import { PEOPLE_EVENT_LABEL } from '@/types/peopleEvent';
import type { PeopleEvent, PeopleEventAction } from '@/types/peopleEvent';
import CollapsibleSection from './CollapsibleSection';

/**
 * The access history: every arrival and departure, in the order they happened.
 *
 * Distinct from the removal log above it, and the difference is the whole
 * reason this exists. The removal log answers "who was this person, and what
 * could they do" — one rich record per departure. This answers "what has been
 * done to the access list", additions included, which the removal log by
 * definition cannot: an add leaves no record anywhere else.
 *
 * Loaded on first open only, like the removal log, and for the same reason —
 * an admin comes to Settings to change access, not to read about it.
 *
 * Filtered in the browser rather than on the server. A history is read as a
 * sequence and the whole thing is one read; narrowing it to one address
 * server-side would cost a composite index for a collection that holds a few
 * hundred rows.
 */

const ACTION_STYLE: Record<PeopleEventAction, { Icon: LucideIcon; dot: string; text: string }> = {
  added:    { Icon: UserPlus,       dot: 'bg-green-100 text-green-700', text: 'text-green-700' },
  removed:  { Icon: UserMinus,      dot: 'bg-red-100 text-red-700',     text: 'text-red-700' },
  restored: { Icon: UserRoundCheck, dot: 'bg-blue-100 text-blue-700',   text: 'text-blue-700' },
};

/** The filter chips, in the order they read: everything, then each action. */
const FILTERS: { id: 'all' | PeopleEventAction; label: string }[] = [
  { id: 'all',      label: 'All' },
  { id: 'added',    label: 'Added' },
  { id: 'removed',  label: 'Removed' },
  { id: 'restored', label: 'Put back' },
];

/** How each source reads at the end of a line. Empty for the ordinary case. */
const SOURCE_NOTE: Record<string, string> = {
  import:  'from a spreadsheet import',
  restore: 'from the removal log',
};

/** `YYYY-MM-DD HH:mm` for the CSV, which Excel parses as a real datetime. */
function csvWhen(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
         `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function AccessHistoryPanel() {
  const { formatDateTime } = useDateFormatters();
  const formatWhen = (iso: string | null) => formatDateTime(iso, 'date unknown');

  const [events, setEvents]       = useState<PeopleEvent[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [filter, setFilter]       = useState<'all' | PeopleEventAction>('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await listPeopleEvents();
      setEvents(data.events);
      setTruncated(data.truncated);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the access history.');
    } finally {
      setLoading(false);
    }
  }, []);

  // The section calls this on every open, so the guard is what makes it once.
  const loadOnce = useCallback(() => {
    if (events === null && !loading) load();
  }, [events, loading, load]);

  const shown = useMemo(
    () => (events ?? []).filter((e) => filter === 'all' || e.action === filter),
    [events, filter],
  );

  function handleExport() {
    if (!events) return;

    const header = ['When', 'What', 'Name', 'Email', 'Roles at the time', 'By', 'Source'];
    const rows = events.map((e) => [
      csvWhen(e.at),
      PEOPLE_EVENT_LABEL[e.action] ?? e.action,
      e.name || '',
      e.email,
      // Same convention as the other two exports: Broker is the absence of a
      // role, so it is spelled out rather than left blank.
      e.roles?.length ? e.roles.join(', ') : 'Broker',
      e.actorEmail,
      e.source,
    ]);

    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`access-history-${stamp}.csv`, toCsv([header, ...rows]));
  }

  return (
    <CollapsibleSection
      id="access-history"
      title="Access History"
      Icon={ScrollText}
      className="mt-6"
      onOpen={loadOnce}
      description={
        <>
          Every time someone was added, removed or put back, in order, with the admin who
          did it. The log above keeps a departed person&apos;s details; this one keeps the
          sequence.
        </>
      }
      aside={
        events !== null ? (
          <span className="text-sm font-semibold tabular-nums text-gray-600">
            {events.length}
            {truncated && '+'}
          </span>
        ) : null
      }
    >
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <div className="py-12 text-center">
          <p className="text-sm text-gray-500">{error}</p>
          <button
            onClick={load}
            className="mt-3 text-xs font-medium text-brand-700 hover:text-brand-800 underline"
          >
            Try again
          </button>
        </div>
      ) : !events || events.length === 0 ? (
        <div className="px-6 py-12 text-center text-sm text-gray-400">
          {/* Worth saying when this starts, because the history begins the day
              it was switched on and everybody already on the system arrived
              before that. A blank panel on a company of twelve otherwise reads
              as broken. */}
          Nothing yet. This records changes from the day it was added — people who
          were already here do not appear until something happens to their access.
        </div>
      ) : (
        <>
          <div className="px-6 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-1.5 flex-wrap">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                    filter === f.id
                      ? 'bg-brand-600 text-white'
                      : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {f.label}
                </button>
              ))}
              <span className="ml-1 text-xs text-gray-500">
                {shown.length} of {events.length}
                {truncated && (
                  <span className="ml-2 text-amber-600">
                    · only the most recent {events.length} are kept on screen
                  </span>
                )}
              </span>
            </div>

            <button
              onClick={handleExport}
              title="Download the whole history as a CSV that opens in Excel"
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition"
            >
              <Download size={13} />
              Export CSV
            </button>
          </div>

          {shown.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-400">
              Nothing under that filter.
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {shown.map((e) => {
                const style = ACTION_STYLE[e.action] ?? ACTION_STYLE.added;
                const note  = SOURCE_NOTE[e.source] ?? '';
                return (
                  <li key={e.id} className="flex items-start gap-3 px-6 py-3">
                    <span
                      className={`mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full ${style.dot}`}
                    >
                      <style.Icon size={13} />
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-gray-700">
                        <span className={`font-medium ${style.text}`}>
                          {PEOPLE_EVENT_LABEL[e.action] ?? e.action}
                        </span>{' '}
                        {/* The name as it was at the time, then the address,
                            which is the thing that stays the same across a
                            removal and is what an admin searches on. */}
                        <span className="font-medium text-gray-900">{e.name || e.email}</span>
                        {e.name && (
                          <span className="text-gray-500"> · {e.email}</span>
                        )}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        {[
                          e.roles?.length ? e.roles.join(', ') : 'Broker',
                          e.actorEmail ? `by ${e.actorEmail}` : null,
                          note || null,
                        ].filter(Boolean).join(' · ')}
                      </p>
                    </div>

                    <p className="flex-shrink-0 text-right text-[11px] text-gray-400">
                      {formatWhen(e.at)}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </CollapsibleSection>
  );
}
