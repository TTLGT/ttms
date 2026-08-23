'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { Timestamp } from 'firebase/firestore';
import { getOrder, updateOrder } from '@/lib/orders';
import { listParties, tagPartyRole } from '@/lib/parties';
import PartyCombobox from '@/components/parties/PartyCombobox';
import type { PartySelection } from '@/components/parties/PartyCombobox';
import CommodityItemsFields from '@/components/orders/CommodityItemsFields';
import DimensionConverter from '@/components/orders/DimensionConverter';
import RouteMapLinkField from '@/components/orders/RouteMapLinkField';
import RouteDistanceField from '@/components/orders/RouteDistanceField';
import type { LaneDistanceValue } from '@/components/orders/RouteDistanceField';
import { commoditySummary, orderCommodityItems, totalPieces, totalWeightLb } from '@/types/order';
import type { Order, Address, CommodityItem } from '@/types/order';
import type { Party, PartyRole } from '@/types/party';

const BLANK_ADDRESS: Address = { street: '', city: '', state: '', zip: '', country: 'US' };

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY',
];

function tsToDateStr(ts: Order['pickupDate']): string {
  if (!ts || typeof (ts as { toDate?: unknown }).toDate !== 'function') return '';
  return (ts as { toDate: () => Date }).toDate().toISOString().slice(0, 10);
}

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

