'use client';

import { useEffect, useState, useMemo } from 'react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart,
} from 'recharts';
import { subMonths, format } from 'date-fns';
import { listOrders } from '@/lib/orders';
import type { Order } from '@/types/order';

const RANGES = [
  { label: 'Last 3 months',  months: 3  },
  { label: 'Last 6 months',  months: 6  },
  { label: 'Last 12 months', months: 12 },
  { label: 'All time',       months: 0  },
];

function fmt$(n: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0,
  }).format(n);
}

// Recharts types tooltip values as this union — every series on this page is
// numeric, so formatters take the wide type and narrow it here.
type ChartValue = number | string | readonly (number | string)[] | undefined;

function toNum(v: ChartValue): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function toDate(ts: unknown): Date | null {
  if (!ts) return null;
  if (typeof (ts as { toDate?: () => Date }).toDate === 'function') {
    return (ts as { toDate: () => Date }).toDate();
  }
  return null;
}

type KpiColor = 'blue' | 'green' | 'purple' | 'yellow';

function KpiCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: KpiColor }) {
  const palette: Record<KpiColor, string> = {
    blue:   'bg-blue-50   border-blue-200   text-blue-700',
    green:  'bg-green-50  border-green-200  text-green-700',
    purple: 'bg-purple-50 border-purple-200 text-purple-700',
    yellow: 'bg-yellow-50 border-yellow-200 text-yellow-700',
  };
  return (
    <div className={`rounded-xl border px-5 py-5 ${palette[color]}`}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-70">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
      <p className="text-xs mt-1 opacity-60">{sub}</p>
    </div>
  );
}

function Empty() {
  return <p className="text-gray-400 text-sm text-center py-10">No data for this period.</p>;
}

