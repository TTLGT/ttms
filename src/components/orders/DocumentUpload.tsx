'use client';

import { useRef, useState } from 'react';
import { ref, uploadBytesResumable, deleteObject } from 'firebase/storage';
import { storage } from '@/lib/firebase';
import { orderDocumentUrl } from '@/lib/orders';
import type { OrderDocumentKind } from '@/types/orderDocument';

type DocType = 'invoice' | 'pod';

const CONFIG: Record<DocType, { uploadLabel: string; viewLabel: string; folder: string }> = {
  invoice: { uploadLabel: 'Upload Invoice', viewLabel: 'View Invoice', folder: 'invoices' },
  pod:     { uploadLabel: 'Upload POD',     viewLabel: 'View POD',     folder: 'pods' },
};

interface Props {
  orderId: string;
  docType: DocType;
  existingPath: string | null;
  onUploaded: (storagePath: string | null) => void;
  readOnly?: boolean;
}

export default function DocumentUpload({ orderId, docType, existingPath, onUploaded, readOnly }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [removing, setRemoving] = useState(false);
  const cfg = CONFIG[docType];

  async function handleFile(file: File) {
    if (file.size > 20 * 1024 * 1024) { setError('File must be under 20 MB'); return; }
    setError('');
    const path = `${cfg.folder}/${orderId}/${Date.now()}_${file.name}`;
    const task = uploadBytesResumable(ref(storage, path), file);
    task.on(
      'state_changed',
      (snap) => setProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
      (err) => { setError(err.message); setProgress(null); },
      () => { setProgress(null); onUploaded(path); },
    );
  }

  async function handleRemove() {
    if (!existingPath) return;
    setRemoving(true);
    try { await deleteObject(ref(storage, existingPath)); } catch { /* already gone */ }
    finally { setRemoving(false); onUploaded(null); }
  }

  if (existingPath && progress === null) {
    return (
      <div className="flex items-center gap-3">
        <DownloadLink orderId={orderId} docType={docType} label={cfg.viewLabel} />
        {!readOnly && (
          <>
            <button type="button" onClick={() => inputRef.current?.click()}
              className="text-xs text-brand-600 hover:text-brand-700 font-medium">
              Replace
            </button>
            <button type="button" onClick={handleRemove} disabled={removing}
              className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50">
              {removing ? 'Removing…' : 'Remove'}
            </button>
            <input ref={inputRef} type="file" accept="image/*,.pdf" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />
          </>
        )}
      </div>
    );
  }

  return (
    <div>
      {progress !== null ? (
        <div className="flex items-center gap-2 w-40">
          <div className="flex-1 bg-gray-200 rounded-full h-1.5">
            <div className="bg-brand-500 h-1.5 rounded-full transition-all" style={{ width: `${progress}%` }} />
          </div>
          <span className="text-xs text-gray-500">{progress}%</span>
        </div>
      ) : (
        <>
          <button type="button" onClick={() => inputRef.current?.click()}
            className="text-xs text-brand-600 hover:text-brand-700 border border-brand-200 bg-brand-50 rounded-lg px-3 py-1.5 font-medium transition hover:bg-brand-100">
            {cfg.uploadLabel}
          </button>
          <input ref={inputRef} type="file" accept="image/*,.pdf" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />
        </>
      )}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}

/**
 * Opens one of an order's documents.
 *
 * Asks the server for the link rather than resolving the path in the browser:
 * the BOL, invoice and POD prefixes are closed to the client SDK so that order
 * ownership can be checked somewhere it is able to be — see
 * src/types/orderDocument.ts. The order id is what identifies the file, not a
 * path, so a caller cannot name an object it was never shown.
 */
export function DownloadLink(
  { orderId, docType, label }: { orderId: string; docType: OrderDocumentKind; label: string },
) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  async function open() {
    setLoading(true);
    setFailed(false);
    const u = await orderDocumentUrl(orderId, docType).catch(() => null);
    setLoading(false);
    if (!u) { setFailed(true); return; }
    setUrl(u);
    window.open(u, '_blank');
  }

  if (failed) {
    return <span className="text-xs text-gray-400">Unavailable</span>;
  }

  return (
    <button type="button" onClick={url ? () => window.open(url, '_blank') : open}
      disabled={loading}
      className="text-xs text-brand-600 hover:underline disabled:opacity-50">
      {loading ? 'Loading…' : label}
    </button>
  );
}
