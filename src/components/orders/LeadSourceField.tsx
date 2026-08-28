'use client';

import { useEffect, useState } from 'react';
import { listLeadSources } from '@/lib/leadSources';
import type { LeadSource } from '@/types/leadSource';

/**
 * The lead-source picker, shared by the order and party forms.
 *
 * Loads the managed list itself rather than taking it as a prop: the list is a
 * few dozen rows read once per form, and threading it down through four
 * different forms would buy nothing.
 *
 * Two behaviours worth knowing about:
 *
 * - A retired source is normally hidden, but stays in the options when it is
 *   the value already on the record. Dropping it would silently re-attribute
 *   the record the next time anybody saved the form.
 * - `canEdit` false renders the picker disabled rather than hiding it, with a
 *   line saying who may change it. A broker who can see an order but not
 *   change what it is credited to should still be able to see the answer.
 */
export default function LeadSourceField({
  value,
  onChange,
  canEdit,
  fallbackName = '',
  label = 'Lead Source',
  hint = 'Where this came from. Used for attribution reporting.',
}: {
  value: string | null;
  onChange: (sourceId: string | null) => void;
  canEdit: boolean;
  /** Raw imported text, shown when the record's source never matched the list. */
  fallbackName?: string;
  label?: string;
  hint?: string;
}) {
  const [sources, setSources] = useState<LeadSource[]>([]);
  const [error, setError]     = useState('');

  useEffect(() => {
    let live = true;
    listLeadSources()
      .then((rows) => { if (live) setSources(rows); })
      .catch((e) => { if (live) setError(e instanceof Error ? e.message : 'Failed to load lead sources'); });
    return () => { live = false; };
  }, []);

  const options = sources.filter((s) => s.isActive || s.id === value);
  const orphan  = !!value && sources.length > 0 && !sources.some((s) => s.id === value);

  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        disabled={!canEdit}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 disabled:bg-gray-50 disabled:text-gray-500"
      >
        <option value="">Not set</option>
        {options.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}{s.isActive ? '' : ' (retired)'}
          </option>
        ))}
      </select>

      {canEdit ? (
        <p className="text-xs text-gray-500 mt-1">{hint}</p>
      ) : (
        <p className="text-xs text-gray-500 mt-1">
          Only an admin or an owner of this record can change the lead source.
        </p>
      )}

      {/* The import kept BATS's text when it matched nothing on the list, so
          say what it was instead of showing "Not set" over a real answer. */}
      {!value && fallbackName.trim() && (
        <p className="text-xs text-amber-700 mt-1">
          Imported as &ldquo;{fallbackName.trim()}&rdquo;, which is not on the managed list.
          {canEdit ? ' Pick the closest match to include it in reporting.' : ''}
        </p>
      )}
      {orphan && (
        <p className="text-xs text-amber-700 mt-1">
          This record points at a lead source that no longer exists.
        </p>
      )}
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}
