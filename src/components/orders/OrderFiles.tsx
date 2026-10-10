'use client';

import { useEffect, useRef, useState } from 'react';
import { FileText, Loader2, Paperclip, Trash2, Upload } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { deleteOrderFile, listOrderFiles, updateOrderFile, uploadOrderFile } from '@/lib/orderFiles';
import { useDateFormatters } from '@/lib/useDateFormatters';
import {
  MAX_ORDER_FILE_BYTES,
  MAX_ORDER_FILE_NOTE,
  OTHER_FILE_KINDS,
  ORDER_FILE_KIND_LABEL,
  formatFileSize,
  type OrderFile,
  type OrderFileKind,
} from '@/types/orderFile';

/**
 * "Other files" on an order's Documents tab: any number of files of any type,
 * each with what kind of thing it is and an optional note.
 *
 * Several files can be dropped at once; they share the kind and note chosen
 * above the drop zone, which can be changed per file afterwards.
 */

const INPUT =
  'border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-400';

type Upload = { key: string; name: string; percent: number; error: string };

export default function OrderFiles({ orderId, readOnly = false, onChange }: {
  orderId: string;
  readOnly?: boolean;
  /** A file was added, re-labelled or removed — the page re-checks for a signed SA. */
  onChange?: () => void;
}) {
  const { user, can } = useAuth();
  const { formatDateTime } = useDateFormatters();
  const [files, setFiles] = useState<OrderFile[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [kind, setKind] = useState<OrderFileKind>('other');
  const [note, setNote] = useState('');
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listOrderFiles(orderId)
      .then(setFiles)
      .catch((e) => setLoadError(e instanceof Error ? e.message : 'Could not load the files'));
  }, [orderId]);

  async function send(list: FileList | File[]) {
    const chosen = Array.from(list);
    const batch = chosen.map((f, i) => ({ key: `${Date.now()}-${i}`, name: f.name, percent: 0, error: '' }));
    setUploads((u) => [...u, ...batch]);
    // One at a time: a phone on a yard connection does better with one upload
    // finishing than with five all crawling.
    for (let i = 0; i < chosen.length; i++) {
      const key = batch[i].key;
      const set = (patch: Partial<Upload>) => setUploads((u) => u.map((x) => (x.key === key ? { ...x, ...patch } : x)));
      try {
        const saved = await uploadOrderFile(orderId, chosen[i], { kind, note: note.trim() },
          (percent) => set({ percent }));
        setFiles((f) => [...(f ?? []), saved]);
        setUploads((u) => u.filter((x) => x.key !== key));
        onChange?.();
      } catch (e) {
        set({ error: e instanceof Error ? e.message : 'Upload failed' });
      }
    }
    setNote('');
  }

  async function changeKind(file: OrderFile, next: OrderFileKind) {
    setBusy(file.id);
    try {
      const saved = await updateOrderFile(orderId, file.id, { kind: next });
      setFiles((f) => f?.map((x) => (x.id === file.id ? saved : x)) ?? f);
      onChange?.();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Could not change it');
    } finally {
      setBusy('');
    }
  }

  async function remove(file: OrderFile) {
    if (!confirm(`Remove ${file.name} from this load? It cannot be brought back.`)) return;
    setBusy(file.id);
    try {
      await deleteOrderFile(orderId, file.id);
      setFiles((f) => f?.filter((x) => x.id !== file.id) ?? f);
      onChange?.();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Could not remove it');
    } finally {
      setBusy('');
    }
  }

  // A signed SA has its own slot (SignedSaUploads), not a line among receipts.
  const others = files?.filter((f) => f.kind !== 'signed_sa' && f.kind !== 'signed_ca') ?? null;
  const mayRemove = (f: OrderFile) => !readOnly && (f.uploadedByUid === user?.uid || can('orders.viewAll'));

  return (
    <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide flex items-center gap-2">
          <Paperclip className="w-4 h-4" /> Other files
        </h2>
        <p className="text-xs text-gray-500 mt-1">
          Anything else this load needs to keep: receipts, scale tickets, customs papers, permits, emails.
          Any file type, up to {formatFileSize(MAX_ORDER_FILE_BYTES)} each. Only people who can see this load can open them.
        </p>
      </div>

      {!readOnly && (
        <div className="space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-[220px_1fr] gap-2">
            <select value={kind} onChange={(e) => setKind(e.target.value as OrderFileKind)} className={INPUT} aria-label="What kind of file">
              {OTHER_FILE_KINDS.map((k) => <option key={k} value={k}>{ORDER_FILE_KIND_LABEL[k]}</option>)}
            </select>
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={MAX_ORDER_FILE_NOTE}
              placeholder="Note (optional) — e.g. lumper at delivery, paid by driver" className={INPUT} />
          </div>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files.length) void send(e.dataTransfer.files); }}
            onClick={() => inputRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-4 py-6 text-center transition ${
              dragging ? 'border-brand-400 bg-brand-50' : 'border-gray-300 hover:border-brand-300 hover:bg-gray-50'
            }`}
          >
            <Upload className="w-5 h-5 text-gray-400" />
            <p className="text-sm text-gray-700"><span className="font-medium text-brand-600">Choose files</span> or drop them here</p>
          </div>
          <input ref={inputRef} type="file" multiple className="hidden"
            onChange={(e) => { if (e.target.files?.length) void send(e.target.files); e.target.value = ''; }} />
        </div>
      )}

      {uploads.map((u) => (
        <div key={u.key} className="text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-gray-700">{u.name}</span>
            {u.error
              ? <button type="button" className="text-gray-500 hover:text-gray-800" onClick={() => setUploads((x) => x.filter((y) => y.key !== u.key))}>Dismiss</button>
              : <span className="text-gray-500">{u.percent}%</span>}
          </div>
          {u.error
            ? <p className="text-red-600 mt-0.5">{u.error}</p>
            : <div className="mt-1 h-1.5 rounded-full bg-gray-200"><div className="h-1.5 rounded-full bg-brand-500 transition-all" style={{ width: `${u.percent}%` }} /></div>}
        </div>
      ))}

      {loadError && <p className="text-sm text-red-700">{loadError}</p>}
      {files === null && !loadError && <p className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" />Loading…</p>}
      {others?.length === 0 && <p className="text-sm text-gray-500">No other files on this load yet.</p>}

      {others && others.length > 0 && (
        <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
          {others.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
              <FileText className="w-5 h-5 shrink-0 text-gray-400" />
              <div className="min-w-0 flex-1">
                <a href={f.url} target="_blank" rel="noreferrer" className="block truncate text-sm font-medium text-brand-700 hover:underline">
                  {f.name}
                </a>
                <p className="text-[11px] text-gray-500 truncate">
                  {formatFileSize(f.size)} · {f.uploadedByName} · {formatDateTime(new Date(f.createdAt))}
                  {f.note && <> · {f.note}</>}
                </p>
              </div>
              {readOnly ? (
                <span className="text-xs text-gray-600">{ORDER_FILE_KIND_LABEL[f.kind]}</span>
              ) : (
                <select value={f.kind} disabled={busy === f.id} onChange={(e) => void changeKind(f, e.target.value as OrderFileKind)}
                  className={`${INPUT} text-xs py-1`} aria-label="What kind of file">
                  {OTHER_FILE_KINDS.map((k) => <option key={k} value={k}>{ORDER_FILE_KIND_LABEL[k]}</option>)}
                </select>
              )}
              {mayRemove(f) && (
                <button type="button" onClick={() => void remove(f)} disabled={busy === f.id} title="Remove" aria-label={`Remove ${f.name}`}
                  className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