export default function AnalyticsPage() {
  const [orders, setOrders]   = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange]     = useState(6);

  /*
    Refetched when the range changes rather than filtered in the browser.

    This page used to ask for every order in the company — twelve megabytes and
    about seventeen seconds — and then throw away everything outside the chosen
    window. Now the window is the query, and each order arrives as the seven
    fields these charts actually read instead of the full record.

    "All time" is still a large answer, and deliberately so: a margin-by-month
    chart of the whole history is the one thing on this screen that genuinely
    needs the whole history. It is simply no longer the default.
  */
  useEffect(() => {
    let live = true;
    setLoading(true);
    const cutoff = range === 0 ? null : subMonths(new Date(), range);
    listOrders({
      fields:     'analytics',
      pickupFrom: cutoff ? cutoff.getTime() : undefined,
    })
      .then((o) => { if (live) setOrders(o); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [range]);

  const filtered = useMemo(
    // The date bound is applied by the query; only the status test is left,
    // and it stays here because "delivered or completed" is two equalities
    // that would each need their own index alongside the range.
    () => orders.filter((o) => o.status === 'delivered' || o.status === 'completed'),
    [orders],
  );

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const revenue     = filtered.reduce((s, o) => s + (o.agreedRate  || 0), 0);
    const carrierCost = filtered.reduce((s, o) => s + (o.carrierPay  || 0), 0);
    const margin      = revenue - carrierCost;
    const marginPct   = revenue > 0 ? (margin / revenue) * 100 : 0;
    const now         = new Date();
    const loadsThisMonth = filtered.filter((o) => {
      const d = toDate(o.pickupDate);
      return d && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;
    return { revenue, carrierCost, margin, marginPct, loads: filtered.length, loadsThisMonth };
  }, [filtered]);

  // ── Monthly trend ─────────────────────────────────────────────────────────
  const monthlyData = useMemo(() => {
    const map = new Map<string, { key: string; month: string; revenue: number; carrierCost: number; loads: number }>();
    filtered.forEach((o) => {
      const d = toDate(o.pickupDate);
      if (!d) return;
      const key   = format(d, 'yyyy-MM');
      const label = format(d, 'MMM yy');
      const prev  = map.get(key) ?? { key, month: label, revenue: 0, carrierCost: 0, loads: 0 };
      map.set(key, {
        ...prev,
        revenue:     prev.revenue     + (o.agreedRate || 0),
        carrierCost: prev.carrierCost + (o.carrierPay || 0),
        loads:       prev.loads       + 1,
      });
    });
    return Array.from(map.values())
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((m) => ({
        ...m,
        margin:    m.revenue - m.carrierCost,
        marginPct: m.revenue > 0 ? +((m.revenue - m.carrierCost) / m.revenue * 100).toFixed(1) : 0,
      }));
  }, [filtered]);

  // ── Top clients ───────────────────────────────────────────────────────────
  const topClients = useMemo(() => {
    const map = new Map<string, { name: string; revenue: number; loads: number }>();
    filtered.forEach((o) => {
      // Group on the client, falling back to the name so orders that predate
      // the party migration do not all collapse into one empty-id bucket.
      const key  = o.clientId || `name:${(o.clientName || '').toLowerCase()}` || 'unknown';
      const prev = map.get(key) ?? { name: o.clientName || 'Unknown', revenue: 0, loads: 0 };
      map.set(key, { ...prev, revenue: prev.revenue + (o.agreedRate || 0), loads: prev.loads + 1 });
    });
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 10);
  }, [filtered]);

  // ── Margin by transport type ───────────────────────────────────────────────
  const byType = useMemo(() => {
    const map = new Map<string, { type: string; revenue: number; carrierCost: number; loads: number }>();
    filtered.forEach((o) => {
      const type = o.transportType || 'Other';
      const prev = map.get(type) ?? { type, revenue: 0, carrierCost: 0, loads: 0 };
      map.set(type, {
        ...prev,
        revenue:     prev.revenue     + (o.agreedRate || 0),
        carrierCost: prev.carrierCost + (o.carrierPay || 0),
        loads:       prev.loads       + 1,
      });
    });
    return Array.from(map.values())
      .map((t) => ({
        ...t,
        marginPct: t.revenue > 0 ? +((t.revenue - t.carrierCost) / t.revenue * 100).toFixed(1) : 0,
      }))
      .sort((a, b) => b.marginPct - a.marginPct);
  }, [filtered]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6 sm:mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Revenue & Margin Analytics</h1>
          <p className="text-gray-500 mt-1 text-sm">Delivered and completed orders only.</p>
        </div>
        <select
          value={range}
          onChange={(e) => setRange(Number(e.target.value))}
          className="text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          {RANGES.map((r) => (
            <option key={r.months} value={r.months}>{r.label}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-24">
          <div className="w-7 h-7 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <KpiCard label="Total Revenue"     value={fmt$(kpis.revenue)}             sub={`${kpis.loads} loads`}              color="blue"   />
            <KpiCard label="Gross Margin"      value={fmt$(kpis.margin)}              sub={`Carrier cost: ${fmt$(kpis.carrierCost)}`} color="green"  />
            <KpiCard label="Avg Margin %"      value={`${kpis.marginPct.toFixed(1)}%`} sub="Revenue − carrier pay"             color="purple" />
            <KpiCard label="Loads This Month"  value={String(kpis.loadsThisMonth)}    sub="Delivered or completed"             color="yellow" />
          </div>

          {/* Monthly Revenue & Margin Chart */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-6">
            <div className="flex items-center gap-6 mb-4">
              <h2 className="font-semibold text-gray-800">Monthly Revenue & Margin %</h2>
              <div className="flex items-center gap-4 text-xs text-gray-500">
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm inline-block bg-blue-300" /> Revenue</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm inline-block bg-brand-500" /> Gross Margin</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-1 inline-block bg-green-600 rounded" /> Margin %</span>
              </div>
            </div>
            {monthlyData.length === 0 ? <Empty /> : (
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={monthlyData} margin={{ top: 4, right: 24, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis yAxisId="left"  tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} width={52} />
                  <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => `${v}%`}  tick={{ fontSize: 11 }} width={40} />
                  <Tooltip
                    formatter={(value: ChartValue, name: string | number | undefined) => {
                      if (name === 'marginPct') return [`${toNum(value)}%`,  'Margin %'];
                      if (name === 'revenue')   return [fmt$(toNum(value)),  'Revenue'];
                      if (name === 'margin')    return [fmt$(toNum(value)),  'Gross Margin'];
                      return [String(value ?? ''), String(name ?? '')];
                    }}
                  />
                  <Bar  yAxisId="left"  dataKey="revenue"   fill="#93c5fd" name="revenue"   radius={[3, 3, 0, 0]} />
                  <Bar  yAxisId="left"  dataKey="margin"    fill="#1d4ed8" name="margin"    radius={[3, 3, 0, 0]} />
                  <Line yAxisId="right" type="monotone" dataKey="marginPct" stroke="#16a34a" strokeWidth={2} dot={{ r: 3 }} name="marginPct" />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Top Clients + By Transport Type */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
              <h2 className="font-semibold text-gray-800 mb-4">Top Clients by Revenue</h2>
              {topClients.length === 0 ? <Empty /> : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart layout="vertical" data={topClients} margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                    <XAxis type="number" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={90} />
                    <Tooltip formatter={(v: ChartValue) => [fmt$(toNum(v)), 'Revenue']} />
                    <Bar dataKey="revenue" fill="#1d4ed8" radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
              <h2 className="font-semibold text-gray-800 mb-4">Margin % by Transport Type</h2>
              {byType.length === 0 ? <Empty /> : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={byType} margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="type" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} width={40} />
                    <Tooltip formatter={(v: ChartValue) => [`${toNum(v)}%`, 'Margin %']} />
                    <Bar dataKey="marginPct" fill="#1d4ed8" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Monthly Breakdown Table */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-800">Monthly Breakdown</h2>
            </div>
            {monthlyData.length === 0 ? <Empty /> : (
              <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100">
                <thead className="bg-gray-50">
                  <tr>
                    {['Month', 'Revenue', 'Carrier Cost', 'Gross Margin', 'Margin %', 'Loads'].map((h) => (
                      <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {[...monthlyData].reverse().map((m) => (
                    <tr key={m.key} className="hover:bg-gray-50 transition">
                      <td className="px-5 py-3 text-sm font-medium text-gray-800">{m.month}</td>
                      <td className="px-5 py-3 text-sm text-gray-700">{fmt$(m.revenue)}</td>
                      <td className="px-5 py-3 text-sm text-gray-500">{fmt$(m.carrierCost)}</td>
                      <td className="px-5 py-3 text-sm font-semibold text-green-700">{fmt$(m.margin)}</td>
                      <td className="px-5 py-3 text-sm">
                        <span className={`font-semibold ${m.marginPct >= 15 ? 'text-green-700' : m.marginPct >= 10 ? 'text-yellow-600' : 'text-red-600'}`}>
                          {m.marginPct.toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-5 py-3 text-sm text-gray-600">{m.loads}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
