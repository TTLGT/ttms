'use client';

import { useState } from 'react';
import {
  normalizePhone,
  phoneRegionOf,
  isPhoneRegion,
  PHONE_EXAMPLE,
  PHONE_REGION_NAME,
  RECORD_PHONE_REGIONS,
} from '@/lib/phone';
import type { PhoneRegion } from '@/lib/phone';

interface Props {
  label: string;
  value: string;
  /** Undefined on a record saved before countries existed — read as US. */
  region: PhoneRegion | undefined;
  onChange: (value: string, region: PhoneRegion) => void;
  placeholder?: string;
  className?: string;
  /** Shown under the field when there is nothing else to say. */
  hint?: string;
}

/**
 * A phone number with the country it is in.
 *
 * The country is picked, never guessed. That is not laziness: a Mexican and a
 * US number are both ten digits, and Canada shares the US country code
 * outright, so no amount of inspecting what was typed could tell the three
 * apart. `src/lib/phone.ts` made that call for staff numbers already and says
 * so at length; this is the same decision for the records.
 *
 * **Tidies on blur, and never blanks.** A number that reads as the chosen
 * country is rewritten into the house format — `+1 (469) 935-4100` — so the same
 * line cannot sit in three shapes depending on who typed it. One that does not
 * is left exactly as typed, with a note saying why it looks wrong. The staff
 * importer blanks a number it cannot read, which is right for a spreadsheet
 * nobody is watching and wrong here: somebody is looking at this field, and
 * silently emptying it in front of them is how a real number gets lost.
 *
 * Changing the country re-checks the number against it, so picking Mexico for
 * an 8-digit Guatemalan number says so straight away rather than at save time.
 */
export default function PhoneField({
  label,
  value,
  region,
  onChange,
  placeholder,
  className,
  hint,
}: Props) {
  const current = phoneRegionOf(region);
  const [touched, setTouched] = useState(false);

  const { rejected } = normalizePhone(value, current);
  // Only after they have left the field: warning about a half-typed number on
  // the third keystroke is noise.
  const showWarning = touched && rejected;

  function handleBlur() {
    setTouched(true);
    const { value: canonical, rejected: bad } = normalizePhone(value, current);
    if (!bad && canonical && canonical !== value) onChange(canonical, current);
  }

  function handleRegion(next: string) {
    if (!isPhoneRegion(next)) return;
    // Re-format against the new country when it fits it, so switching from US
    // to Mexico on a ten-digit number restyles rather than just relabels.
    const { value: canonical, rejected: bad } = normalizePhone(value, next);
    onChange(!bad && canonical ? canonical : value, next);
  }

  const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm '
    + 'focus:outline-none focus:ring-2 focus:ring-brand-400';

  return (
    <div className={className}>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <div className="flex gap-2">
        <select
          value={current}
          onChange={(e) => handleRegion(e.target.value)}
          aria-label={`${label} country`}
          // Narrow on purpose: the number is the field, the country is a
          // qualifier on it, and a full-width country dropdown reads as the
          // more important of the two.
          className="w-24 flex-shrink-0 border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
        >
          {RECORD_PHONE_REGIONS.map((r) => (
            <option key={r} value={r} title={PHONE_REGION_NAME[r]}>{r}</option>
          ))}
        </select>
        <input
          type="tel"
          inputMode="tel"
          value={value}
          onChange={(e) => onChange(e.target.value, current)}
          onBlur={handleBlur}
          placeholder={placeholder ?? PHONE_EXAMPLE[current]}
          className={`min-w-0 flex-1 ${inputCls}`}
        />
      </div>
      {showWarning ? (
        <p className="text-xs text-amber-700 mt-1">
          That does not look like a {PHONE_REGION_NAME[current]} number — example:{' '}
          {PHONE_EXAMPLE[current]}. It is saved as typed either way.
        </p>
      ) : (
        hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>
      )}
    </div>
  );
}
