'use client';

import { TRANSPORT_TYPE_SUGGESTIONS } from '@/types/order';

/**
 * The truck or trailer a load moves on (`Order.transportType`). Suggestions
 * rather than a fixed list: imported BATS loads carry their own wording, and a
 * dropdown would refuse to show it.
 */
export default function TransportTypeField({ value, onChange, required }: {
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <div className="sm:max-w-md">
      <label htmlFor="transport-type" className="block text-xs font-medium text-gray-600 mb-1">
        Transport type{required ? ' *' : ''}
      </label>
      <input
        id="transport-type"
        list="transport-type-suggestions"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        placeholder="Open car carrier, flatbed, dry van…"
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
      />
      <datalist id="transport-type-suggestions">
        {TRANSPORT_TYPE_SUGGESTIONS.map((t) => <option key={t} value={t} />)}
      </datalist>
      <p className="text-xs text-gray-500 mt-1">
        The truck or trailer this load moves on. Printed on the SA, the Dispatch Sheet and the BOL.
      </p>
    </div>
  );
}
