'use client';

import type { Address } from '@/types/order';
import { ADDRESS_COUNTRIES, countryCode, countryOf } from '@/types/addressCountry';
import TimeZoneBadge from './TimeZoneBadge';

export const BLANK_ADDRESS: Address = { street: '', city: '', state: '', zip: '', country: 'US' };

const INPUT = 'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400';

/**
 * Country, street, city, state (or province, or department) and postal code
 * for one stop on an order form. The second box follows the country — see
 * src/types/addressCountry.ts, the one list of countries.
 */
export default function AddressFields({ label, value, onChange }: {
  label: string; value: Address; onChange: (a: Address) => void;
}) {
  const set = (k: keyof Address) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    onChange({ ...value, [k]: e.target.value });
  const country = countryOf(value);
  const code = countryCode(value.country);
  // A value the list does not hold — "Texas" typed out by an import, a
  // department spelled another way — is still offered, so opening and saving
  // the address never quietly blanks it.
  const stray = value.state && !country.regions.some(([v]) => v === value.state) ? value.state : '';

  function setCountry(e: React.ChangeEvent<HTMLSelectElement>) {
    // The region and postal code belong to the old country; a Texas ZIP is
    // not a Mexican código postal.
    if (e.target.value === code) return;
    onChange({ ...value, country: e.target.value, state: '', zip: '' });
  }

  return (
    <div>
      <p className="text-sm font-semibold text-gray-700 mb-3">{label}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <select value={code} onChange={setCountry} aria-label="Country" className={`col-span-1 sm:col-span-2 ${INPUT}`}>
          {ADDRESS_COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
          {/* Same reason as `stray`: a country this list does not hold yet. */}
          {!ADDRESS_COUNTRIES.some((c) => c.code === code) && <option value={code}>{code}</option>}
        </select>
        <div className="col-span-1 sm:col-span-2">
          <input placeholder="Street address" value={value.street} onChange={set('street')}
            className={`w-full ${INPUT}`} />
        </div>
        <input placeholder="City" value={value.city} onChange={set('city')} className={INPUT} />
        <select value={value.state} onChange={set('state')} aria-label={country.regionWord} className={INPUT}>
          <option data-es value="">{country.regionWord}</option>
          {stray && <option value={stray}>{stray}</option>}
          {country.regions.map(([v, name]) => <option key={v} value={v}>{name}</option>)}
        </select>
        <input placeholder={country.postalRequired ? country.postalWord : `${country.postalWord} (if any)`}
          value={value.zip} onChange={set('zip')} className={INPUT} />
      </div>
      {/* The local clock appears as soon as a state is picked, so whoever is
          typing the stop in sees what time it is there before they call. */}
      <TimeZoneBadge address={value} className="mt-2" />
    </div>
  );
}
