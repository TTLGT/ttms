'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, FileText, Loader2, Mail, Trash2, Upload } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { deleteOrderFile, listOrderFiles, uploadOrderFile } from '@/lib/orderFiles';
import { sendSignedSaConfirmation } from '@/lib/orderPaperwork';
import { useDateFormatters } from '@/lib/useDateFormatters';
import type { DateLike } from '@/lib/dateFormat';
import { SIGNED_SA_ACCEPT, formatFileSize, type OrderFile } from '@/types/orderFile';

/**
 * The Signed SA slot: the client's agreement signed some other way than the
 * e-signature link — on paper, by email, a photo of the page — uploaded by
 * staff. Drawn in Client Confirmation and on the Documents tab, the same
 * files in both.
 *
 * Stored as order files of kind `signed_sa` (src/types/orderFile.ts): the
 * same create-only bucket path and server registration as every other file,
 * kept out of "Other files" and shown only here.
 *
 * - **Upload** — PDFs and pictures, only while the client has not e-signed.
 *   Once they sign on the link, that is the signed SA and this offers no
 *   upload; any copies uploaded before stay listed.
 * - **Email the client** — that their acceptance is registered, with these
 *   files attached (admin and dispatch). Who sent it last, and when, is shown.
 * - **Mark Client Signed** — the page's own advance, offered here because this
 *   is where the copy that allows it was just uploaded.
 */
export default function SignedSaUploads({
  orderId, eSigned, confirmation, canMarkSigned, onMarkSigned, onChange,
}: {
  orderId: string;
  /** The client signed on the link. */
  eSigned: boolean;
  confirmation: { at: DateLike; to: string; byName: string } | null;
  /** The load is waiting at Booked and could be moved to Client Signed by hand. */
  canMarkSigned: boolean;
  onMarkSigned?: () => void;
  /** Something was uploaded, removed or emailed — the page refreshes what depends on it. */
  onChange?: () => void;
}) {
  const { user, can } = useAuth();
  const { formatDateTime } = useDateFormatters();
  const [files, setFiles] = useState<OrderFile[] | null>(null);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const [busy, setBusy] = useState('');
  const [sent, setSent] = useState<{ at: Date; to: string; byName: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listOrderFiles(orderId)
      .then((all) => setFiles(all.filter((f) => f.kind === 'signed_sa')))
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load the signed SA'));
  }, [orderId]);

  async function upload(list: FileList) {
    setError('');
    for (const file of Array.from(list)) {
      if (file.type !== 'application/pdf' && !file.type.startsWith('image/')) {
        setError(`${file.name} is not a PDF or a picture.`);
        continue;
      }
      try {
        setProgress(0);
        const saved = await uploadOrderFile(orderId, file, { kind: 'signed_sa', note: '' }, setProgress);
        setFiles((f) => [...(f ?? []), saved]);
        onChange?.();
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
      onChange?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove it');
    } finally {
      setBusy('');
    }
  }

  async function email() {
    if (!confirm('Email the client that we have registered their acceptance of the load confirmation, with the signed SA attached?')) return;
    setBusy('email');
    setError('');
    try {
      const r = await sendSignedSaConfirmation(orderId);
      setSent({ at: new Date(r.at), to: r.sentTo, byName: user?.displayName || 'you' });
      onChange?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the confirmation');
    } finally {
      setBusy('');
    }
  }

  const mayRemove = (f: OrderFile) => !eSigned && (f.uploadedByUid === user?.uid || can('orders.viewAll'));
  const last = sent ?? confirmation;
  const hasFiles = Boolean(files && files.length > 0);

  // E-signed with nothing uploaded: the signed PDF is offered elsewhere and
  // there is nothing for this slot to say.
  if (eSigned && !hasFiles) return null;

  return (
    <div className="space-y-2">
      {hasFiles && (
        <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
          {files!.map((f) => (
            <li key={f.id} className="flex items-center gap-3 px-3 py-2">
              <FileText className="w-4 h-4 shrink-0 text-gray-400" />
              <div className="min-w-0 flex-1">
                <a href={f.url} target="_blank" rel="noreferrer" className="block truncate text-sm font-medium text-brand-700 hover:underline">{f.name}</a>
                <p className="text-[11px] text-gray-500 truncate">
                  Signed SA · {formatFileSize(f.size)} · uploaded by {f.uploadedByName} · {formatDateTime(new Date(f.createdAt))}
                </p>
              </div>
              {mayRemove(f) && (
                <button type="button" onClick={() => void remove(f)} disabled={busy === f.id} aria-label={`Remove ${f.name}`}
                  className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {!eSigned && (
        <>
          <button type="button" onClick={() => inputRef.current?.click()} disabled={progress !== null}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-dashed border-gray-400 text-gray-700 text-xs font-semibold rounded-lg hover:bg-gray-50 disabled:opacity-50">
            {progress !== null ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            {progress !== null ? `Uploading… ${progress}%` : hasFiles ? 'Upload another page' : 'Upload signed SA (PDF or picture)'}
          </button>
          <input ref={inputRef} type="file" accept={SIGNED_SA_ACCEPT} multiple className="hidden"
            onChange={(e) => { if (e.target.files?.length) void upload(e.target.files); e.target.value = ''; }} />
          {!hasFiles && files !== null && (
            <p className="text-[11px] text-gray-500">
              For a client who cannot sign on the link: upload what they signed — a scan, a PDF, or a photo of the page.
            </p>
          )}
        </>
      )}

      {hasFiles && !eSigned && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {canMarkSigned && onMarkSigned && (
            <button type="button" onClick={onMarkSigned}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 text-white text-xs font-semibold rounded-lg hover:bg-brand-700">
              <CheckCircle2 className="w-3.5 h-3.5" /> Mark Client Signed
            </button>
          )}
          {can('orders.sendAgreement') && (
            <button type="button" onClick={() => void email()} disabled={busy !== ''}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 text-gray-700 text-xs font-semibold rounded-lg hover:bg-gray-50 disabled:opacity-50">
              {busy === 'email' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
              {last ? 'Email the confirmation again' : 'Email the client their confirmation'}
            </button>
          )}
        </div>
      )}

      {last && (
        <p className="text-xs text-blue-800">
          Acceptance confirmation emailed to <strong>{last.to}</strong> by {last.byName} · {formatDateTime(last.at)}
        </p>
      )}
      {hasFiles && !eSigned && !last && !can('orders.sendAgreement') && (
        <p className="text-[11px] text-gray-500">Admin or dispatch can email the client a confirmation with this attached.</p>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
