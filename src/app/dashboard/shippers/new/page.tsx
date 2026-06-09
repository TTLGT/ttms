'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createShipper } from '@/lib/shippers';
import type { Contact } from '@/types/shipper';
import type { Address } from '@/types/order';
import { BLANK_CONTACT } from '@/types/shipper';

const BLANK_ADDRESS: Address = { street: '', city: '', state: '', zip: '', country: 'US' };

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY',
];

function AddressFields({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Address;
  onChange: (a: Address) => void;
}) {
  const set = (k: keyof Address) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    onChange({ ...value, [k]: e.target.value });

  return (
    <div>
      <p className="text-sm font-semibold text-gray-700 mb-3">{label}</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <input
            placeholder="Street address"
            value={value.street}
            onChange={set('street')}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
        </div>
        <input
          placeholder="City"
          value={value.city}
          onChange={set('city')}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
        />
        <select
          value={value.state}
          onChange={set('state')}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
        >
          <option value="">State</option>
          {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <input
          placeholder="ZIP"
          value={value.zip}
          onChange={set('zip')}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
        />
      </div>
    </div>
  );
}

export default function NewShipperPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const [companyName, setCompanyName]   = useState('');
  const [contacts, setContacts]         = useState<Contact[]>([{ ...BLANK_CONTACT }]);
  const [defaultOrigin, setOrigin]      = useState<Address>(BLANK_ADDRESS);
  const [defaultDest, setDest]          = useState<Address>(BLANK_ADDRESS);
  const [notes, setNotes]               = useState('');

  function updateContact(i: number, field: keyof Contact, val: string) {
    setContacts((prev) => prev.map((c, idx) => idx === i ? { ...c, [field]: val } : c));
  }

  function addContact() {
    setContacts((prev) => [...prev, { ...BLANK_CONTACT }]);
  }

  function removeContact(i: number) {
    setContacts((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const cleanContacts = contacts.filter((c) => c.name.trim());
      const originIsBlank = !defaultOrigin.city && !defaultOrigin.street;
      const destIsBlank   = !defaultDest.city && !defaultDest.street;

      const id = await createShipper({
        companyName:    companyName.trim(),
        contacts:       cleanContacts,
        defaultOrigin:  originIsBlank ? null : defaultOrigin,
        defaultDest:    destIsBlank   ? null : defaultDest,
        assignedToUids: [],
        notes:          notes.trim(),
      });
      router.push(`/dashboard/shippers/${id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create shipper');
      setSaving(false);
    }
  }

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-6">
        <button onClick={() => router.back()} className="text-sm text-gray-500 hover:text-gray-700 mb-2 flex items-center gap-1">
          ← Back
        </button>
        <h1 className="text-2xl font-bold text-gray-900">Add Shipper</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Company */}
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">Company</h2>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Company Name</label>
            <input
              required
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="e.g. Acme Corp"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
          </div>
        </section>

        {/* Contacts */}
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Contacts</h2>
            <button
              type="button"
              onClick={addContact}
              className="text-xs text-brand-600 hover:text-brand-700 font-medium"
            >
              + Add Contact
            </button>
          </div>

          <div className="space-y-4">
            {contacts.map((contact, i) => (
              <div key={i} className="grid grid-cols-2 gap-3 p-4 bg-gray-50 rounded-lg relative">
                {contacts.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeContact(i)}
                    className="absolute top-2 right-2 text-gray-400 hover:text-red-500 text-xs"
                  >
                    ✕
                  </button>
                )}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
                  <input
                    value={contact.name}
                    onChange={(e) => updateContact(i, 'name', e.target.value)}
                    placeholder="Full name"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Role</label>
                  <input
                    value={contact.role}
                    onChange={(e) => updateContact(i, 'role', e.target.value)}
                    placeholder="e.g. Billing, Operations"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                  <input
                    type="email"
                    value={contact.email}
                    onChange={(e) => updateContact(i, 'email', e.target.value)}
                    placeholder="email@example.com"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={contact.phone}
                    onChange={(e) => updateContact(i, 'phone', e.target.value)}
                    placeholder="(555) 555-5555"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Default Addresses */}
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-1">Default Addresses</h2>
          <p className="text-xs text-gray-500 mb-5">Pre-fill origin/destination on new orders for this shipper.</p>
          <div className="grid grid-cols-2 gap-6">
            <AddressFields label="Default Origin" value={defaultOrigin} onChange={setOrigin} />
            <AddressFields label="Default Destination" value={defaultDest} onChange={setDest} />
          </div>
        </section>

        {/* Notes */}
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">Notes</h2>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Internal notes about this shipper…"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 resize-none"
          />
        </section>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-600">{error}</div>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 disabled:opacity-50 transition"
          >
            {saving ? 'Saving…' : 'Save Shipper'}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="px-6 py-2.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
