'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { listOrdersPage } from '@/lib/orders';
import { DownloadLink } from '@/components/orders/DocumentUpload';
import type { Order } from '@/types/order';
import { orderDisplayNumber, orderAltNumber } from '@/types/order';

type DocType = 'bol' | 'invoice' | 'pod' | 'driver_license';
type FilterType = 'all' | DocType;

interface DocRow {
  orderId: string;
  orderNumber: string;
  altNumber: string | null;
  shipperName: string;
  docType: DocType;
  storagePath: string;
}

const TYPE_LABEL: Record<DocType, string> = {
  bol:            'Bill of Lading',
  invoice:        'Invoice',
  pod:            'Proof of Delivery',
  driver_license: 'Driver License',
};

const TYPE_COLOR: Record<DocType, string> = {
  bol:            'bg-blue-50 text-blue-700 border-blue-200',
  invoice:        'bg-purple-50 text-purple-700 border-purple-200',
  pod:            'bg-green-50 text-green-700 border-green-200',
  driver_license: 'bg-gray-100 text-gray-600 border-gray-200',
};

const DOWNLOAD_LABEL: Record<DocType, string> = {
  bol:            'View BOL',
  invoice:        'View Invoice',
  pod:            'View POD',
  driver_license: 'View License',
};

function buildRows(orders: Order[]): DocRow[] {
  const rows: DocRow[] = [];
  for (const o of orders) {
    // Both numbers go into the row so the search box finds a load by either
    // one. Staff still search BATS ids out of habit, and a TTMS number is what
    // a newer document is filed under.
    const base = {
      orderId:     o.id,
      orderNumber: orderDisplayNumber(o),
      altNumber:   orderAltNumber(o),
      shipperName: o.shipperName,
    };
    if (o.bolStoragePath)            rows.push({ ...base, docType: 'bol',            storagePath: o.bolStoragePath });
    if (o.invoiceStoragePath)        rows.push({ ...base, docType: 'invoice',        storagePath: o.invoiceStoragePath });
    if (o.podStoragePath)            rows.push({ ...base, docType: 'pod',            storagePath: o.podStoragePath });
    if (o.driverLicenseStoragePath)  rows.push({ ...base, docType: 'driver_license', storagePath: o.driverLicenseStoragePath });
  }
  return rows;
}

const FILTERS: { value: FilterType; label: string }[] = [
  { value: 'all',            label: 'All' },
  { value: 'bol',            label: 'Bills of Lading' },
  { value: 'invoice',        label: 'Invoices' },
  { value: 'pod',            label: 'Proofs of Delivery' },
  { value: 'driver_license', label: 'Driver Licenses' },
];

export default function DocumentsPage() {
  const [rows, setRows]       = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [filter, setFilter]   = useState<FilterType>('all');

  useEffect(() => {
    /*
      Four queries, one per attachment kind, instead of reading every order and
      discarding the ones with nothing attached. An order carrying a file is
      very much the exception — this page used to pull ten thousand documents
      to render a handful of rows.

      An order with both a BOL and an invoice comes back in two of the four
      results and contributes a row to each, which is exactly right: the page
      lists files, not orders.
    */
    Promise.all(([
      'bolStoragePath', 'invoiceStoragePath', 'podStoragePath', 'driverLicenseStoragePath',
    ] as const).map((field) =>
      listOrdersPage({ hasDocument: field }).then((p) => p.orders).catch(() => []),
    ))
      .then((results) => {
        const byId = new Map<string, Order>();
        for (const o of results.flat()) byId.set(o.id, o);
        setRows(buildRows([...byId.values()]));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const visible = rows.filter((r) => {
    if (filter !== 'all' && r.docType !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.orderNumber.toLowerCase().includes(q)
        || (r.altNumber ?? '').toLowerCase().includes(q)
        || r.shipperName.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Documents</h1>
          <p className="text-sm text-gray-500 mt-1">All BOLs, invoices, PODs, and driver licenses across orders.</p>
        </div>
      </div>

      {/* Filters + Search */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-5">
        <div className="flex gap-1.5 flex-wrap">
          {FILTERS.map((f) => (
            <button key={f.value} onClick={() => setFilter(f.value)}
              className={`px-3 py-1 text-xs font-medium rounded-full border transition ${
                filter === f.value
                  ? 'bg-brand-600 text-white border-brand-600'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-brand-400 hover:text-brand-600'
              }`}>
              {f.label}
            </button>
          ))}
        </div>
        <input
          type="search"
          placeholder="Search by order # or shipper…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="ml-auto w-64 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : visible.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-sm text-gray-400">
            {rows.length === 0 ? 'No documents found. Generate a BOL or upload documents from an order.' : 'No documents match your filter.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                {['Order', 'Shipper', 'Document Type', 'Download'].map((h) => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visible.map((row, i) => (
                <tr key={i} className="hover:bg-gray-50 transition">
                  <td className="px-5 py-3">
                    <Link href={`/dashboard/orders/${row.orderId}?tab=documents`}
                      className="text-sm font-mono font-medium text-brand-700 hover:underline">
                      {row.orderNumber}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-sm text-gray-600">{row.shipperName}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center text-xs font-medium border rounded-full px-2.5 py-0.5 ${TYPE_COLOR[row.docType]}`}>
                      {TYPE_LABEL[row.docType]}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <DownloadLink storagePath={row.storagePath} label={DOWNLOAD_LABEL[row.docType]} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-5 py-3 border-t border-gray-100 bg-gray-50">
            <p className="text-xs text-gray-400">{visible.length} document{visible.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
      )}
    </div>
  );
}
