'use client';

import { DollarSign } from 'lucide-react';
import { ACCESSORIALS, ACCESSORIAL_LABEL, isPaidService, type Accessorial } from '@/types/order';
import { Bi } from '@/components/spanish/Es';

/**
 * What the load needs beyond a truck and a driver, as tick boxes, in the
 * Freight section of the new and edit forms. The value is kept in catalog
 * order so a save never reads as a change merely because of the order in
 * which the boxes were ticked.
 *
 * Drawn in two groups: equipment the truck brings, and services somebody is
 * paid for (PAID_SERVICES), each of which opens a cost line in Price and
 * Terms. The grouping is display only — both print the same way.
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
  const box = (a: Accessorial) => (
    <label key={a} className="flex items-center gap-2 text-sm text-gray-700">
      <input type="checkbox" checked={value.includes(a)} onChange={() => toggle(a)}
        className="rounded border-gray-300 text-brand-600 focus:ring-brand-400" />
      {ACCESSORIAL_LABEL[a]}
    </label>
  );
  const grid = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-1.5';

  return (
    <div className="border-t border-gray-100 pt-4 space-y-4">
      <div>
        <p data-es className="text-sm font-medium text-gray-700">Accessorials</p>
        <p className="text-xs text-gray-500 mb-2">
          <Bi>What the truck or the stops need for this load. Printed on the BOL, the client&apos;s SA and the carrier&apos;s
          Dispatch Sheet. Anything not listed goes in the special instructions.</Bi>
        </p>
        <div className={grid}>{ACCESSORIALS.filter((a) => !isPaidService(a)).map(box)}</div>
      </div>
      <div>
        <p data-es className="text-sm font-medium text-gray-700 flex items-center gap-1">
          <DollarSign className="w-3.5 h-3.5 text-gray-500" aria-hidden />
          Additional Services
        </p>
        <p className="text-xs text-gray-500 mb-2">
          <Bi>Services the client pays for on top of the move. Ticking one opens a line for its cost in Price and
          Terms, which is added to the Agreed Rate. A service not listed can be added there by hand.</Bi>
        </p>
        <div className={grid}>{ACCESSORIALS.filter(isPaidService).map(box)}</div>
      </div>
    </div>
  );
}
