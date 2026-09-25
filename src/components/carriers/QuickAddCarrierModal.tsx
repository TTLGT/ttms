'use client';

import { useState } from 'react';
import { Timestamp } from 'firebase/firestore';
import { createCarrier } from '@/lib/carriers';
import type { Carrier } from '@/types/carrier';
import { parseCoverageInput, carrierNumber } from '@/types/carrier';
import ContactTitleSelect from '@/components/carriers/ContactTitleSelect';
import PersonNameFields from '@/components/PersonNameFields';
import DateField from '@/components/DateField';
import InsuranceFileUpload from './InsuranceFileUpload';
import CoverageInput from './CoverageInput';
import PhoneField from '@/components/PhoneField';
import { phoneRegionOf } from '@/lib/phone';
import type { PhoneRegion } from '@/lib/phone';

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
 * because the e-sign agreement is mailed to it, and the whole of the insurance
 * block — the same five fields BATS asks for, plus the certificate — because
 * an order should not quietly get a carrier with unknown coverage, and the
 * insurance is what gets checked before a load is tendered.
 */
export default function QuickAddCarrierModal({
  prefillName = '',
  onCreated,
  onCancel,
}: {
  /** The name already typed into the picker that opened this. */
  prefillName?: string;
  onCreated: (carrier: Carrier) => void;
  onCancel: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const [companyName, setCompanyName]       = useState(prefillName);
  const [contactName, setContactName]       = useState('');
  const [contactTitle, setContactTitle]      = useState('');
  const [phone, setPhone]                   = useState('');
  const [phoneRegion, setPhoneRegion]       = useState<PhoneRegion | undefined>(undefined);
  const [email, setEmail]                   = useState('');
  const [dot, setDot]                       = useState('');
  const [mc, setMc]                         = useState('');
  const [insuranceProvider, setInsProvider] = useState('');
  const [insurancePolicyNumber, setInsPolicyNo] = useState('');
  const [insuranceExpiration, setInsExpiry] = useState('');
  const [insuranceStoragePath, setInsFile]  = useState<string | null>(null);
  const [insuranceCoverage, setInsCoverage] = useState('');
  const [insuranceCargoCoverage, setInsCargo] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const fields = {
        batsId:                null,
        companyName:           companyName.trim(),
        contactName:           contactName.trim(),
        contactTitle,
        email:                 email.trim(),
        phone:                 phone.trim(),
        phoneRegion:           phoneRegionOf(phoneRegion),
        dot:                   carrierNumber(dot),
        mc:                    carrierNumber(mc),
        address:               '',
        fax:                   '',
        dispatcher:            '',
        dispatcherPhone:       '',
        dispatcherEmail:       '',
        billingContact:        '',
        billingPhone:          '',
        billingEmail:          '',
        insuranceProvider:     insuranceProvider.trim(),
        insurancePolicyNumber: insurancePolicyNumber.trim(),
        insuranceExpiration:   insuranceExpiration
          ? Timestamp.fromDate(new Date(insuranceExpiration))
          : null,
        insuranceStoragePath,
        insuranceCoverage:     parseCoverageInput(insuranceCoverage),
        insuranceCargoCoverage: parseCoverageInput(insuranceCargoCoverage),
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
              Saved to Carriers and assigned to this order. You can fill in billing
              and address details on the carrier record afterwards.
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
            <ContactTitleSelect value={contactTitle} onChange={setContactTitle} className={inputCls} />
            <PhoneField
              label="Phone"
              value={phone}
              region={phoneRegion}
              onChange={(v, r) => { setPhone(v); setPhoneRegion(r); }}
            />
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
                placeholder="e.g. 123456" className={inputCls} />
            </div>
            <h3 className="col-span-1 sm:col-span-2 pt-2 border-t border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Insurance
            </h3>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Insurance Company</label>
              <input value={insuranceProvider} onChange={(e) => setInsProvider(e.target.value)}
                placeholder="e.g. Progressive Commercial" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Policy Number</label>
              <input value={insurancePolicyNumber} onChange={(e) => setInsPolicyNo(e.target.value)}
                placeholder="e.g. CW6120874-00" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Expiration Date</label>
              <DateField value={insuranceExpiration} onChange={setInsExpiry}
                className={inputCls} />
            </div>
            <div className="hidden sm:block" />
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Liability Amount</label>
              <CoverageInput value={insuranceCoverage} onChange={setInsCoverage}
                placeholder="e.g. 1,000,000" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Cargo Amount</label>
              <CoverageInput value={insuranceCargoCoverage} onChange={setInsCargo}
                placeholder="e.g. 100,000" className={inputCls} />
            </div>
            <div className="col-span-1 sm:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Certificate of Insurance</label>
              {/* No carrier id yet — the file is filed under a draft key and
                  the path saved with the record below. */}
              <InsuranceFileUpload carrierId={null} value={insuranceStoragePath} onChange={setInsFile} />
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
