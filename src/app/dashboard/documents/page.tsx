'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Timestamp } from 'firebase/firestore';
import { listCarrierCois, listOrdersPage } from '@/lib/orders';
import { DownloadLink } from '@/components/orders/DocumentUpload';
import { DownloadLink as StorageDownloadLink } from '@/components/FileUploadField';
import InsuranceBadge from '@/components/carriers/InsuranceBadge';
import LoadPhotoBrowser from '@/components/photos/LoadPhotoBrowser';
import { useAuth } from '@/context/AuthContext';
import { useDateFormatters } from '@/lib/useDateFormatters';
import { DOCUMENT_LABEL, type CarrierCoiRow, type OrderDocumentKind } from '@/types/orderDocument';
import type { Order } from '@/types/order';
import { orderDisplayNumber, orderAltNumber } from '@/types/order';

// The kinds the document route serves, so a row can ask for its file by name
// rather than by a path the browser cannot use anyway. Driver licences are
// one of those kinds but are not listed here: they are found on the order
// they belong to, not searched for company-wide.
type DocType = Exclude<OrderDocumentKind, 'license'>;
// `coi` is not a DocType: a certificate belongs to the carrier, not the load,
// so it is listed in its own section rather than as a row of the table.
// `photos` is not one either: a load has any number of pictures, and they are
// browsed as pictures — see LoadPhotoBrowser — rather than as rows of files.
type FilterType = 'all' | DocType | 'coi' | 'photos';

interface DocRow {
  orderId: string;
  orderNumber: string;
  altNumber: string | null;
  docType: DocType;
  shipperName: string | null;
}

const TYPE_COLOR: Record<DocType, string> = {
  bol:     'bg-blue-50 text-blue-700 border-blue-200',
  invoice: 'bg-purple-50 text-purple-700 border-purple-200',
  pod:     'bg-green-50 text-green-700 border-green-200',
};

const DOWNLOAD_LABEL: Record<DocType, string> = {
  bol:     'View BOL',
  invoice: 'View Invoice',
  pod:     'View POD',
};

/** Rows for the three document kinds listed here, one per attached file. */
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
  { value: 'coi',     label: 'Certificates of Insurance' },
  { value: 'photos',  label: 'Load Pictures' },
];

