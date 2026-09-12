'use client';

import { useEffect, useState } from 'react';
import { listDriversForCarrier } from '@/lib/drivers';
import { driverDisplayName, getLicenseStatus } from '@/types/driver';
import type { Driver } from '@/types/driver';
import DriverFormModal from './DriverFormModal';

/** What picking a driver fills in on the load. */
export interface DriverChoice {
  driverId: string | null;
  driverName: string;
  driverPhone: string;
  /** Only offered when the driver record carries one; never clears the load's own. */
  driverLicenseStoragePath: string | null;
}

interface Props {
  /** The carrier selected on the load. Empty disables the picker. */
  carrierId: string;
  /** The driver currently on the load, if it was picked from a record. */
  value: string | null | undefined;
  onPick: (choice: DriverChoice) => void;
  /** Shown under the control, e.g. where the current name came from. */
  hint?: string;
}

const NEW_DRIVER = '__new__';
/** Chosen when the person behind the wheel is not one of the carrier's records. */
const ONE_OFF = '__one_off__';

/**
 * Pick which of a carrier's drivers is running a load.
 *
 * This does not own the driver name and phone on the order — the fields below
 * it still do. Picking here fills them in, and typing over them afterwards is
 * allowed and clears the link back to the record. That is deliberate: a driver
 * swapped at 5am gets typed onto the load by whoever answers the phone, and a
 * picker that refused to let them would be worked around by not using it.
 *
 * Drivers are loaded per carrier, which is one indexed query over a handful of
 * documents. It re-runs when the carrier changes, because the drivers of the
 * carrier you just moved away from are the wrong list to be showing.
 */
export default function DriverPicker({ carrierId, value, onPick, hint }: Props) {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding]   = useState(false);
  const [error, setError]     = useState('');

  useEffect(() => {
    if (!carrierId) { setDrivers([]); return; }
    let live = true;
    setLoading(true);
    setError('');
    listDriversForCarrier(carrierId)
      .then((list) => { if (live) setDrivers(list); })
      .catch((e: unknown) => {
        if (live) setError(e instanceof Error ? e.message : 'Could not load drivers');
      })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [carrierId]);

  function choose(e: React.ChangeEvent<HTMLSelectElement>) {
    const picked = e.target.value;
    if (picked === NEW_DRIVER) { setAdding(true); return; }
    if (picked === ONE_OFF) {
      // Unlinks without wiping what is already typed on the load — the name
      // in the box is usually right, it just is not one of these records.
      onPick({ driverId: null, driverName: '', driverPhone: '', driverLicenseStoragePath: null });
      return;
    }
    const driver = drivers.find((d) => d.id === picked);
    if (!driver) return;
    onPick({
      driverId:    driver.id,
      driverName:  driver.name,
      driverPhone: driver.phone,
      driverLicenseStoragePath: driver.licenseStoragePath ?? null,
    });
  }

  function handleSaved(driver: Driver) {
    setDrivers((prev) => [...prev, driver].sort((a, b) => a.name.localeCompare(b.name)));
    setAdding(false);
    onPick({
      driverId:    driver.id,
      driverName:  driver.name,
      driverPhone: driver.phone,
      driverLicenseStoragePath: driver.licenseStoragePath ?? null,
    });
  }

  // A retired driver still shows while they are the one on this load — hiding
  // them would silently blank the selection on an order that already went out.
  const selectable = drivers.filter((d) => d.isActive || d.id === value);
  const selected   = drivers.find((d) => d.id === value) ?? null;
  const licence    = selected ? getLicenseStatus(selected.licenseExpiration) : 'unknown';

  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">Driver</label>
      <select
        value={value ?? ONE_OFF}
        onChange={choose}
        disabled={!carrierId || loading}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 disabled:bg-gray-50 disabled:text-gray-400"
      >
        <option value={ONE_OFF}>
          {carrierId ? 'Not from this carrier’s list' : 'Pick a carrier first'}
        </option>
        {selectable.map((d) => (
          <option key={d.id} value={d.id}>
            {driverDisplayName(d)}
            {d.phone ? ` · ${d.phone}` : ''}
            {d.isActive ? '' : ' (retired)'}
          </option>
        ))}
        {carrierId && <option value={NEW_DRIVER}>+ Add a driver…</option>}
      </select>

      {loading && <p className="text-xs text-gray-400 mt-1">Loading drivers…</p>}
      {error   && <p className="text-xs text-red-500 mt-1">{error}</p>}

      {!loading && !error && carrierId && drivers.length === 0 && (
        <p className="text-xs text-gray-500 mt-1">
          No drivers on file for this carrier yet. Add one and it is saved to their record.
        </p>
      )}

      {licence === 'expired' && (
        <p className="text-xs text-red-600 mt-1">This driver&rsquo;s licence has expired.</p>
      )}
      {licence === 'expiring_soon' && (
        <p className="text-xs text-amber-700 mt-1">This driver&rsquo;s licence expires within 30 days.</p>
      )}

      {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}

      {adding && (
        <DriverFormModal
          carrierId={carrierId}
          driver={null}
          onSaved={handleSaved}
          onCancel={() => setAdding(false)}
        />
      )}
    </div>
  );
}
