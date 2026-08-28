'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Timestamp } from 'firebase/firestore';
import { getCarrier, updateCarrier } from '@/lib/carriers';
import PersonNameFields from '@/components/PersonNameFields';
import { listOrders } from '@/lib/orders';
import type { Carrier } from '@/types/carrier';
import type { Order } from '@/types/order';
import { orderDisplayNumber } from '@/types/order';
import InsuranceBadge from '@/components/carriers/InsuranceBadge';
import StatusBadge from '@/components/orders/StatusBadge';
import { useDateFormatters } from '@/lib/useDateFormatters';
import DateField from '@/components/DateField';

function toDateInput(ts: { toDate?: () => Date } | null | undefined): string {
  if (!ts || typeof ts.toDate !== 'function') return '';
  const d = ts.toDate();
  return d.toISOString().split('T')[0];
}

function formatCurrency(n: number | undefined): string {
  if (!n) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400';

export default function CarrierDetailPage() {
  // Dates are written the way the company setting says — see Settings →
  // Operations → Date Format.
  const { formatDate } = useDateFormatters();
  const params    = useParams();
  const carrierId = params.carrierId as string;

  const [carrier, setCarrier]   = useState<Carrier | null>(null);
  const [orders, setOrders]     = useState<Order[]>([]);
  const [loading, setLoading]   = useState(true);
  const [editing, setEditing]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');
  const [tab, setTab]           = useState<'details' | 'orders'>('details');

  // edit fields
  const [companyName, setCompanyName]           = useState('');
  const [contactName, setContactName]           = useState('');
  const [email, setEmail]                       = useState('');
  const [phone, setPhone]                       = useState('');
  const [address, setAddress]                   = useState('');
  const [fax, setFax]                           = useState('');
  const [dot, setDot]                           = useState('');
  const [mc, setMc]                             = useState('');
  const [dispatcher, setDispatcher]             = useState('');
  const [dispatcherPhone, setDispatcherPhone]   = useState('');
  const [dispatcherEmail, setDispatcherEmail]   = useState('');
  const [billingContact, setBillingContact]     = useState('');
  const [billingPhone, setBillingPhone]         = useState('');
  const [billingEmail, setBillingEmail]         = useState('');
  const [insProvider, setInsProvider]           = useState('');
  const [insPolicyNo, setInsPolicyNo]           = useState('');
  const [insExpiry, setInsExpiry]               = useState('');
  const [isActive, setIsActive]                 = useState(true);
  const [notes, setNotes]                       = useState('');

  function syncFields(c: Carrier) {
    setCompanyName(c.companyName);
    setContactName(c.contactName ?? '');
    setEmail(c.email ?? '');
    setPhone(c.phone ?? '');
    setAddress(c.address ?? '');
    setFax(c.fax ?? '');
    setDot(c.dot ?? '');
    setMc(c.mc ?? '');
    setDispatcher(c.dispatcher ?? '');
    setDispatcherPhone(c.dispatcherPhone ?? '');
    setDispatcherEmail(c.dispatcherEmail ?? '');
    setBillingContact(c.billingContact ?? '');
    setBillingPhone(c.billingPhone ?? '');
    setBillingEmail(c.billingEmail ?? '');
    setInsProvider(c.insuranceProvider ?? '');
    setInsPolicyNo(c.insurancePolicyNumber ?? '');
    setInsExpiry(toDateInput(c.insuranceExpiration));
    setIsActive(c.isActive ?? true);
    setNotes(c.notes ?? '');
  }

  useEffect(() => {
    async function load() {
      try {
        const c = await getCarrier(carrierId);
        setCarrier(c);
        if (c) syncFields(c);
        const all = await listOrders();
        setOrders(all.filter((o) => o.carrierId === carrierId));
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        setLoading(false);
      }
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carrierId]);

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const updates: Partial<Omit<Carrier, 'id' | 'createdAt'>> = {
        companyName:          companyName.trim(),
        contactName:          contactName.trim(),
        email:                email.trim(),
        phone:                phone.trim(),
        address:              address.trim(),
        fax:                  fax.trim(),
        dot:                  dot.trim(),
        mc:                   mc.trim(),
        dispatcher:           dispatcher.trim(),
        dispatcherPhone:      dispatcherPhone.trim(),
        dispatcherEmail:      dispatcherEmail.trim(),
        billingContact:       billingContact.trim(),
        billingPhone:         billingPhone.trim(),
        billingEmail:         billingEmail.trim(),
        insuranceProvider:    insProvider.trim(),
        insurancePolicyNumber: insPolicyNo.trim(),
        insuranceExpiration:  insExpiry ? Timestamp.fromDate(new Date(insExpiry)) : null,
        isActive,
        notes:                notes.trim(),
      };
      await updateCarrier(carrierId, updates);
      setCarrier((prev) => prev ? { ...prev, ...updates } as Carrier : prev);
      setEditing(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  function cancelEdit() {
    if (carrier) syncFields(carrier);
    setEditing(false);
  }

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!carrier) return (
    <div className="p-8">
      <p className="text-gray-500">Carrier not found.</p>
      <Link href="/dashboard/carriers" className="text-sm text-brand-600 hover:underline mt-2 block">← Back to Carriers</Link>
    </div>
  );

  return (
    <div className="p-8 max-w-4xl">
      <Link href="/dashboard/carriers" className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 mb-4">
        ← Carriers
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-gray-900">{carrier.companyName}</h1>
            <InsuranceBadge expiration={carrier.insuranceExpiration} />
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
              carrier.isActive ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
            }`}>
              {carrier.isActive ? 'Active' : 'Inactive'}
            </span>
          </div>
          <p className="text-sm text-gray-500">
            {carrier.dot && `DOT ${carrier.dot}`}
            {carrier.dot && carrier.mc && ' · '}
            {carrier.mc && `MC ${carrier.mc}`}
            {!carrier.dot && !carrier.mc && 'No authority on file'}
          </p>
        </div>
        {!editing ? (
          <button onClick={() => setEditing(true)}
            className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition">
            Edit
          </button>
        ) : (
          <div className="flex gap-2">
            <button onClick={cancelEdit}
              className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition">
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving}
              className="px-4 py-2 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 disabled:opacity-50 transition">
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
          {/* Company Info */}
          <section className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Company Info</h3>
            {!editing ? (
              <div className="grid grid-cols-3 gap-6">
                {[
                  ['Contact', carrier.contactName],
                  ['Phone', carrier.phone],
                  ['Email', carrier.email],
                  ['Address', carrier.address],
                  ['Fax', carrier.fax],
                ].map(([label, val]) => (
                  <div key={label as string}>
                    <p className="text-xs text-gray-500 mb-0.5">{label}</p>
                    <p className="text-sm text-gray-900">{val || '—'}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Company Name</label>
                  <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} className={inputCls} />
                </div>
                <div className="col-span-2">
                  <PersonNameFields label="Contact" value={contactName} onChange={setContactName} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
                  <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Address (City, State)</label>
                  <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Chicago, IL" className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Fax</label>
                  <input type="tel" value={fax} onChange={(e) => setFax(e.target.value)} className={inputCls} />
                </div>
              </div>
            )}
          </section>

          {/* Authority */}
          <section className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Authority</h3>
            {!editing ? (
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">DOT Number</p>
                  <p className="text-sm font-mono text-gray-900">{carrier.dot || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">MC / FF Number</p>
                  <p className="text-sm font-mono text-gray-900">{carrier.mc || '—'}</p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">DOT Number</label>
                  <input value={dot} onChange={(e) => setDot(e.target.value)} placeholder="1234567" className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">MC / FF Number</label>
                  <input value={mc} onChange={(e) => setMc(e.target.value)} placeholder="MC-123456" className={inputCls} />
                </div>
              </div>
            )}
          </section>

          {/* Dispatcher */}
          {(carrier.dispatcher || carrier.dispatcherPhone || carrier.dispatcherEmail || editing) && (
            <section className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Dispatcher</h3>
              {!editing ? (
                <div className="grid grid-cols-3 gap-6">
                  {[
                    ['Name', carrier.dispatcher],
                    ['Phone', carrier.dispatcherPhone],
                    ['Email', carrier.dispatcherEmail],
                  ].map(([label, val]) => (
                    <div key={label as string}>
                      <p className="text-xs text-gray-500 mb-0.5">{label}</p>
                      <p className="text-sm text-gray-900">{val || '—'}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <PersonNameFields label="Dispatcher" value={dispatcher} onChange={setDispatcher} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Dispatcher Phone</label>
                    <input type="tel" value={dispatcherPhone} onChange={(e) => setDispatcherPhone(e.target.value)} className={inputCls} />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Dispatcher Email</label>
                    <input type="email" value={dispatcherEmail} onChange={(e) => setDispatcherEmail(e.target.value)} className={inputCls} />
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Billing Contact */}
          {(carrier.billingContact || carrier.billingPhone || carrier.billingEmail || editing) && (
            <section className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Billing Contact</h3>
              {!editing ? (
                <div className="grid grid-cols-3 gap-6">
                  {[
                    ['Name', carrier.billingContact],
                    ['Phone', carrier.billingPhone],
                    ['Email', carrier.billingEmail],
                  ].map(([label, val]) => (
                    <div key={label as string}>
                      <p className="text-xs text-gray-500 mb-0.5">{label}</p>
                      <p className="text-sm text-gray-900">{val || '—'}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <PersonNameFields label="Billing Contact" value={billingContact} onChange={setBillingContact} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Billing Phone</label>
                    <input type="tel" value={billingPhone} onChange={(e) => setBillingPhone(e.target.value)} className={inputCls} />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Billing Email</label>
                    <input type="email" value={billingEmail} onChange={(e) => setBillingEmail(e.target.value)} className={inputCls} />
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Insurance */}
          <section className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Insurance</h3>
            {!editing ? (
              <div className="grid grid-cols-3 gap-6">
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">Provider</p>
                  <p className="text-sm text-gray-900">{carrier.insuranceProvider || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">Policy Number</p>
                  <p className="text-sm text-gray-900">{carrier.insurancePolicyNumber || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">Expiration</p>
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-gray-900">
                      {formatDate(carrier.insuranceExpiration as { toDate: () => Date } | null)}
                    </p>
                    <InsuranceBadge expiration={carrier.insuranceExpiration} />
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Provider</label>
                  <input value={insProvider} onChange={(e) => setInsProvider(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Policy Number</label>
                  <input value={insPolicyNo} onChange={(e) => setInsPolicyNo(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Expiration Date</label>
                  <DateField value={insExpiry} onChange={setInsExpiry} className={inputCls} />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 cursor-pointer mb-2">
                    <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="w-4 h-4 rounded" />
                    <span className="text-sm text-gray-700">Active carrier</span>
                  </label>
                </div>
              </div>
            )}
          </section>

          {/* Notes */}
          {(!editing && carrier.notes) || editing ? (
            <section className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Notes</h3>
              {editing ? (
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 resize-none" />
              ) : (
                <p className="text-sm text-gray-700 whitespace-pre-line">{carrier.notes}</p>
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
              <p className="text-sm text-gray-400">No orders assigned to this carrier yet.</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="min-w-full divide-y divide-gray-100">
                <thead className="bg-gray-50">
                  <tr>
                    {['Order #', 'Shipper', 'Route', 'Status', 'Pickup', 'Carrier Pay', ''].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {orders.map((o) => (
                    <tr key={o.id} className="hover:bg-gray-50 transition">
                      <td className="px-4 py-3 text-sm font-mono font-medium text-brand-700">{orderDisplayNumber(o)}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{o.shipperName || '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {o.origin?.city}, {o.origin?.state} → {o.destination?.city}, {o.destination?.state}
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={o.status} /></td>
                      <td className="px-4 py-3 text-sm text-gray-600">{formatDate(o.pickupDate as { toDate: () => Date } | null)}</td>
                      <td className="px-4 py-3 text-sm text-gray-800">{formatCurrency(o.carrierPay)}</td>
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
