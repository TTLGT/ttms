'use client';

import { useEffect, useRef, useState } from 'react';
import { FileText, Loader2, Trash2, Upload } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { deleteOrderFile, listOrderFiles, uploadOrderFile } from '@/lib/orderFiles';
import { useDateFormatters } from '@/lib/useDateFormatters';
import { formatFileSize, type OrderFile, type OrderFileKind } from '@/types/orderFile';

/**
 * One kind of order file with a place of its own — the carrier's invoice, and
 * the BOL and client invoice copied from BATS on an imported load. The same
 * upload, records and change-log line as "Other files"; only drawn apart, so
 * the Documents tab can show it on its own row with a status.
 *
 * Unlike a signed agreement (SignedSaUploads) nothing here is reviewed: these
 * prove nothing the system acts on, so a copy counts as soon as it is on the
 * load. Removing follows the files route — the uploader, or somebody who sees
 * every load.
 */
export default function OrderFileSlot({ orderId, kind, uploadLabel, hint, onCount }: {
  orderId: string;
  kind: OrderFileKind;
  /** What the button says while the slot is empty. */
  uploadLabel: string;
  /** One line under an empty slot saying what belongs in it. */
  hint?: string;
  /** How many files the slot holds, whenever that is known or changes — for a status column beside it. */
  onCount?: (count: number) => void;
}) {
  const { user, can } = useAuth();
  const { formatDateTime } = useDateFormatters();
  const [files, setFiles] = useState<OrderFile[] | null>(null);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const [busy, setBusy] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listOrderFiles(orderId)
      .then((all) => setFiles(all.filter((f) => f.kind === kind)))
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load the files'));
  }, [orderId, kind]);

  const count = files?.length;
  useEffect(() => { if (count !== undefined) onCount?.(count); }, [count, onCount]);

  async function upload(list: FileList) {
    setError('');
    for (const file of Array.from(list)) {
      try {
        setProgress(0);
        const saved = await uploadOrderFile(orderId, file, { kind, note: '' }, setProgress);
        setFiles((f) => [...(f ?? []), saved]);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Upload failed');
      } finally {
        setProgress(null);
      }
    }
  }

  async function remove(file: OrderFile) {
    if (!confirm(`Remove ${file.name} from this load? It cannot be brought back.`)) return;
    setBusy(file.id);
    try {
      await deleteOrderFile(orderId, file.id);
      setFiles((f) => f?.filter((x) => x.id !== file.id) ?? f);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove it');
    } finally {
      setBusy('');
    }
  }

  const mayRemove = (f: OrderFile) => f.uploadedByUid === user?.uid || can('orders.viewAll');
  const hasFiles = Boolean(files && files.length > 0);

  return (
    <div className="space-y-2">
      {hasFiles && (
        <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
          {files!.map((f) => (
            <li key={f.id} className="flex items-center gap-3 px-3 py-2">
              <FileText className="h-4 w-4 shrink-0 text-gray-400" />
              <div className="min-w-0 flex-1">
                <a href={f.url} target="_blank" rel="noreferrer" className="block truncate text-sm font-medium text-brand-700 hover:underline">{f.name}</a>
                <p className="truncate text-[11px] text-gray-500">
                  {formatFileSize(f.size)} · uploaded by {f.uploadedByName} · {formatDateTime(new Date(f.createdAt))}
                </p>
              </div>
              {mayRemove(f) && (
                <button type="button" onClick={() => void remove(f)} disabled={busy === f.id} aria-label={`Remove ${f.name}`}
                  className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <button type="button" onClick={() => inputRef.current?.click()} disabled={progress !== null}
        className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-gray-400 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
        {progress !== null ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
        {progress !== null ? `Uploading… ${progress}%` : hasFiles ? 'Upload another' : uploadLabel}
      </button>
      {/* PDFs and pictures offered first; anything else still goes through "All files". */}
      <input ref={inputRef} type="file" accept="application/pdf,image/*" multiple className="hidden"
        onChange={(e) => { if (e.target.files?.length) void upload(e.target.files); e.target.value = ''; }} />
      {!hasFiles && files !== null && hint && <p className="text-[11px] text-gray-500">{hint}</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
