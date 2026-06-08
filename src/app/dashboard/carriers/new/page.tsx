'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Timestamp } from 'firebase/firestore';
import { createCarrier } from '@/lib/carriers';

export default function NewCarrierPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const [companyName, setCompanyName]           = useState('');
  const [contactName, setContactName]           = useState('');
  const [email, setEmail]                       = useState('');
  const [phone, setPhone]                       = useState('');
  const [dot, setDot]                           = useState('');
  const [mc, setMc]                             = useState('');
  const [insuranceProvider, setInsProvider]     = useState('');
  const [insurancePolicyNumber, setInsPolicyNo] = useState('');
  const [insuranceExpiration, setInsExpiry]     = useState('');
  const [isActive, setIsActive]                 = useState(true);
  const [notes, setNotes]                       = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const id = await createCarrier({
        companyName:          companyName.trim(),
        contactName:          contactName.trim(),
        email:                email.trim(),
        phone:                phone.trim(),
        dot:                  dot.trim(),
        mc:                   mc.trim(),
        insuranceProvider:    insuranceProvider.trim(),
        insurancePolicyNumber: insurancePolicyNumber.trim(),
        insuranceExpiration:  insuranceExpiration
          ? Timestamp.fromDate(new Date(insuranceExpiration))
          : null,
        isActive,
        notes: notes.trim(),
      });
      router.push(`/dashboard/carriers/${id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create carrier');
      setSaving(false);
    }
  }

  const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400';

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-6">
        <button onClick={() => router.back()} className="text-sm text-gray-500 hover:text-gray-700 mb-2 flex items-center gap-1">
          ← Back
        </button>
        <h1 className="text-2xl font-bold text-gray-900">Add Carrier</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Company Info */}
        <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Company Info</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Company Name</label>
              <input required value={companyName} onChange={(e) => setCompanyName(e.target.value)}
                placeholder="e.g. Swift Transport LLC" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Contact Name</label>
              <input value={contactName} onChange={(e) => setContactName(e.target.value)}
                placeholder="Primary contact" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                placeholder="(555) 555-5555" className={inputCls} />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="dispatch@carrier.com" className={inputCls} />
            </div>
          </div>
        </section>

        {/* Authority */}
        <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Authority</h2>
          <div className="grid grid-cols-2 gap-4">
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
          </div>
        </section>

        {/* Insurance */}
        <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Insurance</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Provider</label>
              <input value={insuranceProvider} onChange={(e) => setInsProvider(e.target.value)}
                placeholder="e.g. Progressive Commercial" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Policy Number</label>
              <input value={insurancePolicyNumber} onChange={(e) => setInsPolicyNo(e.target.value)}
                placeholder="Policy #" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Expiration Date</label>
              <input type="date" value={insuranceExpiration} onChange={(e) => setInsExpiry(e.target.value)}
                className={inputCls} />
            </div>
          </div>
        </section>

        {/* Status & Notes */}
        <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Status & Notes</h2>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)}
              className="w-4 h-4 rounded" />
            <span className="text-sm text-gray-700 font-medium">Active carrier</span>
          </label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
            placeholder="Internal notes about this carrier…"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 resize-none" />
        </section>

        {error && <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-600">{error}</div>}

        <div className="flex gap-3">
          <button type="submit" disabled={saving}
            className="px-6 py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 disabled:opacity-50 transition">
            {saving ? 'Saving…' : 'Save Carrier'}
          </button>
          <button type="button" onClick={() => router.back()}
            className="px-6 py-2.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
