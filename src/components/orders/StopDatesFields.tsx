'use client';

import DateField from '@/components/DateField';
import DateRangeField from '@/components/DateRangeField';
import { Bi } from '@/components/spanish/Es';
import type { StopKind } from '@/types/order';

/**
 * The "when" of one stop on an order form: its appointment day or window and,
 * for a pickup, the first day the freight is ready.
 *
 * These used to sit in the General card as one Pickup Date, one Delivery Date
 * and one First Available (moved 2026-11-11). On a load with two pickups that
 * read as if the dates covered the whole trip, when they were only the first
 * stop's — the extra stops already had their own date inside their box. Now
 * every stop's date sits under its own company and address, the same block
 * for the first stop as for the rest.
 *
 * The first stop still saves to the order's own `pickupDate` / `deliveryDate`
 * / `firstAvailablePickup` — see OrderStop — so nothing that reads those
 * fields notices the move.
 */

const INPUT = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400';

export interface StopDates {
  date: string;
  dateEnd: string;
  /** Pickups only; ignored for a delivery. */
  firstAvailable: string;
}

interface Props {
  kind: StopKind;
  value: StopDates;
  onChange: (change: Partial<StopDates>) => void;
  /** Ids for the reviewer's "take me to this field" links on the edit form. */
  dateFieldId?: string;
  firstAvailableFieldId?: string;
}

export default function StopDatesFields({ kind, value, onChange, dateFieldId, firstAvailableFieldId }: Props) {
  return (
    <div className="space-y-3">
      <div id={dateFieldId}>
        <DateRangeField label={kind === 'pickup' ? 'Pickup date' : 'Delivery date'}
          start={value.date} end={value.dateEnd}
          onStartChange={(date) => onChange({ date })}
          onEndChange={(dateEnd) => onChange({ dateEnd })}
          className={INPUT} />
      </div>
      {kind === 'pickup' && (
        <div id={firstAvailableFieldId}>
          <label data-es className="block text-xs font-medium text-gray-600 mb-1">First available</label>
          <DateField value={value.firstAvailable} onChange={(firstAvailable) => onChange({ firstAvailable })}
            className={INPUT} />
          <p className="text-xs text-gray-500 mt-1"><Bi>Earliest the freight at this stop is ready, as the client said.</Bi></p>
        </div>
      )}
    </div>
  );
}
