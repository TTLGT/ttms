'use client';

import { ACCESSORIALS, ACCESSORIAL_LABEL, type Accessorial } from '@/types/order';

/**
 * What the load needs beyond a truck and a driver, as tick boxes, in the
 * Freight section of the new and edit forms. The value is kept in catalog
 * order so a save never reads as a change merely because of the order in
 * which the boxes were ticked.
 */
export default function AccessorialsField({ value, onChange }: {
  value: Accessorial[];
  onChange: (v: Accessorial[]) => void;
}) {
  const toggle = (a: Accessorial) => {
    const on = new Set(value);
    if (on.has(a)) on.delete(a); else on.add(a);
    onChange(ACCESSORIALS.filter((x) => on.has(x)));
  };
  return (
    <div className="border-t border-gray-100 pt-4">
      <p className="text-sm font-medium text-gray-700">Accessorials</p>
      <p className="text-xs text-gray-500 mb-2">
        What the truck or the stops need for this load. Printed on the BOL, the client&apos;s SA and the carrier&apos;s
        Dispatch Sheet. Anything not listed goes in the special instructions.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-1.5">
        {ACCESSORIALS.map((a) => (
          <label key={a} className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={value.includes(a)} onChange={() => toggle(a)}
              className="rounded border-gray-300 text-brand-600 focus:ring-brand-400" />
            {ACCESSORIAL_LABEL[a]}
          </label>
        ))}
      </div>
    </div>
  );
}
