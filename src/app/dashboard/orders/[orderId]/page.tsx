'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { getOrder, updateOrderStatus, updateOrder, listOrders, createOrder } from '@/lib/orders';
import { listCarriers } from '@/lib/carriers';
import type { Order, OrderStatus } from '@/types/order';
import type { Carrier } from '@/types/carrier';
import { STATUS_LABEL, STATUS_NEXT } from '@/types/order';
import StatusBadge from '@/components/orders/StatusBadge';
import DriverLicenseUpload from '@/components/orders/DriverLicenseUpload';
import { useAuth } from '@/context/AuthContext';

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
  const [carriers, setCarriers]     = useState<Carrier[]>([]);
  const [loading, setLoading]       = useState(true);
  const [advancing, setAdvancing]   = useState(false);
  const [splitting, setSplitting]   = useState(false);
  const [error, setError]           = useState('');
  const [tab, setTab]               = useState<'details' | 'suborders'>('details');

  // carrier assignment state
  const [assigningCarrier, setAssigningCarrier] = useState(false);
  const [selectedCarrierId, setSelectedCarrierId] = useState('');
  const [driverName, setDriverName]   = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [driverLicensePath, setDriverLicensePath] = useState<string | null>(null);
  const [savingCarrier, setSavingCarrier] = useState(false);

  // e-sign state
  const [sendingAgreement, setSendingAgreement] = useState(false);
  const [agreementSentTo, setAgreementSentTo]   = useState('');

  // BOL state
  const [generatingBol, setGeneratingBol] = useState(false);
  const [bolUrl, setBolUrl]               = useState<string | null>(null);

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
        if (o) setSuborders(all.filter((x) => x.parentOrderId === orderId));
        if (o?.bolStoragePath) {
          fetch(`/api/orders/${orderId}/bol`)
            .then((r) => r.json())
            .then((b) => { if (b.url) setBolUrl(b.url); })
            .catch(() => {});
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to load order');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [orderId]);

  function openCarrierAssign() {
    setSelectedCarrierId(order?.carrierId ?? '');
    setDriverName(order?.driverName ?? '');
    setDriverPhone(order?.driverPhone ?? '');
    setDriverLicensePath(order?.driverLicenseStoragePath ?? null);
    setAssigningCarrier(true);
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
    if (!order) return;
    setSendingAgreement(true);
    setError('');
    try {
      const res = await fetch(`/api/orders/${orderId}/send-agreement`, { method: 'POST' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Failed to send');
      setAgreementSentTo(body.sentTo ?? 'carrier');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to send agreement');
    } finally {
      setSendingAgreement(false);
    }
  }

  async function handleGenerateBol() {
    if (!order) return;
    setGeneratingBol(true);
    setError('');
    try {
      const res  = await fetch(`/api/orders/${orderId}/bol`, { method: 'POST' });
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
        shipperId:    order.shipperId,
        shipperName:  order.shipperName,
        parentOrderId: orderId,
        status:       'quote',
        commodity:    order.commodity,
        pieces:       1,
        weight:       0,
        origin:       order.origin,
        destination:  order.destination,
        pickupDate:   null,
        deliveryDate: null,
        carrierId:    null,
        carrierName:  '',
        driverName:   '',
        driverPhone:  '',
        driverLicenseStoragePath: null,
        bolStoragePath: null,
        agreedRate:   0,
        brokerFee:    0,
        carrierPay:   0,
        notes:        '',
        deliveredAt:       null,
        carrierSignedAt:   null,
        carrierSignerName: null,
        carrierSignerIp:   null,
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
          <p className="text-sm text-gray-500">{order.shipperName} — {order.commodity}</p>
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
        {(['details', 'suborders'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px capitalize transition ${
              tab === t ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {t === 'suborders' ? `Suborders (${suborders.length})` : 'Details'}
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
              <DetailRow label="Shipper" value={order.shipperName} />
              <DetailRow label="Commodity" value={order.commodity} />
              <DetailRow label="Pieces" value={order.pieces} />
              <DetailRow label="Weight" value={order.weight ? `${order.weight.toLocaleString()} lbs` : '—'} />
              <DetailRow label="Pickup Date" value={formatDate(order.pickupDate as { toDate: () => Date } | null)} />
              <DetailRow label="Delivery Date" value={formatDate(order.deliveryDate as { toDate: () => Date } | null)} />
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

            {assigningCarrier ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Carrier</label>
                  <select value={selectedCarrierId} onChange={(e) => setSelectedCarrierId(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400">
                    <option value="">— Unassigned —</option>
                    {carriers.map((c) => (
                      <option key={c.id} value={c.id}>{c.companyName}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Driver Name</label>
                    <input value={driverName} onChange={(e) => setDriverName(e.target.value)} placeholder="Full name"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
                  </div>
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
                    onUploaded={setDriverLicensePath}
                  />
                </div>
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
