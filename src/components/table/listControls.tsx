'use client';

import { useCallback, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowDown, ArrowUp, ArrowUpDown, Filter, X } from 'lucide-react';

/**
 * Sorting by any column and filtering inside each column, for the record lists
 * — Carriers, Clients, Shippers, Consignees and 3rd Party Providers.
 *
 * The state lives in the URL (`sort`, `dir`, and one `f.<column>` per filter),
 * like each list's search box already does, so opening a record and pressing
 * Back returns to the same sorted, filtered list. Defaults are written as
 * absent parameters, so a bare list address keeps meaning what it always did.
 *
 * What is sorted where matters, and the lists differ:
 *
 * - The carrier and party lists arrive fifty at a time in name order. Their
 *   **name** column is therefore sorted by the database (the page passes the
 *   direction to its query — see `serverKey`), because reversing what is
 *   loaded would show the end of the first fifty, not the end of the
 *   alphabet.
 * - Every **other** column, and every column filter, works on the rows the
 *   page has loaded. Sorting each column in the database would need an index
 *   per column per filter; the page says "among the N loaded" whenever more
 *   are left to load, so a short list is never mistaken for the whole book.
 * - The provider list is read whole, so for it everything is exact.
 */

export type SortDir = 'asc' | 'desc';

export interface FilterOption {
  value: string;
  label: string;
}

export interface ListColumn<T> {
  key: string;
  label: string;
  /** What the column sorts on. Absent: the heading does not sort. */
  sortValue?: (row: T) => string | number | null | undefined;
  /** A text filter: what the box is matched against (contains, any case). */
  filterText?: (row: T) => string | null | undefined;
  /** A dropdown filter instead: the choices, and the row's value or values. */
  filterOptions?: FilterOption[];
  filterValue?: (row: T) => string | string[] | null | undefined;
  /** Extra classes for the heading cell. */
  className?: string;
}

const FILTER_PREFIX = 'f.';

/**
 * A phone number as a filter matches it: the number as stored and its bare
 * digits, so "555-0142", "(555) 0142" and "5550142" all find it.
 */
export function phoneFilterText(...phones: (string | null | undefined)[]): string {
  return phones.filter(Boolean).map((p) => `${p} ${String(p).replace(/\D/g, '')}`).join(' ');
}

function isBlank(v: unknown): boolean {
  return v === null || v === undefined || v === '';
}

/**
 * Blanks always go last, in both directions — a Z–A list that opens on forty
 * empty contacts answers nothing. Text compares the way a person reads it:
 * case-blind, and "Truck 9" before "Truck 10".
 */
function compare(a: string | number | null | undefined, b: string | number | null | undefined, dir: SortDir): number {
  const ab = isBlank(a), bb = isBlank(b);
  if (ab && bb) return 0;
  if (ab) return 1;
  if (bb) return -1;
  const n = typeof a === 'number' && typeof b === 'number'
    ? a - b
    : String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
  return dir === 'asc' ? n : -n;
}

