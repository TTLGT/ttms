'use client';

import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, X, FileText } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import type { ImportResult } from '@/lib/batsImport';

const CSV_ACCEPT = { 'text/csv': ['.csv'] };

interface SlotProps {
  label: string;
  hint: string;
  files: File[];
  multiple: boolean;
  onChange: (files: File[]) => void;
}

function DropSlot({ label, hint, files, multiple, onChange }: SlotProps) {
  const onDrop = useCallback((accepted: File[]) => {
    onChange(multiple ? [...files, ...accepted] : accepted.slice(0, 1));
  }, [files, multiple, onChange]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: CSV_ACCEPT,
    multiple,
  });

  return (
    <div>
      <p className="text-sm font-medium text-gray-800">{label}</p>
      <p className="text-xs text-gray-400 mb-2">{hint}</p>
      <div
        {...getRootProps()}
        className={`rounded-lg border-2 border-dashed px-4 py-6 text-center cursor-pointer transition ${
          isDragActive ? 'border-brand-400 bg-brand-50' : 'border-gray-200 hover:border-gray-300'
        }`}
      >
        <input {...getInputProps()} />
        <UploadCloud size={20} className="mx-auto text-gray-400 mb-1" />
        <p className="text-xs text-gray-500">
          {isDragActive ? 'Drop the CSV here…' : 'Drag & drop CSV, or click to browse'}
        </p>
      </div>

      {files.length > 0 && (
        <ul className="mt-2 space-y-1">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center justify-between text-xs bg-gray-50 border border-gray-100 rounded-lg px-3 py-1.5">
              <span className="flex items-center gap-1.5 text-gray-600 truncate">
                <FileText size={12} className="shrink-0" />
                <span className="truncate">{f.name}</span>
              </span>
              <button
                type="button"
                onClick={() => onChange(files.filter((_, idx) => idx !== i))}
                className="text-gray-400 hover:text-red-500 shrink-0 ml-2"
              >
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function BatsImportPanel() {
  const { user } = useAuth();
  const [carriers,  setCarriers]  = useState<File[]>([]);
  const [customers, setCustomers] = useState<File[]>([]);
  const [orders,    setOrders]    = useState<File[]>([]);
  const [running,   setRunning]   = useState(false);
  const [error,     setError]     = useState('');
  const [results,   setResults]   = useState<ImportResult[] | null>(null);

  const hasFiles = carriers.length || customers.length || orders.length;

  async function handleImport() {
    if (!user || !hasFiles) return;
    setRunning(true);
    setError('');
    setResults(null);

    try {
      const form = new FormData();
      if (carriers[0])  form.append('carriers', carriers[0]);
      if (customers[0]) form.append('customers', customers[0]);
      orders.forEach((f) => form.append('orders', f));

      const idToken = await user.getIdToken();
      const res = await fetch('/api/admin/import-bats', {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}` },
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import failed');

      setResults(data.results);
      setCarriers([]);
      setCustomers([]);
      setOrders([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setRunning(false);
    }
  }

  const COLLECTION_LABEL: Record<string, string> = {
    carriers: 'Carriers', customers: 'Customers', orders: 'Orders', parties: 'Parties',
  };

  return (
    <section className="bg-white rounded-xl border border-gray-200 mt-6">
      <div className="px-6 py-4 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-900">BATS Data Import</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Drop fresh BATS CRM export CSVs here to sync carriers, customers, and orders.
          Only new or changed rows are written — re-uploading is safe and fast.
        </p>
      </div>

      <div className="p-6 grid grid-cols-1 sm:grid-cols-3 gap-6">
        <DropSlot label="Carriers"  hint="carriers-export-*.csv"  files={carriers}  multiple={false} onChange={setCarriers} />
        <DropSlot label="Customers" hint="customers-export-*.csv" files={customers} multiple={false} onChange={setCustomers} />
        <DropSlot label="Orders"    hint="orders-export-*.csv (multiple OK)" files={orders} multiple onChange={setOrders} />
      </div>

      <div className="px-6 pb-6 flex items-center gap-3">
        <button
          type="button"
          onClick={handleImport}
          disabled={!hasFiles || running}
          className="text-sm font-medium px-4 py-2 rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          {running ? 'Importing…' : 'Run Import'}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      {results && (
        <div className="px-6 pb-6">
          <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg overflow-hidden">
            {results.map((r) => (
              <li key={r.collection} className="px-4 py-2.5 text-sm bg-gray-50">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-700">{COLLECTION_LABEL[r.collection] ?? r.collection}</span>
                  <span className="text-gray-500">
                    {r.written} written · {r.skipped} unchanged · {r.total} total
                  </span>
                </div>
                {r.notes && <p className="text-xs text-gray-500 mt-1">{r.notes}</p>}

                {/*
                  Who the BATS owner names were matched to. Shown because an
                  admin has to be able to check the assignment before trusting
                  it — a silently mis-assigned book of business would be very
                  hard to notice afterwards.
                */}
                {r.owners && (r.owners.assigned + r.owners.ambiguous + r.owners.unresolved) > 0 && (
                  <div className="mt-2 pt-2 border-t border-gray-200">
                    <p className="text-xs text-gray-600">
                      Owners: <span className="font-medium">{r.owners.assigned} assigned</span>
                      {r.owners.ambiguous > 0 && ` · ${r.owners.ambiguous} ambiguous (skipped)`}
                      {r.owners.unresolved > 0 && ` · ${r.owners.unresolved} left as text`}
                    </p>
                    {r.owners.unresolvedNames.length > 0 && (
                      <>
                        <p className="text-xs text-gray-500 mt-1">
                          No match for these names. Their records keep the name for reference and
                          stay visible only to admin, dispatch and finance until someone is
                          assigned. Invite the person, or create a work group with that name, then
                          re-run the import.
                        </p>
                        <p className="text-xs text-gray-400 mt-1 break-words">
                          {r.owners.unresolvedNames.join(', ')}
                        </p>
                      </>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
