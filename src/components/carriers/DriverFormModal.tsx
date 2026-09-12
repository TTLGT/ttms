'use client';

import { useState } from 'react';
import { Timestamp } from 'firebase/firestore';
import { createDriver, updateDriver } from '@/lib/drivers';
import type { Driver } from '@/types/driver';
import PersonNameFields from '@/components/PersonNameFields';
import DateField from '@/components/DateField';
import FileUploadField from '@/components/FileUploadField';

interface Props {
  carrierId: string;
  /** The driver being edited, or null to add one. */
  driver: Driver | null;
  /** Name to start with when opened from a picker somebody was typing into. */
  prefillName?: string;
  onSaved: (driver: Driver) => void;
  onCancel: () => void;
}

function toDateInput(ts: { toDate?: () => Date } | null | undefined): string {
  if (!ts || typeof ts.toDate !== 'function') return '';
  return ts.toDate().toISOString().split('T')[0];
}

/**
 * Add or edit one of a carrier's drivers.
 *
 * The same dialog serves the carrier's Drivers tab and the quick-add inside
 * the driver picker on a load, because a driver captured mid-booking should be
 * the same record as one entered deliberately — the alternative is a thin
 * "quick" record that somebody has to go back and finish, which is how the
 * party quick-create went wrong.
 *
 * The licence goes to `driver-licenses/`, the prefix orders already use. It is
 * readable by any allowlisted account except an intern; see storage.rules.
 */
export default function DriverFormModal({
  carrierId,
  driver,
  prefillName = '',
  onSaved,
  onCancel,
}: Props) {
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const [name, setName]               = useState(driver?.name ?? prefillName);
  const [phone, setPhone]             = useState(driver?.phone ?? '');
  const [licenseNumber, setLicenseNo] = useState(driver?.licenseNumber ?? '');
  const [licenseExpiration, setExpiry] = useState(toDateInput(driver?.licenseExpiration));
  const [licenseStoragePath, setLicensePath] = useState<string | null>(driver?.licenseStoragePath ?? null);
  const [isActive, setIsActive]       = useState(driver?.isActive ?? true);
  const [notes, setNotes]             = useState(driver?.notes ?? '');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const fields = {
        carrierId,
        name:  name.trim(),
        phone: phone.trim(),
        licenseNumber: licenseNumber.trim(),
        licenseExpiration: licenseExpiration
          ? Timestamp.fromDate(new Date(licenseExpiration))
          : null,
        licenseStoragePath,
        isActive,
        notes: notes.trim(),
      };

      if (driver) {
        await updateDriver(driver.id, fields);
        onSaved({ ...driver, ...fields } as Driver);
      } else {
        const id = await createDriver(fields);
        // Shaped like the records the list holds so the caller can show it
        // immediately; the timestamps are server-stamped and only matter once
        // the record is read back.
        onSaved({ id, ...fields } as unknown as Driver);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save the driver');
      setSaving(false);
    }
  }

  const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl border border-gray-200 shadow-xl w-full max-w-lg max-h-full overflow-y-auto">
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{driver ? 'Edit Driver' : 'New Driver'}</h2>
            <p className="text-xs text-gray-500 mt-1">
              Saved against this carrier. Picking them on a load copies their name and phone
              onto it, so paperwork already sent stays as it was.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="col-span-1 sm:col-span-2">
              <PersonNameFields label="Driver Name" value={name} onChange={setName} required />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                placeholder="(555) 555-5555" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">CDL Number</label>
              <input value={licenseNumber} onChange={(e) => setLicenseNo(e.target.value)}
                placeholder="As printed on the licence" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Licence Expiration</label>
              <DateField value={licenseExpiration} onChange={setExpiry} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Driver&rsquo;s Licence</label>
              <FileUploadField
                storagePrefix="driver-licenses"
                // Keyed by the driver, not a load, so the file stays with the
                // person. A licence carried over from an order keeps its own
                // path and is never deleted from here — see FileUploadField.
                recordId={driver ? `driver-${driver.id}` : null}
                value={licenseStoragePath}
                onChange={setLicensePath}
                uploadLabel="Upload Licence"
                viewLabel="View Licence"
              />
            </div>
            <div className="col-span-1 sm:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                placeholder="Anything worth knowing before dispatching them…"
                className={`${inputCls} resize-none`} />
            </div>
            <div className="col-span-1 sm:col-span-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)}
                  className="w-4 h-4 rounded" />
                <span className="text-sm text-gray-700">Still driving for this carrier</span>
              </label>
              <p className="text-xs text-gray-500 mt-1">
                Unticking hides them from the driver picker on new loads. Past loads keep naming
                them, which is why drivers are retired rather than deleted.
              </p>
            </div>
          </div>

          {error && <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600">{error}</div>}

          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={saving}
              className="px-4 py-2 bg-brand-600 text-white text-xs font-semibold rounded-lg hover:bg-brand-700 disabled:opacity-50 transition">
              {saving ? 'Saving…' : 'Save Driver'}
            </button>
            <button type="button" onClick={onCancel}
              className="px-4 py-2 border border-gray-300 text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-50 transition">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