export function useListControls<T>(columns: ListColumn<T>[], opts: {
  /** The column the list is in when nobody has chosen one. */
  defaultSort: string;
  /**
   * The column the page's own query already sorts by. Rows are left in the
   * order they arrived when it is chosen, rather than re-sorted here, so the
   * page and the database cannot disagree about where "acme" goes.
   */
  serverKey?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const requested = params.get('sort') ?? '';
  const sortKey = columns.some((c) => c.key === requested && c.sortValue) ? requested : opts.defaultSort;
  const dir: SortDir = params.get('dir') === 'desc' ? 'desc' : 'asc';

  const filters = useMemo(() => {
    const out: Record<string, string> = {};
    for (const c of columns) {
      const v = params.get(FILTER_PREFIX + c.key);
      if (v) out[c.key] = v;
    }
    return out;
  }, [columns, params]);
  const filterCount = Object.keys(filters).length;

  // Opened by the Filter button; always open while any filter is on, so a
  // narrowed list can never hide the boxes that narrowed it.
  const [showFilters, setShowFilters] = useState(false);

  const write = useCallback((edit: (p: URLSearchParams) => void) => {
    const next = new URLSearchParams(params.toString());
    edit(next);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [params, pathname, router]);

  /** A new column starts A–Z; the column already in use flips. */
  const onSort = useCallback((key: string) => write((p) => {
    const nextDir: SortDir = key === sortKey && dir === 'asc' ? 'desc' : 'asc';
    if (key === opts.defaultSort) p.delete('sort'); else p.set('sort', key);
    if (nextDir === 'asc') p.delete('dir'); else p.set('dir', nextDir);
  }), [write, sortKey, dir, opts.defaultSort]);

  const setFilter = useCallback((key: string, value: string) => write((p) => {
    if (value) p.set(FILTER_PREFIX + key, value); else p.delete(FILTER_PREFIX + key);
  }), [write]);

  const clearFilters = useCallback(() => {
    write((p) => { for (const c of columns) p.delete(FILTER_PREFIX + c.key); });
    setShowFilters(false);
  }, [write, columns]);

  const apply = useCallback((rows: T[]): T[] => {
    const kept = rows.filter((row) => columns.every((c) => {
      const want = filters[c.key];
      if (!want) return true;
      if (c.filterOptions && c.filterValue) {
        const has = c.filterValue(row);
        return Array.isArray(has) ? has.includes(want) : has === want;
      }
      if (c.filterText) {
        return (c.filterText(row) ?? '').toLowerCase().includes(want.trim().toLowerCase());
      }
      return true;
    }));
    if (sortKey === opts.serverKey) return kept;
    const col = columns.find((c) => c.key === sortKey);
    if (!col?.sortValue) return kept;
    const value = col.sortValue;
    // A copy: Array.prototype.sort is in place, and `kept` may be the page's
    // own state when no filter removed anything.
    return [...kept].sort((a, b) => compare(value(a), value(b), dir));
  }, [columns, filters, sortKey, dir, opts.serverKey]);

  return {
    sortKey, dir, onSort,
    filters, filterCount, setFilter, clearFilters,
    showFilters: showFilters || filterCount > 0,
    toggleFilters: () => setShowFilters((v) => !v),
    apply,
    /** What the server should sort the name column by, for the page's query. */
    serverDir: sortKey === opts.serverKey ? dir : 'asc' as SortDir,
    /** True when the rows on screen are in an order the page worked out itself. */
    sortedLocally: sortKey !== opts.serverKey,
  };
}

export type ListControls<T> = ReturnType<typeof useListControls<T>>;

/**
 * The header row, and under it the filter row when it is open. Drawn in the
 * page's own <thead>, so each table keeps its own columns and cells.
 */
export function ListHead<T>({ columns, controls, trailing = 0 }: {
  columns: ListColumn<T>[];
  controls: ListControls<T>;
  /** Empty heading cells after the columns — the "View →" column. */
  trailing?: number;
}) {
  const { sortKey, dir, onSort, filters, setFilter, showFilters } = controls;
  return (
    <>
      <tr>
        {columns.map((c) => {
          const active = c.key === sortKey;
          if (!c.sortValue) {
            return (
              <th key={c.key} scope="col" data-es={c.label}
                className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 ${c.className ?? ''}`}>
                {c.label}
              </th>
            );
          }
          const Arrow = !active ? ArrowUpDown : dir === 'asc' ? ArrowUp : ArrowDown;
          return (
            <th key={c.key} scope="col"
              aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
              className={`whitespace-nowrap p-0 text-left ${c.className ?? ''}`}>
              <button type="button" onClick={() => onSort(c.key)}
                title={active ? (dir === 'asc' ? 'Sorted A–Z. Click for Z–A' : 'Sorted Z–A. Click for A–Z') : `Sort by ${c.label.toLowerCase()}, A–Z`}
                className={`group flex w-full items-center gap-1 px-4 py-3 text-xs font-semibold uppercase tracking-wide transition hover:bg-gray-100 ${
                  active ? 'text-brand-700' : 'text-gray-500 hover:text-gray-700'
                }`}>
                <span data-es={c.label}>{c.label}</span>
                <Arrow size={12} aria-hidden
                  className={active ? '' : 'opacity-30 transition-opacity group-hover:opacity-70'} />
                {active && (
                  <span className="ml-0.5 rounded bg-brand-50 px-1 text-[10px] font-semibold normal-case tracking-normal text-brand-700">
                    {dir === 'asc' ? 'A–Z' : 'Z–A'}
                  </span>
                )}
              </button>
            </th>
          );
        })}
        {Array.from({ length: trailing }, (_, i) => <th key={`t${i}`} />)}
      </tr>
      {showFilters && (
        <tr className="bg-white">
          {columns.map((c) => (
            <th key={c.key} className="px-2 pb-2 pt-1 align-top font-normal">
              {c.filterOptions ? (
                <select value={filters[c.key] ?? ''} onChange={(e) => setFilter(c.key, e.target.value)}
                  aria-label={`Filter by ${c.label.toLowerCase()}`}
                  className={`w-full min-w-[7rem] rounded-md border px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-brand-400 ${
                    filters[c.key] ? 'border-brand-400 bg-brand-50 text-brand-800' : 'border-gray-300 text-gray-700'}`}>
                  <option value="" data-es="All">All</option>
                  {c.filterOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : c.filterText ? (
                <input value={filters[c.key] ?? ''} onChange={(e) => setFilter(c.key, e.target.value)}
                  placeholder="Filter…" data-es="Filter…"
                  aria-label={`Filter by ${c.label.toLowerCase()}`}
                  className={`w-full min-w-[7rem] rounded-md border px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-brand-400 ${
                    filters[c.key] ? 'border-brand-400 bg-brand-50 text-brand-800' : 'border-gray-300'}`} />
              ) : null}
            </th>
          ))}
          {Array.from({ length: trailing }, (_, i) => <th key={`t${i}`} />)}
        </tr>
      )}
    </>
  );
}

/** The "Filter columns" button beside a list's search box. */
export function FilterToggle<T>({ controls }: { controls: ListControls<T> }) {
  const { filterCount, showFilters, toggleFilters, clearFilters } = controls;
  return (
    <div className="flex items-center gap-1">
      <button type="button" onClick={toggleFilters} aria-pressed={showFilters} disabled={filterCount > 0}
        title={filterCount > 0 ? 'Clear the filters to hide the boxes' : undefined}
        className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition ${
          showFilters ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
        <Filter className="h-4 w-4" aria-hidden />
        <span data-es="Filter columns">Filter columns</span>
        {filterCount > 0 && (
          <span className="rounded-full bg-brand-600 px-1.5 text-[11px] font-semibold text-white">{filterCount}</span>
        )}
      </button>
      {filterCount > 0 && (
        <button type="button" onClick={clearFilters}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-2 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-800">
          <X className="h-4 w-4" aria-hidden /> <span data-es="Clear filters">Clear filters</span>
        </button>
      )}
    </div>
  );
}

/**
 * Says when the order or the filtering covers only what is loaded. Silent when
 * everything is loaded, or when the list is in the database's own name order
 * with no column filter — then nothing on screen is partial.
 */
export function PartialNote<T>({ controls, loaded, more }: {
  controls: ListControls<T>;
  loaded: number;
  /** More pages left to load. */
  more: boolean;
}) {
  if (!more || (!controls.sortedLocally && controls.filterCount === 0)) return null;
  const what = controls.sortedLocally && controls.filterCount
    ? 'Sorted and filtered'
    : controls.sortedLocally ? 'Sorted' : 'Filtered';
  return (
    <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
      {what} among the {loaded.toLocaleString()} loaded so far. Load more at the bottom to include the rest.
    </p>
  );
}
