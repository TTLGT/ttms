'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { useAuth } from '@/context/AuthContext';
import { createOrder } from '@/lib/orders';
import { listShippers } from '@/lib/shippers';
import type { Address } from '@/types/order';
import type { Shipper } from '@/types/shipper';

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
          <input placeholder="Street address" value={value.street} onChange={set('street')}
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

function NewOrderForm() {
  const router        = useRouter();
  const searchParams  = useSearchParams();
  const { user }      = useAuth();

  const [shippers, setShippers]       = useState<Shipper[]>([]);
  const [shipperId, setShipperId]     = useState(searchParams.get('shipperId') ?? '');
  const [shipperName, setShipperName] = useState('');
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState('');

  const [commodity, setCommodity]       = useState('');
  const [pieces, setPieces]             = useState('1');
  const [weight, setWeight]             = useState('');
  const [origin, setOrigin]             = useState<Address>(BLANK_ADDRESS);
  const [destination, setDest]          = useState<Address>(BLANK_ADDRESS);
  const [pickupDate, setPickupDate]     = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [agreedRate, setAgreedRate]     = useState('');
  const [brokerFee, setBrokerFee]       = useState('');
  const [notes, setNotes]               = useState('');

  const carrierPay = (parseFloat(agreedRate) || 0) - (parseFloat(brokerFee) || 0);

  useEffect(() => {
    listShippers().then(setShippers).catch(() => {});
  }, []);

  // Pre-select shipper from query param once shippers are loaded
  useEffect(() => {
    const preId = searchParams.get('shipperId');
    if (preId && shippers.length) {
      const s = shippers.find((x) => x.id === preId);
      if (s) {
        setShipperId(s.id);
        setShipperName(s.companyName);
        if (s.defaultOrigin) setOrigin(s.defaultOrigin);
        if (s.defaultDest)   setDest(s.defaultDest);
      }
    }
  }, [shippers, searchParams]);

  function handleShipperChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value;
    setShipperId(id);
    if (!id) { setShipperName(''); return; }
    const s = shippers.find((x) => x.id === id);
    if (s) {
      setShipperName(s.companyName);
      if (s.defaultOrigin) setOrigin(s.defaultOrigin);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setError('');
    setSaving(true);
    try {
      const id = await createOrder({
        shipperId,
        shipperName: shipperName.trim(),
        parentOrderId: null,
        status:       'quote',
        commodity:    commodity.trim(),
        pieces:       parseInt(pieces) || 1,
        weight:       parseFloat(weight) || 0,
        origin,
        destination,
        pickupDate:   pickupDate   ? (new Date(pickupDate)   as unknown as import('firebase/firestore').Timestamp) : null,
        deliveryDate: deliveryDate ? (new Date(deliveryDate) as unknown as import('firebase/firestore').Timestamp) : null,
        carrierId:    null,
        carrierName:  '',
        driverName:   '',
        driverPhone:  '',
        driverLicenseStoragePath: null,
        agreedRate:   parseFloat(agreedRate) || 0,
        brokerFee:    parseFloat(brokerFee)  || 0,
        carrierPay,
        notes:        notes.trim(),
        createdBy:    user.uid,
      });
      router.push(`/dashboard/orders/${id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create order');
      setSaving(false);
    }
  }

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-6">
        <button onClick={() => router.back()} className="text-sm text-gray-500 hover:text-gray-700 mb-2 flex items-center gap-1">
          ← Back
        </button>
        <h1 className="text-2xl font-bold text-gray-900">New Order</h1>
        <p className="text-sm text-gray-500 mt-0.5">Saved as a Quote — advance the status after creation.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Shipment Info */}
        <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Shipment Info</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Shipper / Client</label>
              {shippers.length > 0 ? (
                <select required value={shipperId} onChange={handleShipperChange}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400">
                  <option value="">Select a shipper…</option>
                  {shippers.map((s) => (
                    <option key={s.id} value={s.id}>{s.companyName}</option>
                  ))}
                </select>
              ) : (
                <input required value={shipperName} onChange={(e) => setShipperName(e.target.value)}
                  placeholder="e.g. Acme Corp"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Commodity</label>
              <input required value={commodity} onChange={(e) => setCommodity(e.target.value)}
                placeholder="e.g. Vehicle, Heavy Machinery"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Pieces</label>
                <input type="number" min="1" value={pieces} onChange={(e) => setPieces(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Weight (lbs)</label>
                <input type="number" min="0" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="0"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Pickup Date</label>
              <input type="date" value={pickupDate} onChange={(e) => setPickupDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Delivery Date</label>
              <input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
            </div>
          </div>
        </section>

        {/* Route */}
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-5">Route</h2>
          <div className="grid grid-cols-2 gap-6">
            <AddressFields label="Origin" value={origin} onChange={setOrigin} />
            <AddressFields label="Destination" value={destination} onChange={setDest} />
          </div>
        </section>

        {/* Financials */}
        <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Financials</h2>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Agreed Rate (USD)</label>
              <input type="number" min="0" step="0.01" value={agreedRate} onChange={(e) => setAgreedRate(e.target.value)} placeholder="0.00"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Broker Fee (USD)</label>
              <input type="number" min="0" step="0.01" value={brokerFee} onChange={(e) => setBrokerFee(e.target.value)} placeholder="0.00"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Carrier Pay (auto)</label>
              <div className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-700">
                {carrierPay > 0
                  ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(carrierPay)
                  : '—'}
              </div>
            </div>
          </div>
        </section>

        {/* Notes */}
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">Notes</h2>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
            placeholder="Any special instructions or details…"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 resize-none" />
        </section>

        {error && <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-600">{error}</div>}

        <div className="flex gap-3">
          <button type="submit" disabled={saving}
            className="px-6 py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 disabled:opacity-50 transition">
            {saving ? 'Saving…' : 'Create Quote'}
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

export default function NewOrderPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>}>
      <NewOrderForm />
    </Suspense>
  );
}
