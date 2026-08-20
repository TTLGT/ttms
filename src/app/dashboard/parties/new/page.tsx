'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createParty, PartyOwnedError } from '@/lib/parties';
import { PARTY_ROLES, ROLE_LABEL, BLANK_ADDRESS } from '@/types/party';
import type { Address } from '@/types/order';
import type { PartyRole } from '@/types/party';

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY',
];

function AddressFields({ label, value, onChange }: {
  label: string; value: Address; onChange: (a: Address) => void;
}) {
  const set = (k: keyof Address) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    onChange({ ...value, [k]: e.target.value });
  return (
    <div>
      <p className="text-sm font-semibold text-gray-700 mb-3">{label}</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <input placeholder="Street" value={value.street} onChange={set('street')}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
        </div>
        <input placeholder="City" value={value.city} onChange={set('city')}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
        <select value={value.state} onChange={set('state')}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400">
          <option value="">State</option>
          {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <input placeholder="ZIP" value={value.zip} onChange={set('zip')}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
      </div>
    </div>
  );
}

function NewPartyForm() {
  const router = useRouter();
  const params = useSearchParams();
  const initialRole = (params.get('role') as PartyRole) ?? 'client';

  const [companyName, setCompanyName] = useState('');
  const [contactName, setContactName] = useState('');
  const [phone, setPhone]             = useState('');
  const [email, setEmail]             = useState('');
  const [address, setAddress]         = useState<Address>(BLANK_ADDRESS);
  const [roles, setRoles]             = useState<PartyRole[]>([initialRole]);
  const [notes, setNotes]             = useState('');
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState('');
  const [duplicate, setDuplicate]     = useState<{ ownerName: string } | null>(null);

  const displayName = companyName.trim() || contactName.trim();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!displayName) { setError('Enter a company name or a contact name.'); return; }
    setError('');
    setDuplicate(null);
    setSaving(true);
    try {
      // The duplicate check happens server-side: the clash may be with a record
      // this user is not allowed to see.
      const id = await createParty({
        companyName: companyName.trim(),
        contactName: contactName.trim(),
        phone: phone.trim(),
        email: email.trim(),
        address,
        roles,
        notes: notes.trim(),
      });
      router.push(`/dashboard/parties/${id}`);
    } catch (err: unknown) {
      if (err instanceof PartyOwnedError) {
        setDuplicate({ ownerName: err.ownerName });
      } else {
        setError(err instanceof Error ? err.message : 'Failed to create');
      }
      setSaving(false);
    }
  }

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-6">
        <button onClick={() => router.back()} className="text-sm text-gray-500 hover:text-gray-700 mb-2 flex items-center gap-1">
          ← Back
        </button>
        <h1 className="text-2xl font-bold text-gray-900">New {ROLE_LABEL[initialRole]}</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          One record serves every role — tick more than one if this company both ships and receives.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Company name</label>
              <input value={companyName} onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Leave blank for an individual"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Contact name</label>
              <input value={contactName} onChange={(e) => setContactName(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
              <input value={phone} onChange={(e) => setPhone(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold text-gray-700 mb-2">Roles</p>
            <div className="flex gap-4">
              {PARTY_ROLES.map((r) => (
                <label key={r} className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={roles.includes(r)}
                    onChange={(e) => setRoles((prev) =>
                      e.target.checked ? [...prev, r] : prev.filter((x) => x !== r)
                    )}
                  />
                  {ROLE_LABEL[r]}
                </label>
              ))}
            </div>
          </div>

          <AddressFields label="Address" value={address} onChange={setAddress} />

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
          </div>
        </section>

        {duplicate && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800">
            <strong>{displayName}</strong> is already on file and belongs to{' '}
            <strong>{duplicate.ownerName}</strong>. Talk to them about using it — they or an admin
            need to approve it. You can also raise the request from the order form.
          </div>
        )}

        {error && <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-600">{error}</div>}

        <button type="submit" disabled={saving}
          className="px-4 py-2 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 transition disabled:opacity-50">
          {saving ? 'Saving…' : 'Create'}
        </button>
      </form>
    </div>
  );
}

export default function NewPartyPage() {
  return (
    <Suspense fallback={null}>
      <NewPartyForm />
    </Suspense>
  );
}
