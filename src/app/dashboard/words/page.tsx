'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, Languages, RotateCcw, Search, Volume2 } from 'lucide-react';
import { useLearn } from '@/context/LearnContext';
import { useDateFormatters } from '@/lib/useDateFormatters';
import { canSpeak, speak } from '@/lib/speak';
import {
  GLOSSARY,
  GLOSSARY_BY_ID,
  GLOSSARY_CATEGORY_LABEL,
  type GlossaryCategory,
  type GlossaryTerm,
} from '@/types/glossary';
import type { WordRecord } from '@/types/vocabulary';

/**
 * My words: the Learn English list for the person signed in.
 *
 * Three views of the same glossary — the words they have looked up, the ones
 * they have marked as known, and every word there is — because the first two
 * are what they came back for and the third is how somebody who has just
 * turned the mode on finds out what it covers.
 *
 * Open to everybody with no permission of its own and no nav entry: it shows
 * only the caller's own list, served by /api/me/words, and is reached from
 * the Learn English switch and from every meaning card.
 */

type Tab = 'learning' | 'known' | 'all';

export default function MyWordsPage() {
  const { enabled, setEnabled, words, wordsError, loadWords, setKnown } = useLearn();
  const { formatDate } = useDateFormatters();
  const [tab, setTab] = useState<Tab>('learning');
  const [query, setQuery] = useState('');
  const [voice, setVoice] = useState(false);

  useEffect(() => {
    if (words === null) loadWords();
  }, [words, loadWords]);

  // Read after mount: the server has no speech voices to ask about.
  useEffect(() => { setVoice(canSpeak()); }, []);

  const learning = useMemo(
    () => Object.entries(words ?? {})
      .filter(([id, w]) => !w.known && w.count > 0 && GLOSSARY_BY_ID.has(id))
      .sort(([, a], [, b]) => (b.lastAt ?? '').localeCompare(a.lastAt ?? ''))
      .map(([id]) => GLOSSARY_BY_ID.get(id)!),
    [words],
  );

  const known = useMemo(
    () => GLOSSARY.filter((t) => words?.[t.id]?.known).sort((a, b) => a.word.localeCompare(b.word)),
    [words],
  );

  const matches = (t: GlossaryTerm) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return t.word.toLowerCase().includes(q)
      || t.es.toLowerCase().includes(q)
      || (t.forms ?? []).some((f) => f.toLowerCase().includes(q));
  };

  const shown = (tab === 'learning' ? learning : tab === 'known' ? known : GLOSSARY).filter(matches);

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'learning', label: 'Looked up', count: learning.length },
    { id: 'known',    label: 'I know',    count: known.length },
    { id: 'all',      label: 'All words', count: GLOSSARY.length },
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">My words</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          English words from TTMS and from freight work, with their meaning in Spanish.
          Words you look up are saved here so you can practise them. Mark a word
          &ldquo;I know this&rdquo; and it stops being underlined.
        </p>
      </div>

      {!enabled && (
        <div className="mb-6 flex flex-col gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 sm:flex-row sm:items-center">
          <Languages size={20} className="flex-shrink-0 text-blue-600" />
          <p className="flex-1 text-sm text-blue-900">
            Learn English is off. Turn it on and words like <em>consignee</em> and <em>lane</em> get
            a dotted blue line. Point at one, or tap it on a phone, to see what it means.
          </p>
          <button
            type="button"
            onClick={() => setEnabled(true)}
            className="rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-brand-600"
          >
            Turn it on
          </button>
        </div>
      )}

      {wordsError && (
        <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{wordsError}</p>
      )}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div role="tablist" className="flex gap-1 rounded-lg bg-gray-100 p-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                tab === t.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              {t.label} <span className="text-gray-400">{t.count}</span>
            </button>
          ))}
        </div>
        <label className="relative block sm:w-64">
          <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search in English or Spanish"
            className="w-full rounded-lg border border-gray-300 bg-white py-1.5 pl-8 pr-3 text-sm text-gray-900 focus:border-brand-500 focus:outline-none"
          />
        </label>
      </div>

      {words === null && !wordsError && tab !== 'all' ? (
        <p className="py-10 text-center text-sm text-gray-500">Loading your words…</p>
      ) : shown.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 bg-white px-4 py-10 text-center text-sm text-gray-500">
          {query.trim()
            ? 'No word matches that search.'
            : tab === 'learning'
              ? 'No words yet. Turn on Learn English and point at an underlined word to start your list.'
              : 'Nothing here yet. Words you mark “I know this” are listed here, and you can move them back.'}
        </p>
      ) : tab === 'all' ? (
        <div className="space-y-6">
          {(Object.keys(GLOSSARY_CATEGORY_LABEL) as GlossaryCategory[]).map((cat) => {
            const inCat = shown.filter((t) => t.category === cat);
            if (inCat.length === 0) return null;
            return (
              <section key={cat}>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {GLOSSARY_CATEGORY_LABEL[cat]}
                </h2>
                <WordList terms={inCat} words={words} voice={voice} formatDate={formatDate} setKnown={setKnown} />
              </section>
            );
          })}
        </div>
      ) : (
        <WordList terms={shown} words={words} voice={voice} formatDate={formatDate} setKnown={setKnown} />
      )}
    </div>
  );
}

