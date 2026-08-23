'use client';

import { useEffect, useState } from 'react';
import { splitPersonName, joinPersonName } from '@/lib/names';

/**
 * First/Last name pair for any person stored as one name string — a carrier
 * contact, a dispatcher, a billing contact, an order's driver.
 *
 * The parent still owns the single combined string — see the note on
 * splitPersonName. This component holds the two halves locally so typing a
 * first name doesn't get re-split out from under the user on every keystroke,
 * and re-syncs only when the parent's value changes from the outside (a
 * carrier record finishing its load, or the form resetting).
 */
export default function PersonNameFields({
  label,
  value,
  onChange,
  required,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (combined: string) => void;
  required?: boolean;
  autoFocus?: boolean;
}) {
  const [first, setFirst] = useState(() => splitPersonName(value).first);
  const [last, setLast]   = useState(() => splitPersonName(value).last);

  useEffect(() => {
    if (value === joinPersonName(first, last)) return; // our own edit echoing back
    const parts = splitPersonName(value);
    setFirst(parts.first);
    setLast(parts.last);
    // Deliberately keyed on `value` alone: first/last are what we're setting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function update(nextFirst: string, nextLast: string) {
    setFirst(nextFirst);
    setLast(nextLast);
    onChange(joinPersonName(nextFirst, nextLast));
  }

  const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400';

  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">{label} — First Name</label>
        <input value={first} onChange={(e) => update(e.target.value, last)}
          required={required} autoFocus={autoFocus} placeholder="First" className={inputCls} />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Last Name</label>
        <input value={last} onChange={(e) => update(first, e.target.value)}
          required={required} placeholder="Last" className={inputCls} />
      </div>
    </div>
  );
}
