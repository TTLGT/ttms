'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { listLicenseDocuments, listOrdersPage } from '@/lib/orders';
import { DownloadLink } from '@/components/orders/DocumentUpload';
import OrderOwnerContact from '@/components/orders/OrderOwnerContact';
import { DOCUMENT_LABEL, type OrderDocumentKind } from '@/types/orderDocument';
import type { OwnerContact } from '@/types/order';
import type { Order } from '@/types/order';
import { orderDisplayNumber, orderAltNumber } from '@/types/order';

// The same four kinds the document route serves, so a row can ask for its
// file by name rather than by a path the browser cannot use anyway.
type DocType = OrderDocumentKind;
type FilterType = 'all' | DocType;

interface DocRow {
  orderId: string;
  orderNumber: string;
  altNumber: string | null;
  docType: DocType;
  /**
   * null on a licence belonging to a load this user cannot see. Licences are
   * open to all staff but the loads behind them are not, so the shipper is
   * withheld and `owner` names who to ask instead.
   */
  shipperName: string | null;
  owner: OwnerContact | null;
}

const TYPE_COLOR: Record<DocType, string> = {
  bol:     'bg-blue-50 text-blue-700 border-blue-200',
  invoice: 'bg-purple-50 text-purple-700 border-purple-200',
  pod:     'bg-green-50 text-green-700 border-green-200',
  license: 'bg-gray-100 text-gray-600 border-gray-200',
};

const DOWNLOAD_LABEL: Record<DocType, string> = {
  bol:     'View BOL',
  invoice: 'View Invoice',
  pod:     'View POD',
  license: 'View License',
};

/**
 * Rows for the three document kinds that follow the load's own visibility.
 * Licences come from listLicenseDocuments() instead — they are listed company
 * wide, so they cannot be derived from a list of orders this user can see.
 */
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
      owner:       null,
    };
    if (o.bolStoragePath)            rows.push({ ...base, docType: 'bol' });
    if (o.invoiceStoragePath)        rows.push({ ...base, docType: 'invoice' });
    if (o.podStoragePath)            rows.push({ ...base, docType: 'pod' });
  }
  return rows;
}

const FILTERS: { value: FilterType; label: string }[] = [
  { value: 'all',            label: 'All' },
  { value: 'bol',     label: 'Bills of Lading' },
  { value: 'invoice', label: 'Invoices' },
  { value: 'pod',     label: 'Proofs of Delivery' },
  { value: 'license', label: 'Driver Licenses' },
];

export default function DocumentsPage() {
  const [rows, setRows]       = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [filter, setFilter]   = useState<FilterType>('all');

  useEffect(() => {
    /*
      One query per attachment kind, instead of reading every order and
      discarding the ones with nothing attached. An order carrying a file is
      very much the exception — this page used to pull ten thousand documents
      to render a handful of rows.

      An order with both a BOL and an invoice comes back in two of the results
      and contributes a row to each, which is exactly right: the page lists
      files, not orders.

      Licences are the odd one out and are fetched on their own, because they
      are the only kind not bounded by what this user may see.
    */
    Promise.all([
      Promise.all(([
        'bolStoragePath', 'invoiceStoragePath', 'podStoragePath',
      ] as const).map((field) =>
        listOrdersPage({ hasDocument: field }).then((p) => p.orders).catch(() => []),
      )),
      // Licences are fetched separately and company-wide, not through the
      // order list: they are readable by every staff account, so a broker has
      // to be able to find one on a load that is not theirs. The rows arrive
      // already redacted — see /api/documents/licenses.
      listLicenseDocuments().catch(() => []),
    ])
      .then(([owned, licenses]) => {
        const byId = new Map<string, Order>();
        for (const o of owned.flat()) byId.set(o.id, o);
        setRows([
          ...buildRows([...byId.values()]),
          ...licenses.map((l) => ({ ...l, docType: 'license' as const })),
        ]);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const visible = rows.filter((r) => {
    if (filter !== 'all' && r.docType !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      // Owner name stands in for the shipper on a withheld row, so the box
      // still finds something on every row it is showing.
      return r.orderNumber.toLowerCase().includes(q)
        || (r.altNumber ?? '').toLowerCase().includes(q)
        || (r.shipperName ?? '').toLowerCase().includes(q)
        || (r.owner?.name ?? '').toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl">
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
          className="w-full sm:ml-auto sm:w-64 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
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
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                {['Order', 'Shipper / Owner', 'Document Type', 'Download'].map((h) => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visible.map((row, i) => (
                <tr key={i} className="hover:bg-gray-50 transition">
                  <td className="px-5 py-3">
                    {/* `from` so the no-access panel sends them back here
                        rather than to a list of orders that, for a licence on
                        somebody else's load, will not contain it. */}
                    <Link href={`/dashboard/orders/${row.orderId}?tab=documents&from=documents`}
                      className="text-sm font-mono font-medium text-brand-700 hover:underline">
                      {row.orderNumber}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-sm text-gray-600">
                    {row.shipperName !== null
                      ? row.shipperName
                      : row.owner
                        ? <OrderOwnerContact owner={row.owner} />
                        : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center text-xs font-medium border rounded-full px-2.5 py-0.5 ${TYPE_COLOR[row.docType]}`}>
                      {DOCUMENT_LABEL[row.docType]}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <DownloadLink orderId={row.orderId} docType={row.docType} label={DOWNLOAD_LABEL[row.docType]} />
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