function WordList({ terms, words, voice, formatDate, setKnown }: {
  terms: GlossaryTerm[];
  words: Record<string, WordRecord> | null;
  voice: boolean;
  formatDate: (value: string | null, fallback?: string) => string;
  setKnown: (termId: string, known: boolean) => void;
}) {
  return (
    <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white">
      {terms.map((term) => {
        const record = words?.[term.id];
        return (
          // Marked skip: this page is the glossary, so underlining every word
          // on it would be underlining the answers.
          <li key={term.id} data-learn-skip className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-start">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <p className="text-base font-semibold text-gray-900">{term.word}</p>
                <p className="text-sm text-gray-600">{term.es}</p>
                {voice && (
                  <button
                    type="button"
                    onClick={() => speak(term.word)}
                    aria-label={`Say ${term.word}`}
                    title="Say it"
                    className="self-center rounded p-0.5 text-gray-400 transition hover:text-brand-600"
                  >
                    <Volume2 size={15} />
                  </button>
                )}
              </div>
              <p className="mt-1 text-sm text-gray-700">{term.meaning}</p>
              <p className="mt-1 text-sm italic text-gray-500">
                {term.example}
                {voice && (
                  <button
                    type="button"
                    onClick={() => speak(term.example, true)}
                    aria-label="Say the example"
                    title="Say the example, slowly"
                    className="ml-1.5 inline-flex rounded p-0.5 align-middle text-gray-400 not-italic transition hover:text-brand-600"
                  >
                    <Volume2 size={13} />
                  </button>
                )}
              </p>
              {record && record.count > 0 && (
                <p className="mt-1 text-xs text-gray-400">
                  Looked up {record.count === 1 ? 'once' : `${record.count} times`}
                  {record.lastAt ? `, last on ${formatDate(record.lastAt)}` : ''}
                </p>
              )}
            </div>
            {record?.known ? (
              <button
                type="button"
                onClick={() => setKnown(term.id, false)}
                title="Underline this word again"
                className="inline-flex flex-shrink-0 items-center gap-1.5 self-start rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 transition hover:bg-gray-50"
              >
                <RotateCcw size={13} />
                Still learning
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setKnown(term.id, true)}
                title="Stop underlining this word"
                className="inline-flex flex-shrink-0 items-center gap-1.5 self-start rounded-lg border border-green-200 px-2.5 py-1 text-xs font-medium text-green-700 transition hover:bg-green-50"
              >
                <Check size={13} />
                I know this
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