export default function EditOrderPage() {
  const params   = useParams();
  const orderId  = params.orderId as string;
  const router   = useRouter();

  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');
  const [order, setOrder]       = useState<Order | null>(null);
  const [parties, setParties] = useState<Party[]>([]);

  const [client, setClient]       = useState<PartySelection>({ id: '', name: '' });
  const [shipper, setShipper]     = useState<PartySelection>({ id: '', name: '' });
  const [consignee, setConsignee] = useState<PartySelection>({ id: '', name: '' });
  const [commodities, setCommodities]   = useState<CommodityItem[]>([]);
  const [origin, setOrigin]             = useState<Address>(BLANK_ADDRESS);
  const [destination, setDest]          = useState<Address>(BLANK_ADDRESS);
  const [routeMapUrl, setRouteMapUrl]   = useState('');
  const [distance, setDistance]         = useState<LaneDistanceValue>({ laneMiles: null, laneMilesSource: null });
  const [pickupDate, setPickupDate]     = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [agreedRate, setAgreedRate]     = useState('');
  const [brokerFee, setBrokerFee]       = useState('');
  const [notes, setNotes]               = useState('');

  const carrierPay = (parseFloat(agreedRate) || 0) - (parseFloat(brokerFee) || 0);

  // The legacy single-value fields are kept in sync from the items — see the
  // note on Order.commodity.
  const commodityItems = commodities.filter((c) => c.description.trim() || c.weight || c.length || c.width || c.height);

  useEffect(() => {
    async function load() {
      try {
        const [o, ss] = await Promise.all([getOrder(orderId), listParties()]);
        if (!o) { setError('Order not found'); return; }
        setOrder(o);
        setParties(ss);
        setClient({    id: o.clientId    ?? '', name: o.clientName    ?? '' });
        setShipper({   id: o.shipperId   ?? '', name: o.shipperName   ?? '' });
        setConsignee({ id: o.consigneeId ?? '', name: o.consigneeName ?? '' });
        // Orders written before itemised freight existed come back as a
        // single line, so the editor has something to open on.
        setCommodities(orderCommodityItems(o));
        setOrigin(o.origin ?? BLANK_ADDRESS);
        setDest(o.destination ?? BLANK_ADDRESS);
        setRouteMapUrl(o.routeMapUrl ?? '');
        setDistance({ laneMiles: o.laneMiles ?? null, laneMilesSource: o.laneMilesSource ?? null });
        setPickupDate(tsToDateStr(o.pickupDate));
        setDeliveryDate(tsToDateStr(o.deliveryDate));
        setAgreedRate(o.agreedRate ? String(o.agreedRate) : '');
        setBrokerFee(o.brokerFee ? String(o.brokerFee) : '');
        setNotes(o.notes ?? '');
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to load order');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [orderId]);

  function cacheParty(p: Party) {
    setParties((prev) => (prev.some((x) => x.id === p.id) ? prev : [...prev, p]));
  }

  async function tagRoleIfNew(partyId: string, role: PartyRole) {
    const p = parties.find((x) => x.id === partyId);
    if (p && (p.roles ?? []).includes(role)) return;
    await tagPartyRole(partyId, role);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!order) return;
    setError('');
    setSaving(true);
    try {
      // Reassigning a party to a role it has not held before must show up in
      // that role's list.
      await Promise.all(
        ([['client', client], ['shipper', shipper], ['consignee', consignee]] as const)
          .filter(([, sel]) => sel.id)
          // Best-effort: a party used under an approval is not writable by the
          // requester, and failing to tag a role must not block the order.
          .map(([role, sel]) => tagRoleIfNew(sel.id, role).catch(() => {})),
      );

      await updateOrder(orderId, {
        clientId:      client.id,
        clientName:    client.name.trim(),
        shipperId:     shipper.id,
        shipperName:   shipper.name.trim(),
        consigneeId:   consignee.id,
        consigneeName: consignee.name.trim(),
        commodity:    commoditySummary(commodityItems),
        commodities:  commodityItems,
        pieces:       totalPieces(commodityItems) || 1,
        weight:       Math.round(totalWeightLb(commodityItems)),
        origin,
        destination,
        routeMapUrl:  routeMapUrl.trim(),
        laneMiles:       distance.laneMiles,
        laneMilesSource: distance.laneMilesSource,
        pickupDate:   pickupDate   ? Timestamp.fromDate(new Date(pickupDate + 'T12:00:00'))   : null,
        deliveryDate: deliveryDate ? Timestamp.fromDate(new Date(deliveryDate + 'T12:00:00')) : null,
        agreedRate:   parseFloat(agreedRate) || 0,
        brokerFee:    parseFloat(brokerFee)  || 0,
        carrierPay:   Math.max(0, carrierPay),
        notes:        notes.trim(),
      });
      router.push(`/dashboard/orders/${orderId}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save order');
      setSaving(false);
    }
  }

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!order) return (
    <div className="p-8">
      <p className="text-red-600 text-sm">{error || 'Order not found.'}</p>
      <Link href="/dashboard/orders" className="text-sm text-brand-600 hover:underline mt-2 block">← Orders</Link>
    </div>
  );

  return (
    <div className="p-8 max-w-7xl">
      <div className="mb-6">
        <Link href={`/dashboard/orders/${orderId}`} className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 mb-2">
          ← Back to {order.orderNumber}
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Edit Order</h1>
        <p className="text-sm text-gray-500 mt-0.5 font-mono">{order.orderNumber}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_20rem] gap-6 items-start">
        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Shipment Info */}
          <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Shipment Info</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 grid grid-cols-3 gap-4">
                <PartyCombobox role="client"    label="Client (signs the contract)" parties={parties}
                  value={client}    onChange={setClient}    onPartyCreated={cacheParty} required />
                <PartyCombobox role="shipper"   label="Shipper (pickup)"           parties={parties}
                  value={shipper}   onChange={setShipper}   onPartyCreated={cacheParty} />
                <PartyCombobox role="consignee" label="Consignee (delivery)"       parties={parties}
                  value={consignee} onChange={setConsignee} onPartyCreated={cacheParty} />
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

          {/* Freight */}
          <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Freight</h2>
              <p className="text-xs text-gray-500 mt-1">
                One line per commodity, each with its own weight and dimensions. Pieces and total
                weight are added up for you.
              </p>
            </div>
            <CommodityItemsFields value={commodities} onChange={setCommodities} />
          </section>

          {/* Route */}
          <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Route</h2>
            <div className="grid grid-cols-2 gap-6">
              <AddressFields label="Origin" value={origin} onChange={setOrigin} />
              <AddressFields label="Destination" value={destination} onChange={setDest} />
            </div>
            <RouteDistanceField
              origin={origin}
              destination={destination}
              value={distance}
              onChange={setDistance}
            />
            <RouteMapLinkField
              origin={origin}
              destination={destination}
              value={routeMapUrl}
              onChange={setRouteMapUrl}
            />
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
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
            <Link href={`/dashboard/orders/${orderId}`}
              className="px-6 py-2.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition">
              Cancel
            </Link>
          </div>
        </form>

        <DimensionConverter />
      </div>
    </div>
  );
}
