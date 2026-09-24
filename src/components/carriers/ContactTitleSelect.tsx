'use client';

import { CARRIER_CONTACT_TITLES } from '@/types/carrier';

/**
 * The job title of a carrier's main contact. A fixed list rather than a free
 * box so the order screen reads "Dispatcher" on every carrier instead of
 * "dispatch", "Dispatch mgr" and "DISPATCHER".
 *
 * A stored title that is not in the list — one written before the list
 * changed — is still offered as its own option, so opening the form and saving
 * it does not quietly blank it.
 */
export default function ContactTitleSelect({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  className: string;
}) {
  const known = (CARRIER_CONTACT_TITLES as readonly string[]).includes(value);
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">Contact Title</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={className}>
        <option value="">— Not set —</option>
        {!known && value && <option value={value}>{value}</option>}
        {CARRIER_CONTACT_TITLES.map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>
    </div>
  );
}
