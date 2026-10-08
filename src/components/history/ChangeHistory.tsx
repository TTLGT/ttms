'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, History, RefreshCw } from 'lucide-react';
import { useDateFormatters } from '@/lib/useDateFormatters';
import {
  changeFieldLabel,
  describeChangeValue,
  type ChangeEntry,
} from '@/types/recordHistory';

/**
 * The change history of one order, party or carrier: who changed what, from
 * what, to what, and when. See src/types/recordHistory.ts.
 *
 * Closed until somebody opens it, and only then read. Most visits to a record
 * never look at its history, and a busy load's history is hundreds of
 * entries — fetching it on every page view would be the most expensive thing
 * on the page for the least-used part of it.
 *
 * `refreshKey` reloads an open history when the page saves something, so the
 * change just made appears without a reload.
 */
export default function ChangeHistory({
  load,
  refreshKey,
  startOpen = false,
}: {
  load: () => Promise<ChangeEntry[]>;
  refreshKey?: unknown;
  /** For a page that gives the history a tab of its own. */
  startOpen?: boolean;
}) {
  const { formatDate, formatDateTime } = useDateFormatters();
  const [open, setOpen]       = useState(startOpen);
  const [entries, setEntries] = useState<ChangeEntry[] | null>(null);
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setEntries(await load());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the history');
    } finally {
      setLoading(false);
    }
  }, [load]);

  useEffect(() => {
    if (open) void fetchEntries();
    // `load` is a new function on every parent render; the history is reread
    // on opening and when the page says something was saved, not on each.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, refreshKey]);

  return (
    <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="w-full px-6 py-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 text-left flex-1 min-w-0"
          aria-expanded={open}
        >
          {open
            ? <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
            : <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />}
          <History className="w-4 h-4 text-gray-500 flex-shrink-0" />
          <h2 className="text-sm font-semibold text-gray-900">Change log</h2>
          {!open && (
            <span className="text-xs text-gray-400 truncate">Every change, who made it, and when</span>
          )}
        </button>
        {open && (
          <button
            type="button"
            onClick={() => void fetchEntries()}
            disabled={loading}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
            title="Reload"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        )}
      </div>

      {open && (
        <div className="border-t border-gray-100">
          {error ? (
            <p className="px-6 py-6 text-sm text-red-600">{error}</p>
          ) : entries === null ? (
            <p className="px-6 py-6 text-sm text-gray-400">Loading…</p>
          ) : entries.length === 0 ? (
            <p className="px-6 py-6 text-sm text-gray-400">
              Nothing recorded yet. Changes are recorded from the day this history was added;
              anything earlier was not tracked.
            </p>
          ) : (
            <ol className="divide-y divide-gray-100">
              {entries.map((e) => (
                <li key={e.id} className="px-6 py-3">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="text-sm font-medium text-gray-900">
                      {e.actorName || 'Unknown'}
                    </span>
                    {e.via === 'signer' && (
                      <span className="text-xs text-gray-500">
                        (outside signer{e.actorEmail ? `, link sent to ${e.actorEmail}` : ''})
                      </span>
                    )}
                    <span className="text-xs text-gray-400">{formatDateTime(e.at)}</span>
                  </div>

                  {e.summary && <p className="text-sm text-gray-700 mt-0.5">{e.summary}</p>}

                  {e.fields.length > 0 && (
                    <ul className="mt-1 space-y-0.5">
                      {e.fields.map((f, i) => (
                        <li key={`${f.field}-${i}`} className="text-sm text-gray-600 break-words">
                          <span className="text-gray-500">{changeFieldLabel(f.field)}:</span>{' '}
                          <span className="line-through decoration-gray-300 text-gray-400">
                            {describeChangeValue(f.field, f.from, (v) => formatDate(v))}
                          </span>
                          {' → '}
                          <span className="text-gray-800">
                            {describeChangeValue(f.field, f.to, (v) => formatDate(v))}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </section>
  );
}
