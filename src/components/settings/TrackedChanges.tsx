'use client';

import { useMemo } from 'react';
import { diffCounts, diffText } from '@/lib/textDiff';
import { Bi } from '@/components/spanish/Es';

/**
 * Two versions of a text, drawn as one with the differences marked: added
 * words underlined in green, removed ones struck through in red — the way
 * Word shows tracked changes, which is how the people approving a change to a
 * contract are used to reading one.
 *
 * Used for the agreement terms while they are being edited, and for a terms
 * change in the settings change log.
 */
export default function TrackedChanges({
  before, after, className = '', maxHeight = 'max-h-96',
}: {
  before: string;
  after: string;
  className?: string;
  maxHeight?: string;
}) {
  const segments = useMemo(() => diffText(before, after), [before, after]);
  const counts = useMemo(() => diffCounts(segments), [segments]);
  const changed = counts.added > 0 || counts.removed > 0;

  return (
    <div className={className}>
      <p className="mb-2 text-xs text-gray-500">
        {changed ? (
          <Bi vars={{ added: counts.added, removed: counts.removed }}>
            {'{added} words added, {removed} taken out. Green is new; red is what goes.'}
          </Bi>
        ) : (
          <Bi>No wording has changed.</Bi>
        )}
      </p>
      <div className={`${maxHeight} overflow-y-auto whitespace-pre-wrap rounded-lg border border-gray-200 bg-white p-4 font-serif text-[13px] leading-relaxed text-gray-800`}>
        {segments.map((s, i) =>
          s.kind === 'same' ? <span key={i}>{s.text}</span>
          : s.kind === 'add' ? (
            <ins key={i} className="rounded-sm bg-green-100 text-green-800 underline decoration-green-500 decoration-2 underline-offset-2">{s.text}</ins>
          ) : (
            <del key={i} className="rounded-sm bg-red-50 text-red-700 decoration-red-500 decoration-2">{s.text}</del>
          ))}
      </div>
    </div>
  );
}