export default function DocumentsPage() {
  const { can } = useAuth();
  const { formatDate } = useDateFormatters();
  const [rows, setRows]       = useState<DocRow[]>([]);
  const [cois, setCois]       = useState<CarrierCoiRow[]>([]);
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
    */
    Promise.all([
      Promise.all(([
        'bolStoragePath', 'invoiceStoragePath', 'podStoragePath',
      ] as const).map((field) =>
        listOrdersPage({ hasDocument: field }).then((p) => p.orders).catch(() => []),
      )),
      // Certificates hang off carriers, so they come back grouped by carrier
      // with the caller's loads attached — see /api/documents/cois.
      listCarrierCois().catch(() => []),
    ])
      .then(([owned, certificates]) => {
        const byId = new Map<string, Order>();
        for (const o of owned.flat()) byId.set(o.id, o);
        setRows(buildRows([...byId.values()]));
        setCois(certificates);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const showPhotos = filter === 'photos';
  const showDocs = filter !== 'coi' && !showPhotos;
  const showCois = filter === 'all' || filter === 'coi';

  const visibleCois = cois.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    // Order numbers too, so typing a load finds the certificate behind it —
    // but only the loads the row names, which are the newest few.
    return [c.companyName, c.mc, c.dot, c.insuranceProvider, c.insurancePolicyNumber,
      ...c.loads.flatMap((l) => [l.orderNumber, l.altNumber ?? ''])]
      .some((v) => v.toLowerCase().includes(q));
  });

  const visible = rows.filter((r) => {
    if (filter === 'coi') return false;
    if (filter !== 'all' && r.docType !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.orderNumber.toLowerCase().includes(q)
        || (r.altNumber ?? '').toLowerCase().includes(q)
        || (r.shipperName ?? '').toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className={`p-4 sm:p-6 lg:p-8 ${showPhotos ? 'max-w-7xl' : 'max-w-5xl'}`}>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Documents</h1>
          <p className="text-sm text-gray-500 mt-1">All BOLs, invoices and PODs across orders, the certificates of insurance for the carriers on your loads, and the pictures taken of them.</p>
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
        {/* The picture browser brings its own search, which reaches captions
            and commodities this one does not. */}
        {!showPhotos && <input
          type="search"
          placeholder="Search by order #, shipper or carrier…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:ml-auto sm:w-64 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
        />}
      </div>

      {/* Mounted only while chosen, so its read is spent only by somebody who
          came to look at pictures. */}
      {showPhotos && <LoadPhotoBrowser />}

      {showPhotos ? null : loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !showDocs ? null : visible.length === 0 ? (
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
                {['Order', 'Shipper', 'Document Type', 'Download'].map((h) => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visible.map((row, i) => (
                <tr key={i} className="hover:bg-gray-50 transition">
                  <td className="px-5 py-3">
                    {/* `from` so the order's back link returns here. */}
                    <Link href={`/dashboard/orders/${row.orderId}?tab=documents&from=documents`}
                      className="text-sm font-mono font-medium text-brand-700 hover:underline">
                      {row.orderNumber}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-sm text-gray-600">
                    {row.shipperName || <span className="text-gray-400">—</span>}
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

      {!loading && showCois && (
        <section className={showDocs ? 'mt-8' : ''}>
          <h2 className="text-base font-semibold text-gray-900">Certificates of Insurance</h2>
          <p className="text-sm text-gray-500 mt-0.5 mb-3">
            One per carrier, for every carrier on a load you can see. Upload or replace a certificate from the carrier&apos;s page.
          </p>

          {visibleCois.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
              <p className="text-sm text-gray-400">
                {cois.length === 0
                  ? 'None of the carriers on your loads has a certificate on file yet.'
                  : 'No certificates match your search.'}
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100">
                <thead className="bg-gray-50">
                  <tr>
                    {['Carrier', 'Insurance', 'Your Loads', 'Certificate'].map((h) => (
                      <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {visibleCois.map((c) => {
                    const expires = c.insuranceExpiration === null ? null : Timestamp.fromMillis(c.insuranceExpiration);
                    return (
                      <tr key={c.carrierId} className="hover:bg-gray-50 transition align-top">
                        <td className="px-5 py-3">
                          {can('carriers.view') ? (
                            <Link href={`/dashboard/carriers/${c.carrierId}`}
                              className="text-sm font-medium text-brand-700 hover:underline">
                              {c.companyName || 'Unnamed carrier'}
                            </Link>
                          ) : (
                            <span className="text-sm font-medium text-gray-900">{c.companyName || 'Unnamed carrier'}</span>
                          )}
                          {(c.mc || c.dot) && (
                            <p className="text-xs text-gray-400 mt-0.5">
                              {[c.mc && `MC ${c.mc}`, c.dot && `DOT ${c.dot}`].filter(Boolean).join(' · ')}
                            </p>
                          )}
                        </td>
                        <td className="px-5 py-3 text-sm text-gray-600">
                          <div className="flex items-center gap-2">
                            <InsuranceBadge expiration={expires} />
                            {expires && <span className="text-xs text-gray-500">until {formatDate(expires)}</span>}
                          </div>
                          {(c.insuranceProvider || c.insurancePolicyNumber) && (
                            <p className="text-xs text-gray-400 mt-1">
                              {[c.insuranceProvider, c.insurancePolicyNumber && `Policy ${c.insurancePolicyNumber}`].filter(Boolean).join(' · ')}
                            </p>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex flex-wrap gap-x-2 gap-y-1">
                            {c.loads.map((l) => (
                              <Link key={l.orderId} href={`/dashboard/orders/${l.orderId}?from=documents`}
                                className="text-xs font-mono text-brand-700 hover:underline">
                                {l.orderNumber}
                              </Link>
                            ))}
                            {c.loadCount > c.loads.length && (
                              <span className="text-xs text-gray-400">+{c.loadCount - c.loads.length} more</span>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          <StorageDownloadLink storagePath={c.insuranceStoragePath} label="View COI" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="px-5 py-3 border-t border-gray-100 bg-gray-50">
                <p className="text-xs text-gray-400">{visibleCois.length} certificate{visibleCois.length !== 1 ? 's' : ''}</p>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
