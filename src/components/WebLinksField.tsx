'use client';

import { Plus, Trash2 } from 'lucide-react';
import { Bi } from '@/components/spanish/Es';
import {
  MAX_WEB_LINKS, WEB_LINK_KINDS, WEB_LINK_LABEL, detectWebLinkKind, safeWebUrl, type WebLink,
} from '@/types/webLinks';

const INPUT = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400';

/**
 * The editor for a record's website and social media links, used by the
 * party, carrier and provider forms. Rows are kept exactly as typed while
 * editing; the server's cleanWebLinks() is what decides what is stored, and
 * this only warns, row by row, about what it will drop.
 */
export default function WebLinksField({ value, onChange, label = 'Website and social media' }: {
  value: WebLink[];
  onChange: (next: WebLink[]) => void;
  label?: string;
}) {
  const set = (i: number, change: Partial<WebLink>) =>
    onChange(value.map((l, j) => (j === i ? { ...l, ...change } : l)));

  return (
    <div>
      <p data-es={label} className="block text-xs font-medium text-gray-600 mb-1">{label}</p>
      {value.length === 0 && (
        <p className="text-xs text-gray-400 mb-2"><Bi>None yet. Paste the company’s website, LinkedIn, Facebook or any other page.</Bi></p>
      )}
      <ul className="space-y-2">
        {value.map((l, i) => {
          const bad = l.url.trim() !== '' && !safeWebUrl(l.url);
          return (
            <li key={i}>
              <div className="flex gap-2">
                <select value={l.kind} aria-label="Kind of link"
                  onChange={(e) => set(i, { kind: e.target.value as WebLink['kind'] })}
                  className="w-40 shrink-0 border border-gray-300 rounded-lg px-2 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-400">
                  {WEB_LINK_KINDS.map((k) => <option key={k} value={k}>{WEB_LINK_LABEL[k]}</option>)}
                </select>
                <input value={l.url} maxLength={300} placeholder="acme.com or https://linkedin.com/company/…"
                  aria-label="Address"
                  onChange={(e) => set(i, { url: e.target.value })}
                  // A pasted LinkedIn address labels itself, but only while the
                  // row still says Website — never over a kind somebody picked.
                  onBlur={() => { if (l.kind === 'website' && l.url.trim()) set(i, { kind: detectWebLinkKind(l.url) }); }}
                  className={`${INPUT} ${bad ? 'border-red-300' : ''}`} />
                <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))}
                  aria-label="Remove link" title="Remove"
                  className="shrink-0 rounded-lg border border-gray-300 px-2.5 text-gray-500 hover:bg-gray-50 hover:text-red-600">
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </div>
              {bad && (
                <p className="mt-1 text-xs text-red-600">
                  <Bi>That is not a web address, so it will not be saved. Type it like acme.com</Bi>
                </p>
              )}
            </li>
          );
        })}
      </ul>
      {value.length < MAX_WEB_LINKS && (
        <button type="button" data-es="Add a link"
          onClick={() => onChange([...value, { kind: 'website', url: '' }])}
          className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline">
          <Plus className="h-4 w-4" aria-hidden /> Add a link
        </button>
      )}
    </div>
  );
}
