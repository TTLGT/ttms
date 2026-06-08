'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { getShipper, updateShipper } from '@/lib/shippers';
import { listOrders } from '@/lib/orders';
import type { Shipper, Contact } from '@/types/shipper';
import type { Address, Order } from '@/types/order';
import { BLANK_CONTACT } from '@/types/shipper';
import StatusBadge from '@/components/orders/StatusBadge';

const BLANK_ADDRESS: Address = { street: '', city: '', state: '', zip: '', country: 'US' };

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

function formatDate(ts: { toDate?: () => Date } | null | undefined): string {
  if (!ts || typeof ts.toDate !== 'function') return '—';
  return ts.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatCurrency(n: number | undefined): string {
  if (!n) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

export default function ShipperDetailPage() {
  const params     = useParams();
  const shipperId  = params.shipperId as string;
  const router     = useRouter();

  const [shipper, setShipper]   = useState<Shipper | null>(null);
  const [orders, setOrders]     = useState<Order[]>([]);
  const [loading, setLoading]   = useState(true);
  const [editing, setEditing]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');
  const [tab, setTab]           = useState<'details' | 'orders'>('details');

  // edit state
  const [companyName, setCompanyName] = useState('');
  const [contacts, setContacts]       = useState<Contact[]>([]);
  const [defaultOrigin, setOrigin]    = useState<Address>(BLANK_ADDRESS);
  const [defaultDest, setDest]        = useState<Address>(BLANK_ADDRESS);
  const [notes, setNotes]             = useState('');

  useEffect(() => {
    async function load() {
      try {
        const s = await getShipper(shipperId);
        setShipper(s);
        if (s) {
          setCompanyName(s.companyName);
          setContacts(s.contacts?.length ? s.contacts : [{ ...BLANK_CONTACT }]);
          setOrigin(s.defaultOrigin ?? BLANK_ADDRESS);
          setDest(s.defaultDest ?? BLANK_ADDRESS);
          setNotes(s.notes ?? '');
        }
        const all = await listOrders();
        setOrders(all.filter((o) => o.shipperId === shipperId || o.shipperName === s?.companyName));
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [shipperId]);

  function updateContact(i: number, field: keyof Contact, val: string) {
    setContacts((prev) => prev.map((c, idx) => idx === i ? { ...c, [field]: val } : c));
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const cleanContacts = contacts.filter((c) => c.name.trim());
      const originIsBlank = !defaultOrigin.city && !defaultOrigin.street;
      const destIsBlank   = !defaultDest.city && !defaultDest.street;
      await updateShipper(shipperId, {
        companyName:   companyName.trim(),
        contacts:      cleanContacts,
        defaultOrigin: originIsBlank ? null : defaultOrigin,
        defaultDest:   destIsBlank   ? null : defaultDest,
        notes:         notes.trim(),
      });
      setShipper((prev) => prev ? {
        ...prev,
        companyName: companyName.trim(),
        contacts: cleanContacts,
        defaultOrigin: originIsBlank ? null : defaultOrigin,
        defaultDest:   destIsBlank   ? null : defaultDest,
        notes: notes.trim(),
      } : prev);
      setEditing(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  function cancelEdit() {
    if (!shipper) return;
    setCompanyName(shipper.companyName);
    setContacts(shipper.contacts?.length ? shipper.contacts : [{ ...BLANK_CONTACT }]);
    setOrigin(shipper.defaultOrigin ?? BLANK_ADDRESS);
    setDest(shipper.defaultDest ?? BLANK_ADDRESS);
    setNotes(shipper.notes ?? '');
    setEditing(false);
  }

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!shipper) return (
    <div className="p-8">
      <p className="text-gray-500">Shipper not found.</p>
      <Link href="/dashboard/shippers" className="text-sm text-brand-600 hover:underline mt-2 block">← Back to Shippers</Link>
    </div>
  );

  return (
    <div className="p-8 max-w-4xl">
      <Link href="/dashboard/shippers" className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 mb-4">
        ← Shippers
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{shipper.companyName}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{orders.length} orders</p>
        </div>
        {!editing ? (
          <div className="flex gap-2">
            <button
              onClick={() => setEditing(true)}
              className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition"
            >
              Edit
            </button>
            <Link
              href={`/dashboard/orders/new?shipperId=${shipperId}`}
              className="px-4 py-2 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 transition"
            >
              + New Order
            </Link>
          </div>
        ) : (
          <div className="flex gap-2">
            <button onClick={cancelEdit} className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition">
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 disabled:opacity-50 transition">
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        )}
      </div>

      {error && <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-600 mb-4">{error}</div>}

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {(['details', 'orders'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px capitalize transition ${
              tab === t ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {t === 'orders' ? `Orders (${orders.length})` : 'Details'}
          </button>
        ))}
      </div>

      {/* Details tab */}
      {tab === 'details' && (
        <div className="space-y-4">
          {/* Company name (edit mode) */}
          {editing && (
            <section className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Company</h3>
              <input
                required value={companyName} onChange={(e) => setCompanyName(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
            </section>
          )}

          {/* Contacts */}
          <section className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Contacts</h3>
              {editing && (
                <button type="button" onClick={() => setContacts((p) => [...p, { ...BLANK_CONTACT }])}
                  className="text-xs text-brand-600 hover:text-brand-700 font-medium">
                  + Add Contact
                </button>
              )}
            </div>

            {!editing ? (
              shipper.contacts?.length ? (
                <div className="divide-y divide-gray-100">
                  {shipper.contacts.map((c, i) => (
                    <div key={i} className="py-3 grid grid-cols-4 gap-4">
                      <div>
                        <p className="text-xs text-gray-500">Name</p>
                        <p className="text-sm text-gray-900 font-medium">{c.name || '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Role</p>
                        <p className="text-sm text-gray-700">{c.role || '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Email</p>
                        <p className="text-sm text-gray-700">{c.email || '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Phone</p>
                        <p className="text-sm text-gray-700">{c.phone || '—'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : <p className="text-sm text-gray-400">No contacts added.</p>
            ) : (
              <div className="space-y-3">
                {contacts.map((c, i) => (
                  <div key={i} className="grid grid-cols-2 gap-3 p-4 bg-gray-50 rounded-lg relative">
                    {contacts.length > 1 && (
                      <button type="button" onClick={() => setContacts((p) => p.filter((_, idx) => idx !== i))}
                        className="absolute top-2 right-2 text-gray-400 hover:text-red-500 text-xs">✕</button>
                    )}
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
                      <input value={c.name} onChange={(e) => updateContact(i, 'name', e.target.value)} placeholder="Full name"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Role</label>
                      <input value={c.role} onChange={(e) => updateContact(i, 'role', e.target.value)} placeholder="Billing, Operations…"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                      <input type="email" value={c.email} onChange={(e) => updateContact(i, 'email', e.target.value)} placeholder="email@example.com"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
                      <input type="tel" value={c.phone} onChange={(e) => updateContact(i, 'phone', e.target.value)} placeholder="(555) 555-5555"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Default Addresses */}
          <section className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Default Addresses</h3>
            {!editing ? (
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1">Default Origin</p>
                  <p className="text-sm text-gray-900">
                    {shipper.defaultOrigin
                      ? [shipper.defaultOrigin.street, shipper.defaultOrigin.city, shipper.defaultOrigin.state, shipper.defaultOrigin.zip].filter(Boolean).join(', ')
                      : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1">Default Destination</p>
                  <p className="text-sm text-gray-900">
                    {shipper.defaultDest
                      ? [shipper.defaultDest.street, shipper.defaultDest.city, shipper.defaultDest.state, shipper.defaultDest.zip].filter(Boolean).join(', ')
                      : '—'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-6">
                <AddressFields label="Default Origin" value={defaultOrigin} onChange={setOrigin} />
                <AddressFields label="Default Destination" value={defaultDest} onChange={setDest} />
              </div>
            )}
          </section>

          {/* Notes */}
          {(!editing && shipper.notes) || editing ? (
            <section className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Notes</h3>
              {editing ? (
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
                  placeholder="Internal notes…"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 resize-none" />
              ) : (
                <p className="text-sm text-gray-700 whitespace-pre-line">{shipper.notes}</p>
              )}
            </section>
          ) : null}
        </div>
      )}

      {/* Orders tab */}
      {tab === 'orders' && (
        <div>
          {orders.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
              <p className="text-sm text-gray-400">No orders for this shipper yet.</p>
              <Link href={`/dashboard/orders/new?shipperId=${shipperId}`}
                className="mt-3 inline-block text-sm text-brand-600 hover:underline">
                Create first order →
              </Link>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="min-w-full divide-y divide-gray-100">
                <thead className="bg-gray-50">
                  <tr>
                    {['Order #', 'Route', 'Status', 'Pickup', 'Rate', ''].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {orders.map((o) => (
                    <tr key={o.id} className="hover:bg-gray-50 transition">
                      <td className="px-4 py-3 text-sm font-mono font-medium text-brand-700">{o.orderNumber}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {o.origin?.city}, {o.origin?.state} → {o.destination?.city}, {o.destination?.state}
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={o.status} /></td>
                      <td className="px-4 py-3 text-sm text-gray-600">{formatDate(o.pickupDate as { toDate: () => Date } | null)}</td>
                      <td className="px-4 py-3 text-sm text-gray-800">{formatCurrency(o.agreedRate)}</td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/dashboard/orders/${o.id}`} className="text-xs text-brand-600 hover:underline font-medium">View →</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
