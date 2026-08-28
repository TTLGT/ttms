'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { listAllowedUsers } from '@/lib/allowedUsers';
import { fullName } from '@/types/allowedUser';
import type { AllowedUser } from '@/types/allowedUser';
import {
  SETTINGS_SECTIONS,
  personAnchorId,
  scrollToAnchor,
  sectionHref,
} from './settingsSections';

/**
 * Find anything in Settings without knowing which tab it is on.
 *
 * Tabs cured the endless scroll but introduced the opposite problem: you now
 * have to know that "lane distance" lives under Operations before you can get
 * to it. This is the answer to that — type what you want, not where it is.
 *
 * It searches two different things. The panels come from the static section
 * list, which costs nothing. People are fetched once, lazily, on the first
 * real keystroke: most visits to Settings never use the box at all, and
 * loading the whole directory on every tab change to serve a search nobody
 * ran would be waste.
 */

type Result = {
  kind: 'section' | 'person';
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

export default function SettingsSearch({ isAdmin }: { isAdmin: boolean }) {
  const router = useRouter();
  const [query, setQuery]   = useState('');
  const [open, setOpen]     = useState(false);
  const [active, setActive] = useState(0);
  const [people, setPeople] = useState<AllowedUser[] | null>(null);
  const boxRef   = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  /** Guards against a second fetch while the first is still in flight. */
  const asked = useRef(false);

  const terms = useMemo(
    () => query.trim().toLowerCase().split(/\s+/).filter(Boolean),
    [query],
  );

  // Pull the directory in the first time someone actually types something.
  useEffect(() => {
    if (terms.length === 0 || asked.current) return;
    asked.current = true;
    void listAllowedUsers()
      .then(setPeople)
      // A failure here costs the people half of the search and nothing else —
      // the panel results still work, so there is nothing worth interrupting
      // anyone about.
      .catch(() => setPeople([]));
  }, [terms.length]);

  const results = useMemo<Result[]>(() => {
    if (terms.length === 0) return [];

    const sections: Result[] = SETTINGS_SECTIONS
      .filter((s) => isAdmin || !s.adminOnly)
      .filter((s) => matches(`${s.label} ${s.blurb} ${s.keywords}`, terms))
      .slice(0, 6)
      .map((s) => ({
        kind: 'section',
        key: s.id,
        title: s.label,
        detail: s.blurb,
        href: sectionHref(s),
      }));

    const persons: Result[] = (people ?? [])
      .filter((p) => matches(`${fullName(p)} ${p.email}`, terms))
      .slice(0, 5)
      .map((p) => ({
        kind: 'person',
        key: p.email,
        title: fullName(p) || p.email,
        detail: p.email,
        href: `/dashboard/settings/people#${personAnchorId(p.email)}`,
      }));

    return [...sections, ...persons];
  }, [terms, people, isAdmin]);

  // Keep the highlight on a row that still exists as the list narrows.
  useEffect(() => setActive(0), [query]);

  // Close when the click lands anywhere else on the page.
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
    // The router will not scroll to a hash whose element has not rendered yet,
    // and none of these have — the destination panel loads its own rows after
    // the navigation lands. scrollToAnchor waits for it.
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
    <div ref={boxRef} className="relative w-full sm:w-72 flex-shrink-0">
      <Search
        size={14}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
      />
      <input
        ref={inputRef}
        type="text"
        value={query}
        placeholder="Search settings and people"
        aria-label="Search settings and people"
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-8 pr-8 text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-400"
      />
      {query && (
        <button
          type="button"
          onClick={() => { setQuery(''); inputRef.current?.focus(); }}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:text-gray-600"
        >
          <X size={13} />
        </button>
      )}

      {open && terms.length > 0 && (
        <div className="absolute right-0 z-20 mt-1 w-full min-w-[18rem] overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
          {results.length === 0 ? (
            <p className="px-3 py-3 text-xs text-gray-500">
              {people === null
                ? 'Searching...'
                : `Nothing in Settings matches "${query.trim()}".`}
            </p>
          ) : (
            <ul className="max-h-80 overflow-y-auto py-1">
              {results.map((r, i) => (
                <li key={`${r.kind}:${r.key}`}>
                  <button
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(r)}
                    className={`flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left transition ${
                      i === active ? 'bg-brand-50' : 'hover:bg-gray-50'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">{r.title}</span>
                      {r.kind === 'person' && (
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                          Person
                        </span>
                      )}
                    </span>
                    <span className="line-clamp-1 text-xs text-gray-500">{r.detail}</span>
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
