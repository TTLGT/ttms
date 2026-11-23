'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CornerDownLeft, Search, User, X, Zap } from 'lucide-react';
import { listManageableUsers } from '@/lib/allowedUsers';
import { fullName } from '@/types/allowedUser';
import type { AllowedUser } from '@/types/allowedUser';
import type { UserProfile } from '@/types/userProfile';
import {
  SETTINGS_ACTIONS,
  actionHref,
  personHref,
  scrollToAnchor,
  searchEntries,
  type SettingsAccess,
} from './settingsSections';

/**
 * Find anything in Settings — or do it — without knowing where it lives.
 *
 * Three kinds of result. **Pages** (and the smaller settings inside them)
 * come from the static list, which costs nothing. **People** are fetched once,
 * lazily, on the first real keystroke, and only for somebody who can open the
 * People page. **Actions** — "Turn off reminder emails" — open the page with
 * the change already made in the draft and the Save bar showing; the search
 * box never saves anything itself.
 *
 * Ctrl+K (⌘K on a Mac) jumps here from anywhere in Settings.
 */

type Result = {
  kind: 'action' | 'page' | 'person';
  key: string;
  title: string;
  detail: string;
  href: string;
};

/** Every word typed has to appear somewhere in the haystack. */
function matches(haystack: string, terms: string[]): boolean {
  const hay = haystack.toLowerCase();
  return terms.every((t) => hay.includes(t));
}

export default function SettingsSearch({
  access,
  profile,
  seesPeople,
}: {
  access: SettingsAccess;
  profile: UserProfile | null;
  seesPeople: boolean;
}) {
  const router = useRouter();
  const [query, setQuery]   = useState('');
  const [open, setOpen]     = useState(false);
  const [active, setActive] = useState(0);
  const [people, setPeople] = useState<AllowedUser[] | null>(null);
  const boxRef   = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const asked = useRef(false);

  const terms = useMemo(
    () => query.trim().toLowerCase().split(/\s+/).filter(Boolean),
    [query],
  );

  // Ctrl+K from anywhere on the page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!seesPeople || terms.length === 0 || asked.current) return;
    asked.current = true;
    // A Sales Manager is given their team and nobody else — the same narrowing
    // the People page applies, so search cannot find more than the page shows.
    void listManageableUsers(profile).then(setPeople).catch(() => setPeople([]));
  }, [terms.length, seesPeople, profile]);

  const entries = useMemo(() => searchEntries(access), [access]);

  const results = useMemo<Result[]>(() => {
    if (terms.length === 0) return [];

    const actions: Result[] = SETTINGS_ACTIONS
      .filter((a) => a.access(access) && matches(`${a.label} ${a.keywords}`, terms))
      .slice(0, 3)
      .map((a) => ({ kind: 'action', key: a.key, title: a.label, detail: 'Opens the page with this ready to save', href: actionHref(a) }));

    const pages: Result[] = entries
      .filter((e) => matches(e.haystack, terms))
      .slice(0, 6)
      .map((e) => ({ kind: 'page', key: e.key, title: e.title, detail: e.where ? `${e.where} · ${e.detail}` : e.detail, href: e.href }));

    const persons: Result[] = (people ?? [])
      .filter((p) => matches(`${fullName(p)} ${p.email}`, terms))
      .slice(0, 5)
      .map((p) => ({ kind: 'person', key: p.email, title: fullName(p) || p.email, detail: p.email, href: personHref(p.email) }));

    return [...actions, ...pages, ...persons];
  }, [terms, people, entries, access]);

  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  function go(result: Result) {
    setOpen(false);
    setQuery('');
    inputRef.current?.blur();
    router.push(result.href);
    scrollToAnchor(result.href.split('#')[1] ?? '');
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setQuery('');
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(results[active]);
    }
  }

  return (
    <div ref={boxRef} className="relative w-full">
      <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
      <input
        ref={inputRef}
        type="text"
        value={query}
        placeholder="Search settings and people"
        aria-label="Search settings and people"
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-8 pr-14 text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-400"
      />
      {query ? (
        <button
          type="button"
          onClick={() => { setQuery(''); inputRef.current?.focus(); }}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:text-gray-600"
        >
          <X size={13} />
        </button>
      ) : (
        <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-gray-200 px-1.5 font-mono text-[10px] text-gray-400">
          Ctrl K
        </kbd>
      )}

      {open && terms.length > 0 && (
        <div className="absolute left-0 z-30 mt-1 w-[min(26rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
          {results.length === 0 ? (
            <p className="px-3 py-3 text-xs text-gray-500">
              {seesPeople && people === null ? 'Searching…' : `Nothing in Settings matches "${query.trim()}".`}
            </p>
          ) : (
            <ul className="max-h-96 overflow-y-auto py-1">
              {results.map((r, i) => (
                <li key={`${r.kind}:${r.key}`}>
                  <button
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(r)}
                    className={`flex w-full items-start gap-2.5 px-3 py-2 text-left transition ${
                      i === active ? 'bg-brand-50' : 'hover:bg-gray-50'
                    }`}
                  >
                    <span className={`mt-0.5 flex-shrink-0 ${r.kind === 'action' ? 'text-amber-500' : 'text-gray-400'}`}>
                      {r.kind === 'action' ? <Zap size={14} /> : r.kind === 'person' ? <User size={14} /> : <Search size={14} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-gray-900">{r.title}</span>
                      <span className="line-clamp-1 text-xs text-gray-500">{r.detail}</span>
                    </span>
                    {i === active && <CornerDownLeft size={13} className="mt-1 flex-shrink-0 text-gray-400" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
