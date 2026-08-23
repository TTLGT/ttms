'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ExternalLink, Map, Plus, Route } from 'lucide-react';
import Link from 'next/link';
import { getOrder, updateOrderStatus, updateOrder, listOrders, createOrder } from '@/lib/orders';
import { listCarriers } from '@/lib/carriers';
import type { Order, OrderStatus } from '@/types/order';
import type { Carrier } from '@/types/carrier';
import {
  STATUS_LABEL,
  STATUS_NEXT,
  formatDimensions,
  itemWeightLb,
  orderCommodityItems,
  buildRouteMapUrl,
  formatLaneMiles,
  isRoutableAddress,
  laneMilesCaption,
  laneMilesLabel,
} from '@/types/order';
import { fetchLaneDistance } from '@/lib/routeDistanceClient';
import StatusBadge from '@/components/orders/StatusBadge';
import DriverLicenseUpload from '@/components/orders/DriverLicenseUpload';
import QuickAddCarrierModal from '@/components/carriers/QuickAddCarrierModal';
import PersonNameFields from '@/components/PersonNameFields';
import DocumentUpload, { DownloadLink } from '@/components/orders/DocumentUpload';
import { useAuth } from '@/context/AuthContext';

// Sentinel value for the dropdown's "add a new carrier" row. Not a document id,
// so it can never collide with a real carrier.
const NEW_CARRIER = '__new__';

const PIPELINE: OrderStatus[] = [
  'quote', 'booked', 'carrier_assigned', 'carrier_signed',
  'shipper_signed', 'in_transit', 'delivered', 'completed',
];

