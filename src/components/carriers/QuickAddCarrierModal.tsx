'use client';

import { useState } from 'react';
import { Timestamp } from 'firebase/firestore';
import { createCarrier } from '@/lib/carriers';
import type { Carrier } from '@/types/carrier';
import PersonNameFields from '@/components/PersonNameFields';
import DateField from '@/components/DateField';

/**
 * Quick-add carrier, used from the carrier dropdown on an order.
 *
 * Brokers routinely book a carrier they have never used before, mid-order.
 * Sending them to /dashboard/carriers/new would throw away the assignment
 * already in progress (driver name, phone, an uploaded license), so this
 * captures the carrier without leaving the page.
 *
 * It deliberately asks for less than the full Add Carrier page: everything
 * omitted here is editable later on the carrier record. Email is included
 * because the e-sign agreement is mailed to it, and insurance expiration
 * because an order should not quietly get a carrier with unknown coverage.
 */
export default function QuickAddCarrierModal({
  onCreated,
  onCancel,
}: {
  onCreated: (carrier: Carrier) => void;
  onCancel: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const [companyName, setCompanyName]       = useState('');
  const [contactName, setContactName]       = useState('');
  const [phone, setPhone]                   = useState('');
  const [email, setEmail]                   = useState('');
  const [dot, setDot]                       = useState('');
  const [mc, setMc]                         = useState('');
  const [insuranceExpiration, setInsExpiry] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const fields = {
        batsId:                null,
        companyName:           companyName.trim(),
        contactName:           contactName.trim(),
        email:                 email.trim(),
        phone:                 phone.trim(),
        dot:                   dot.trim(),
        mc:                    mc.trim(),
        address:               '',
        fax:                   '',
        dispatcher:            '',
        dispatcherPhone:       '',
        dispatcherEmail:       '',
        billingContact:        '',
        billingPhone:          '',
        billingEmail:          '',
        insuranceProvider:     '',
        insurancePolicyNumber: '',
        insuranceExpiration:   insuranceExpiration
          ? Timestamp.fromDate(new Date(insuranceExpiration))
          : null,
        isActive: true,
        notes:    '',
      };
      const id = await createCarrier(fields);
      // Hand back a Carrier shaped like the ones in the dropdown so the caller
      // can select it immediately; createdAt/updatedAt are server-stamped and
      // only matter once the record is re-read.
      onCreated({ id, ...fields } as unknown as Carrier);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create carrier');
      setSaving(false);
    }
  }

  const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl border border-gray-200 shadow-xl w-full max-w-lg max-h-full overflow-y-auto">
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">New Carrier</h2>
            <p className="text-xs text-gray-500 mt-1">
              Saved to Carriers and assigned to this order. You can fill in billing,
              address and policy details on the carrier record afterwards.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="col-span-1 sm:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Company Name</label>
              <input required autoFocus value={companyName} onChange={(e) => setCompanyName(e.target.value)}
                placeholder="e.g. Swift Transport LLC" className={inputCls} />
            </div>
            <div className="col-span-1 sm:col-span-2">
              <PersonNameFields label="Contact" value={contactName} onChange={setContactName} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                placeholder="(555) 555-5555" className={inputCls} />
            </div>
            <div className="col-span-1 sm:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="dispatch@carrier.com" className={inputCls} />
              <p className="text-xs text-gray-500 mt-1">The carrier agreement is emailed here.</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">DOT Number</label>
              <input value={dot} onChange={(e) => setDot(e.target.value)}
                placeholder="e.g. 1234567" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">MC / FF Number</label>
              <input value={mc} onChange={(e) => setMc(e.target.value)}
                placeholder="e.g. MC-123456" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Insurance Expiration</label>
              <DateField value={insuranceExpiration} onChange={setInsExpiry}
                className={inputCls} />
            </div>
          </div>

          {error && <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600">{error}</div>}

          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={saving}
              className="px-4 py-2 bg-brand-600 text-white text-xs font-semibold rounded-lg hover:bg-brand-700 disabled:opacity-50 transition">
              {saving ? 'Saving…' : 'Save Carrier'}
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