function formatDate(ts: { toDate?: () => Date } | null | undefined): string {
  if (!ts || typeof ts.toDate !== 'function') return '—';
  return ts.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatCurrency(n: number | undefined): string {
  if (n === undefined || n === null || n === 0) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

interface DriverDetails {
  driverName: string;
  driverPhone: string;
  driverLicenseStoragePath: string | null;
  /** Order the details came from, so the UI can say where they came from. */
  sourceOrderNumber: string;
}

/**
 * Driver details from the most recent other order run with this carrier.
 *
 * There is no drivers collection — a driver only exists as three fields on an
 * order — so "the driver we used last time" has to be read back out of order
 * history. `orders` arrives sorted by createdAt desc, so the first hit is the
 * most recent one.
 */
function lastDriverForCarrier(
  orders: Order[],
  carrierId: string,
  excludeOrderId: string
): DriverDetails | null {
  const prev = orders.find(
    (o) => o.id !== excludeOrderId && o.carrierId === carrierId && !!o.driverName?.trim()
  );
  if (!prev) return null;
  return {
    driverName:  prev.driverName ?? '',
    driverPhone: prev.driverPhone ?? '',
    driverLicenseStoragePath: prev.driverLicenseStoragePath ?? null,
    sourceOrderNumber: prev.orderNumber ?? '',
  };
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-0.5">{label}</p>
      <p className="text-sm text-gray-900">{value || '—'}</p>
    </div>
  );
}

export default function OrderDetailPage() {
  const params   = useParams();
  const orderId  = params.orderId as string;
  const router   = useRouter();
  const { user } = useAuth();

  const [order, setOrder]           = useState<Order | null>(null);
  const [suborders, setSuborders]   = useState<Order[]>([]);
  const [allOrders, setAllOrders]   = useState<Order[]>([]);
  const [carriers, setCarriers]     = useState<Carrier[]>([]);
  const [loading, setLoading]       = useState(true);
  const [advancing, setAdvancing]   = useState(false);
  const [splitting, setSplitting]   = useState(false);
  const [error, setError]           = useState('');
  const [tab, setTab]               = useState<'details' | 'documents' | 'suborders'>('details');

  // carrier assignment state
  const [assigningCarrier, setAssigningCarrier] = useState(false);
  const [selectedCarrierId, setSelectedCarrierId] = useState('');
  const [driverName, setDriverName]   = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [driverLicensePath, setDriverLicensePath] = useState<string | null>(null);
  const [savingCarrier, setSavingCarrier] = useState(false);
  const [addingCarrier, setAddingCarrier] = useState(false);
  // What the last carrier selection auto-filled, so a later selection can
  // replace its own guess without overwriting anything the user typed.
  const [prefill, setPrefill] = useState<DriverDetails | null>(null);
  const [prefillSource, setPrefillSource] = useState('');

  // carrier e-sign state
  const [sendingAgreement, setSendingAgreement] = useState(false);
  const [agreementSentTo, setAgreementSentTo]   = useState('');

  // shipper e-sign state
  const [sendingShipperAgreement, setSendingShipperAgreement] = useState(false);
  const [shipperAgreementSentTo, setShipperAgreementSentTo]   = useState('');

  // BOL state
  const [generatingBol, setGeneratingBol] = useState(false);
  const [bolUrl, setBolUrl]               = useState<string | null>(null);

  // invoice state
  const [generatingInvoice, setGeneratingInvoice] = useState(false);
  const [invoiceUrl, setInvoiceUrl]               = useState<string | null>(null);
  const [invoicePath, setInvoicePath]             = useState<string | null>(null);

  // POD state
  const [podPath, setPodPath] = useState<string | null>(null);

  // Stops the backfill below from re-running and re-writing on every render
  // that produces a new `order` object.
  const backfilledRef = useRef<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [o, cs, all] = await Promise.all([
          getOrder(orderId),
          listCarriers(),
          listOrders(),
        ]);
        setOrder(o);
        setCarriers(cs.filter((c) => c.isActive));
        if (o) {
          setAllOrders(all);
          setSuborders(all.filter((x) => x.parentOrderId === orderId));
          setInvoicePath(o.invoiceStoragePath ?? null);
          setPodPath(o.podStoragePath ?? null);
        }
        if (o?.bolStoragePath && user) {
          user.getIdToken()
            .then((idToken) => fetch(`/api/orders/${orderId}/bol`, { headers: { Authorization: `Bearer ${idToken}` } }))
            .then((r) => r.json())
            .then((b) => { if (b.url) setBolUrl(b.url); })
            .catch(() => {});
        }
        if (o?.invoiceStoragePath && user) {
          user.getIdToken()
            .then((idToken) => fetch(`/api/orders/${orderId}/invoice`, { headers: { Authorization: `Bearer ${idToken}` } }))
            .then((r) => r.json())
            .then((b) => { if (b.url) setInvoiceUrl(b.url); })
            .catch(() => {});
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to load order');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [orderId, user]);

  /**
   * Fill in the distance for an order that has none — one created before this
   * feature, or whose addresses were completed after it was saved. Written
   * back so the number stays fixed to what the broker saw, rather than moving
   * if the estimate is retuned or the method is switched later.
   *
   * Runs once per order. Under Google Routes that restraint is what stops
   * viewing an order from billing a lookup every time.
   */
  useEffect(() => {
    if (!order || order.laneMiles !== null && order.laneMiles !== undefined) return;
    if (!isRoutableAddress(order.origin) || !isRoutableAddress(order.destination)) return;
    if (backfilledRef.current === order.id) return;
    backfilledRef.current = order.id;

    let cancelled = false;
    (async () => {
      const result = await fetchLaneDistance(order.origin, order.destination);
      if (cancelled || result.status !== 'ok') return;
      const patch = { laneMiles: result.miles, laneMilesSource: result.source };
      setOrder((prev) => (prev ? { ...prev, ...patch } : prev));
      // Best-effort: showing the distance matters more than storing it, and a
      // failed write just means the next viewer works it out again.
      updateOrder(order.id, patch).catch(() => {});
    })();
    return () => { cancelled = true; };
  }, [order]);

  function openCarrierAssign() {
    setSelectedCarrierId(order?.carrierId ?? '');
    setDriverName(order?.driverName ?? '');
    setDriverPhone(order?.driverPhone ?? '');
    setDriverLicensePath(order?.driverLicenseStoragePath ?? null);
    setPrefill(null);
    setPrefillSource('');
    setAssigningCarrier(true);
  }

  function handleCarrierSelect(e: React.ChangeEvent<HTMLSelectElement>) {
    if (e.target.value === NEW_CARRIER) {
      // Leave the select on its previous value — the new carrier is only
      // selected once it actually saves, so cancelling changes nothing.
      setAddingCarrier(true);
      return;
    }
    const carrierId = e.target.value;
    setSelectedCarrierId(carrierId);
    applyDriverPrefill(
      carrierId ? lastDriverForCarrier(allOrders, carrierId, orderId) : null
    );
  }

  /**
   * Fill the driver fields from the carrier's last load.
   *
   * Only fields that are empty, or that still hold the previous selection's
   * guess, are touched — anything the user typed themselves survives a change
   * of carrier.
   */
  function applyDriverPrefill(next: DriverDetails | null) {
    const isOursOrEmpty = (value: string, previous: string | undefined) =>
      value.trim() === '' || (previous !== undefined && value === previous);

    if (isOursOrEmpty(driverName, prefill?.driverName)) {
      setDriverName(next?.driverName ?? '');
    }
    if (isOursOrEmpty(driverPhone, prefill?.driverPhone)) {
      setDriverPhone(next?.driverPhone ?? '');
    }
    if (driverLicensePath === null || driverLicensePath === prefill?.driverLicenseStoragePath) {
      setDriverLicensePath(next?.driverLicenseStoragePath ?? null);
    }

    setPrefill(next);
    setPrefillSource(next?.sourceOrderNumber ?? '');
  }

  function handleCarrierCreated(carrier: Carrier) {
    setCarriers((prev) =>
      [...prev, carrier].sort((a, b) => a.companyName.localeCompare(b.companyName))
    );
    setSelectedCarrierId(carrier.id);
    // A carrier created just now has no past loads to inherit a driver from.
    applyDriverPrefill(null);
    setAddingCarrier(false);
  }

  async function handleSaveCarrier() {
    if (!order) return;
    setSavingCarrier(true);
    setError('');
    try {
      const carrier = carriers.find((c) => c.id === selectedCarrierId);
      await updateOrder(orderId, {
        carrierId:   selectedCarrierId || null,
        carrierName: carrier?.companyName ?? '',
        driverName:  driverName.trim(),
        driverPhone: driverPhone.trim(),
        driverLicenseStoragePath: driverLicensePath,
      });
      setOrder({
        ...order,
        carrierId:   selectedCarrierId || null,
        carrierName: carrier?.companyName ?? '',
        driverName:  driverName.trim(),
        driverPhone: driverPhone.trim(),
        driverLicenseStoragePath: driverLicensePath,
      });
      setAssigningCarrier(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to assign carrier');
    } finally {
      setSavingCarrier(false);
    }
  }

  async function handleSendAgreement() {
    if (!order || !user) return;
    setSendingAgreement(true);
    setError('');
    try {
      const idToken = await user.getIdToken();
      const res = await fetch(`/api/orders/${orderId}/send-agreement`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Failed to send');
      setAgreementSentTo(body.sentTo ?? 'carrier');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to send agreement');
    } finally {
      setSendingAgreement(false);
    }
  }

  async function handleSendShipperAgreement() {
    if (!order || !user) return;
    setSendingShipperAgreement(true);
    setError('');
    try {
      const idToken = await user.getIdToken();
      const res  = await fetch(`/api/orders/${orderId}/send-shipper-agreement`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Failed to send');
      setShipperAgreementSentTo(body.sentTo ?? 'shipper');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to send shipper agreement');
    } finally {
      setSendingShipperAgreement(false);
    }
  }

  async function handleGenerateBol() {
    if (!order || !user) return;
    setGeneratingBol(true);
    setError('');
    try {
      const idToken = await user.getIdToken();
      const res  = await fetch(`/api/orders/${orderId}/bol`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Failed to generate BOL');
      setBolUrl(body.url);
      setOrder({ ...order, bolStoragePath: body.path });
      window.open(body.url, '_blank');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to generate BOL');
    } finally {
      setGeneratingBol(false);
    }
  }

  async function handleGenerateInvoice() {
    if (!order || !user) return;
    setGeneratingInvoice(true);
    setError('');
    try {
      const idToken = await user.getIdToken();
      const res  = await fetch(`/api/orders/${orderId}/invoice`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Failed to generate invoice');
      setInvoiceUrl(body.url);
      setInvoicePath(body.path);
      setOrder({ ...order, invoiceStoragePath: body.path });
      window.open(body.url, '_blank');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to generate invoice');
    } finally {
      setGeneratingInvoice(false);
    }
  }

  async function handlePodUploaded(path: string | null) {
    setPodPath(path);
    await updateOrder(orderId, { podStoragePath: path }).catch(() => {});
    if (order) setOrder({ ...order, podStoragePath: path });
  }

  async function handleAdvance() {
    if (!order) return;
    const next = STATUS_NEXT[order.status];
    if (!next) return;
    setAdvancing(true);
    try {
      await updateOrderStatus(orderId, next);
      setOrder({ ...order, status: next });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to update status');
    } finally {
      setAdvancing(false);
    }
  }

  async function handleCreateSuborder() {
    if (!order || !user) return;
    setSplitting(true);
    try {
      const id = await createOrder({
        clientId:      order.clientId ?? '',
        clientName:    order.clientName ?? '',
        shipperId:     order.shipperId ?? '',
        shipperName:   order.shipperName ?? '',
        consigneeId:   order.consigneeId ?? '',
        consigneeName: order.consigneeName ?? '',
        parentOrderId: orderId,
        status:       'quote',
        commodity:    order.commodity,
        // A suborder is a split of the parent's freight — which pieces go on it
        // is exactly what the broker is about to decide, so it starts empty
        // rather than duplicating the whole load.
        commodities:  [],
        pieces:       1,
        weight:       0,
        origin:       order.origin,
        destination:  order.destination,
        routeMapUrl:  order.routeMapUrl ?? '',
        // Same origin and destination as the parent, so the same lane — and
        // under Google Routes, no reason to buy the identical lookup twice.
        laneMiles:       order.laneMiles ?? null,
        laneMilesSource: order.laneMilesSource ?? null,
        pickupDate:   null,
        deliveryDate: null,
        carrierId:    null,
        carrierName:  '',
        driverName:   '',
        driverPhone:  '',
        driverLicenseStoragePath: null,
        bolStoragePath: null,
        invoiceStoragePath: null,
        podStoragePath: null,
        agreedRate:   0,
        brokerFee:    0,
        carrierPay:   0,
        notes:        '',
        batsId:             null,
        vehicles:           order.vehicles || '',
        transportType:      order.transportType || '',
        assignedTo:         '',
        sourceName:         '',
        dispatchedAt:       null,
        pickedUpAt:         null,
        deliveredAt:        null,
        carrierSignedAt:    null,
        carrierSignerName:  null,
        carrierSignerIp:    null,
        shipperSignedAt:    null,
        shipperSignerName:  null,
        shipperSignerIp:    null,
        partyApprovals:     [],
        clientSignedAt:     null,
        clientSignerName:   null,
        clientSignerIp:     null,
        createdBy:    user.uid,
      });
      router.push(`/dashboard/orders/${id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create suborder');
      setSplitting(false);
    }
  }

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!order) return (
    <div className="p-8">
      <p className="text-gray-500">Order not found.</p>
      <Link href="/dashboard/orders" className="text-sm text-brand-600 hover:underline mt-2 block">← Back to Orders</Link>
    </div>
  );

  const nextStatus  = STATUS_NEXT[order.status];
  const currentStep = PIPELINE.indexOf(order.status);


  return (
    <div className="p-8 max-w-4xl">
      <Link href="/dashboard/orders" className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 mb-4">
        ← Orders
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-gray-900 font-mono">{order.orderNumber}</h1>
            <StatusBadge status={order.status} />
            {order.parentOrderId && (
              <Link href={`/dashboard/orders/${order.parentOrderId}`} className="text-xs text-gray-400 hover:text-brand-600">
                Suborder of {order.parentOrderId.slice(0, 8)}…
              </Link>
            )}
          </div>
          <p className="text-sm text-gray-500">{order.clientName || order.shipperName} — {order.commodity}</p>
        </div>
        <div className="flex gap-2">
          <Link href={`/dashboard/orders/${orderId}/edit`}
            className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition">
            Edit
          </Link>
          {nextStatus && order.status !== 'cancelled' && (
            <button onClick={handleAdvance} disabled={advancing}
              className="px-4 py-2 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 disabled:opacity-50 transition">
              {advancing ? 'Updating…' : `→ ${STATUS_LABEL[nextStatus]}`}
            </button>
          )}
        </div>
      </div>

      {/* Status pipeline */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6 overflow-x-auto">
        <div className="flex items-center min-w-max">
          {PIPELINE.map((s, i) => {
            const done   = i < currentStep;
            const active = i === currentStep;
            const future = i > currentStep;
            return (
              <div key={s} className="flex items-center">
                <div className={`flex flex-col items-center ${future ? 'opacity-40' : ''}`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold mb-1
                    ${done   ? 'bg-brand-600 text-white' : ''}
                    ${active ? 'bg-brand-600 text-white ring-4 ring-brand-100' : ''}
                    ${future ? 'bg-gray-200 text-gray-400' : ''}
                  `}>
                    {done ? '✓' : i + 1}
                  </div>
                  <span className={`text-xs whitespace-nowrap ${active ? 'font-semibold text-brand-700' : 'text-gray-500'}`}>
                    {STATUS_LABEL[s]}
                  </span>
                </div>
                {i < PIPELINE.length - 1 && (
                  <div className={`w-8 h-0.5 mx-1 mb-5 ${i < currentStep ? 'bg-brand-500' : 'bg-gray-200'}`} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {error && <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-600 mb-4">{error}</div>}

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {(['details', 'documents', 'suborders'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px capitalize transition ${
              tab === t ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {t === 'suborders' ? `Suborders (${suborders.length})` : t === 'documents' ? 'Documents' : 'Details'}
          </button>
        ))}
      </div>

      {/* Details tab */}
      {tab === 'details' && (
        <div className="space-y-4">
          {/* Shipment */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Shipment</h3>
            <div className="grid grid-cols-3 gap-6">
              <DetailRow label="Client"    value={order.clientName || '—'} />
              <DetailRow label="Shipper"   value={order.shipperName || '—'} />
              <DetailRow label="Consignee" value={order.consigneeName || '—'} />
              <DetailRow label="Pieces" value={order.pieces} />
              <DetailRow label="Weight" value={order.weight ? `${order.weight.toLocaleString()} lbs` : '—'} />
              <DetailRow label="Pickup Date" value={formatDate(order.pickupDate as { toDate: () => Date } | null)} />
              <DetailRow label="Delivery Date" value={formatDate(order.deliveryDate as { toDate: () => Date } | null)} />
            </div>
          </div>

          {/* Freight */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Freight</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide border-b border-gray-200">
                    <th className="pb-2 pr-4 font-medium">Commodity</th>
                    <th className="pb-2 pr-4 font-medium">Pieces</th>
                    <th className="pb-2 pr-4 font-medium">Dimensions (L × W × H)</th>
                    <th className="pb-2 font-medium">Weight</th>
                  </tr>
                </thead>
                <tbody>
                  {orderCommodityItems(order).map((item) => (
                    <tr key={item.id} className="border-b border-gray-100 last:border-0">
                      <td className="py-2 pr-4 text-gray-900">{item.description || '—'}</td>
                      <td className="py-2 pr-4 text-gray-600">{item.quantity || '—'}</td>
                      <td className="py-2 pr-4 text-gray-600">{formatDimensions(item) || '—'}</td>
                      <td className="py-2 text-gray-600">
                        {itemWeightLb(item) ? `${Math.round(itemWeightLb(item)).toLocaleString()} lbs` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Route */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Route</h3>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1">Origin</p>
                <p className="text-sm text-gray-900">
                  {[order.origin?.street, order.origin?.city, order.origin?.state, order.origin?.zip].filter(Boolean).join(', ') || '—'}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1">Destination</p>
                <p className="text-sm text-gray-900">
                  {[order.destination?.street, order.destination?.city, order.destination?.state, order.destination?.zip].filter(Boolean).join(', ') || '—'}
                </p>
              </div>
            </div>
            {order.laneMiles !== null && order.laneMiles !== undefined ? (
              <div className="mt-4 flex items-center gap-2.5">
                <Route className="w-4 h-4 text-brand-600 shrink-0" />
                <div>
                  <p className="text-xs font-medium text-gray-500">{laneMilesLabel(order.laneMilesSource)}</p>
                  <p className="text-sm font-semibold text-gray-900">
                    {formatLaneMiles(order.laneMiles, order.laneMilesSource)}
                    <span className="font-normal text-gray-500"> · {laneMilesCaption(order.laneMilesSource)}</span>
                  </p>
                </div>
              </div>
            ) : null}
            {/* Falls back to a link built on the fly, so orders saved before
                the field existed still get a usable route. */}
            {(() => {
              const mapUrl = order.routeMapUrl || buildRouteMapUrl(order.origin, order.destination);
              if (!mapUrl) return null;
              return (
                <a href={mapUrl} target="_blank" rel="noopener noreferrer"
                  className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700">
                  <Map className="w-4 h-4" />
                  View route in Google Maps
                  <ExternalLink className="w-3 h-3" />
                </a>
              );
            })()}
          </div>

          {/* Carrier */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Carrier</h3>
              {!assigningCarrier && (
                <button onClick={openCarrierAssign}
                  className="text-xs text-brand-600 hover:text-brand-700 font-medium">
                  {order.carrierId ? 'Edit' : '+ Assign Carrier'}
                </button>
              )}
            </div>

            {/* Send for Signature / e-sign status */}
            {!assigningCarrier && order.carrierId && (
              <div className="mb-4">
                {order.status === 'carrier_signed' ? (
                  <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                    <span>✓</span>
                    <span>
                      Signed by <strong>{order.carrierSignerName || 'carrier'}</strong>
                      {order.carrierSignedAt && (
                        <> on {formatDate(order.carrierSignedAt as { toDate: () => Date })}</>
                      )}
                      {order.carrierSignerIp && (
                        <span className="text-green-600 font-mono text-xs ml-1">({order.carrierSignerIp})</span>
                      )}
                    </span>
                  </div>
                ) : agreementSentTo ? (
                  <div className="flex items-center gap-2 text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                    <span>✉</span>
                    <span>Agreement sent to <strong>{agreementSentTo}</strong> — awaiting signature</span>
                  </div>
                ) : order.status === 'carrier_assigned' ? (
                  <button
                    onClick={handleSendAgreement}
                    disabled={sendingAgreement}
                    className="px-3 py-1.5 bg-brand-50 text-brand-700 border border-brand-200 text-xs font-semibold rounded-lg hover:bg-brand-100 disabled:opacity-50 transition"
                  >
                    {sendingAgreement ? 'Sending…' : '✉ Send for Signature'}
                  </button>
                ) : null}
              </div>
            )}

            {addingCarrier && (
              <QuickAddCarrierModal
                onCreated={handleCarrierCreated}
                onCancel={() => setAddingCarrier(false)}
              />
            )}

            {assigningCarrier ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Carrier</label>
                  {/* The button sits outside the dropdown because a trailing
                      option is invisible until you scroll a long carrier list —
                      the row inside the list is kept as a second way in, near
                      the top where it shows without scrolling. */}
                  <div className="flex gap-2">
                    <select value={selectedCarrierId} onChange={handleCarrierSelect}
                      className="flex-1 min-w-0 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400">
                      <option value="">— Unassigned —</option>
                      <option value={NEW_CARRIER}>+ Add a new carrier…</option>
                      {carriers.map((c) => (
                        <option key={c.id} value={c.id}>{c.companyName}</option>
                      ))}
                    </select>
                    <button type="button" onClick={() => setAddingCarrier(true)}
                      className="shrink-0 inline-flex items-center gap-1 px-3 py-2 border border-brand-200 bg-brand-50 text-brand-700 text-xs font-semibold rounded-lg hover:bg-brand-100 transition">
                      <Plus className="w-3.5 h-3.5" />
                      New Carrier
                    </button>
                  </div>
                </div>
                <PersonNameFields label="Driver" value={driverName} onChange={setDriverName} />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Driver Phone</label>
                    <input type="tel" value={driverPhone} onChange={(e) => setDriverPhone(e.target.value)} placeholder="(555) 555-5555"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Driver License</label>
                  <DriverLicenseUpload
                    orderId={orderId}
                    existingPath={driverLicensePath}
                    onUploaded={(path) => { setDriverLicensePath(path); setPrefillSource(''); }}
                  />
                </div>
                {prefillSource && (
                  <p className="text-xs text-gray-500">
                    Driver carried over from <strong className="font-medium">{prefillSource}</strong>,
                    the last load with this carrier. Change it if a different driver is running this one.
                  </p>
                )}
                <div className="flex gap-2 pt-1">
                  <button onClick={handleSaveCarrier} disabled={savingCarrier}
                    className="px-4 py-1.5 bg-brand-600 text-white text-xs font-semibold rounded-lg hover:bg-brand-700 disabled:opacity-50 transition">
                    {savingCarrier ? 'Saving…' : 'Save'}
                  </button>
                  <button onClick={() => setAssigningCarrier(false)}
                    className="px-4 py-1.5 border border-gray-300 text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-50 transition">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-6">
                <DetailRow label="Carrier" value={
                  order.carrierId
                    ? <Link href={`/dashboard/carriers/${order.carrierId}`} className="text-brand-600 hover:underline">{order.carrierName}</Link>
                    : null
                } />
                <DetailRow label="Driver" value={order.driverName} />
                <DetailRow label="Driver Phone" value={order.driverPhone} />
                <DetailRow label="Driver License" value={
                  order.driverLicenseStoragePath
                    ? <DriverLicenseUpload orderId={orderId} existingPath={order.driverLicenseStoragePath} onUploaded={() => {}} readOnly />
                    : null
                } />
              </div>
            )}
          </div>

          {/* Shared-record approvals */}
          {(order.partyApprovals ?? []).length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">
                Shared Record Approvals
              </h3>
              <p className="text-xs text-gray-500 mb-3">
                This order uses records belonging to another user. Each was authorized before use.
              </p>
              <ul className="space-y-3">
                {(order.partyApprovals ?? []).map((a) => (
                  <li key={a.requestId} className="rounded-lg bg-gray-50 border border-gray-200 p-3">
                    <p className="text-sm text-gray-900">
                      <strong>{a.partyName}</strong>
                      <span className="ml-2 px-1.5 py-0.5 rounded bg-gray-200 text-gray-700 text-xs font-medium">
                        as {a.role}
                      </span>
                    </p>
                    <p className="text-xs text-gray-600 mt-1">
                      Approved by <strong>{a.approvedByName}</strong>
                      {a.approvedByAdmin && ' (admin)'}
                      {a.approvedAt && <> on {formatDate(a.approvedAt as { toDate: () => Date })}</>}
                      {a.approvedByIp && (
                        <span className="text-gray-500 font-mono ml-1">({a.approvedByIp})</span>
                      )}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Shipper Confirmation */}
          {(['carrier_signed', 'shipper_signed', 'in_transit', 'delivered', 'completed'] as const).includes(order.status as 'carrier_signed' | 'shipper_signed' | 'in_transit' | 'delivered' | 'completed') && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Shipper Confirmation</h3>
              {order.status === 'shipper_signed' || order.shipperSignerName ? (
                <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                  <span>✓</span>
                  <span>
                    Signed by <strong>{order.shipperSignerName || 'shipper'}</strong>
                    {order.shipperSignedAt && (
                      <> on {formatDate(order.shipperSignedAt as { toDate: () => Date })}</>
                    )}
                    {order.shipperSignerIp && (
                      <span className="text-green-600 font-mono text-xs ml-1">({order.shipperSignerIp})</span>
                    )}
                  </span>
                </div>
              ) : shipperAgreementSentTo ? (
                <div className="flex items-center gap-2 text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                  <span>✉</span>
                  <span>Load confirmation sent to <strong>{shipperAgreementSentTo}</strong> — awaiting signature</span>
                </div>
              ) : (
                <button
                  onClick={handleSendShipperAgreement}
                  disabled={sendingShipperAgreement}
                  className="px-3 py-1.5 bg-brand-50 text-brand-700 border border-brand-200 text-xs font-semibold rounded-lg hover:bg-brand-100 disabled:opacity-50 transition"
                >
                  {sendingShipperAgreement ? 'Sending…' : '✉ Send for Shipper Signature'}
                </button>
              )}
            </div>
          )}

          {/* Financials */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Financials</h3>
            <div className="grid grid-cols-3 gap-6">
              <DetailRow label="Agreed Rate" value={formatCurrency(order.agreedRate)} />
              <DetailRow label="Broker Fee" value={formatCurrency(order.brokerFee)} />
              <DetailRow label="Carrier Pay" value={formatCurrency(order.carrierPay)} />
            </div>
          </div>

          {/* BOL */}
          {(['carrier_signed', 'shipper_signed', 'in_transit', 'delivered', 'completed'] as const).includes(order.status as 'carrier_signed' | 'shipper_signed' | 'in_transit' | 'delivered' | 'completed') && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Bill of Lading</h3>
                  {order.bolStoragePath && !bolUrl && (
                    <p className="text-xs text-gray-400 mt-1">Loading download link…</p>
                  )}
                </div>
                <div className="flex gap-2">
                  {bolUrl && (
                    <a href={bolUrl} target="_blank" rel="noreferrer"
                      className="px-3 py-1.5 border border-gray-300 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-50 transition">
                      Download PDF
                    </a>
                  )}
                  <button onClick={handleGenerateBol} disabled={generatingBol}
                    className="px-3 py-1.5 bg-brand-600 text-white text-xs font-semibold rounded-lg hover:bg-brand-700 disabled:opacity-50 transition">
                    {generatingBol ? 'Generating…' : order.bolStoragePath ? 'Regenerate BOL' : 'Generate BOL'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {order.notes && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Notes</h3>
              <p className="text-sm text-gray-700 whitespace-pre-line">{order.notes}</p>
            </div>
          )}

          <div className="text-xs text-gray-400">
            Created {formatDate(order.createdAt as { toDate: () => Date } | null)} · Last updated {formatDate(order.updatedAt as { toDate: () => Date } | null)}
          </div>
        </div>
      )}

      {/* Documents tab */}
      {tab === 'documents' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                {['Document', 'Status', 'Action'].map((h) => (
                  <th key={h} className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {/* BOL */}
              <tr className="hover:bg-gray-50 transition">
                <td className="px-6 py-4">
                  <p className="text-sm font-medium text-gray-900">Bill of Lading</p>
                  <p className="text-xs text-gray-400">Auto-generated PDF</p>
                </td>
                <td className="px-6 py-4">
                  {order.bolStoragePath
                    ? <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">✓ Available</span>
                    : <span className="text-xs text-gray-400">Not generated</span>}
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    {bolUrl && (
                      <a href={bolUrl} target="_blank" rel="noreferrer"
                        className="text-xs text-brand-600 hover:underline">View BOL</a>
                    )}
                    {(['carrier_signed', 'shipper_signed', 'in_transit', 'delivered', 'completed'] as const).includes(
                      order.status as 'carrier_signed' | 'shipper_signed' | 'in_transit' | 'delivered' | 'completed'
                    ) && (
                      <button onClick={handleGenerateBol} disabled={generatingBol}
                        className="text-xs text-brand-600 hover:text-brand-700 border border-brand-200 bg-brand-50 rounded-lg px-3 py-1.5 font-medium transition hover:bg-brand-100 disabled:opacity-50">
                        {generatingBol ? 'Generating…' : order.bolStoragePath ? 'Regenerate' : 'Generate BOL'}
                      </button>
                    )}
                  </div>
                </td>
              </tr>

              {/* Invoice */}
              <tr className="hover:bg-gray-50 transition">
                <td className="px-6 py-4">
                  <p className="text-sm font-medium text-gray-900">Invoice</p>
                  <p className="text-xs text-gray-400">Auto-generated PDF</p>
                </td>
                <td className="px-6 py-4">
                  {invoicePath
                    ? <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">✓ Available</span>
                    : <span className="text-xs text-gray-400">Not generated</span>}
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    {invoiceUrl && (
                      <a href={invoiceUrl} target="_blank" rel="noreferrer"
                        className="text-xs text-brand-600 hover:underline">View Invoice</a>
                    )}
                    {(['shipper_signed', 'in_transit', 'delivered', 'completed'] as const).includes(
                      order.status as 'shipper_signed' | 'in_transit' | 'delivered' | 'completed'
                    ) && (
                      <button onClick={handleGenerateInvoice} disabled={generatingInvoice}
                        className="text-xs text-brand-600 hover:text-brand-700 border border-brand-200 bg-brand-50 rounded-lg px-3 py-1.5 font-medium transition hover:bg-brand-100 disabled:opacity-50">
                        {generatingInvoice ? 'Generating…' : invoicePath ? 'Regenerate' : 'Generate Invoice'}
                      </button>
                    )}
                  </div>
                </td>
              </tr>

              {/* POD */}
              <tr className="hover:bg-gray-50 transition">
                <td className="px-6 py-4">
                  <p className="text-sm font-medium text-gray-900">Proof of Delivery</p>
                  <p className="text-xs text-gray-400">PDF or image, max 20 MB</p>
                </td>
                <td className="px-6 py-4">
                  {podPath
                    ? <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">✓ Uploaded</span>
                    : <span className="text-xs text-gray-400">Not uploaded</span>}
                </td>
                <td className="px-6 py-4">
                  <DocumentUpload orderId={orderId} docType="pod" existingPath={podPath} onUploaded={handlePodUploaded} />
                </td>
              </tr>

              {/* Driver License */}
              <tr className="hover:bg-gray-50 transition">
                <td className="px-6 py-4">
                  <p className="text-sm font-medium text-gray-900">Driver License</p>
                  <p className="text-xs text-gray-400">Uploaded during carrier assignment</p>
                </td>
                <td className="px-6 py-4">
                  {order.driverLicenseStoragePath
                    ? <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">✓ Uploaded</span>
                    : <span className="text-xs text-gray-400">Not uploaded</span>}
                </td>
                <td className="px-6 py-4">
                  {order.driverLicenseStoragePath
                    ? <DownloadLink storagePath={order.driverLicenseStoragePath} label="View License" />
                    : <span className="text-xs text-gray-400">—</span>}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Suborders tab */}
      {tab === 'suborders' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-600">Split this order into separate loads with different carriers or dates.</p>
            <button onClick={handleCreateSuborder} disabled={splitting}
              className="px-4 py-2 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 disabled:opacity-50 transition">
              {splitting ? 'Creating…' : '+ Create Suborder'}
            </button>
          </div>
          {suborders.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
              <p className="text-sm text-gray-400">No suborders yet.</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="min-w-full divide-y divide-gray-100">
                <thead className="bg-gray-50">
                  <tr>
                    {['Order #', 'Status', 'Carrier', 'Pickup', 'Carrier Pay', ''].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {suborders.map((sub) => (
                    <tr key={sub.id} className="hover:bg-gray-50 transition">
                      <td className="px-4 py-3 text-sm font-mono font-medium text-brand-700">{sub.orderNumber}</td>
                      <td className="px-4 py-3"><StatusBadge status={sub.status} /></td>
                      <td className="px-4 py-3 text-sm text-gray-600">{sub.carrierName || '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{formatDate(sub.pickupDate as { toDate: () => Date } | null)}</td>
                      <td className="px-4 py-3 text-sm text-gray-800">{formatCurrency(sub.carrierPay)}</td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/dashboard/orders/${sub.id}`} className="text-xs text-brand-600 hover:underline font-medium">View →</Link>
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
