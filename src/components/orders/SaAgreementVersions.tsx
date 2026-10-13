'use client';

import { useCallback, useState } from 'react';
import { ChevronDown, ChevronRight, Download, Eye, Loader2 } from 'lucide-react';
import { useDateFormatters } from '@/lib/useDateFormatters';
import {
  downloadAgreementPdf, listAgreementVersions, previewAgreementPdf, type AgreementVersion,
} from '@/lib/orderPaperwork';
import AgreementPdfPreview from './AgreementPdfPreview';
import { AGREEMENT_BUTTON } from '@/types/saRequest';

/**
 * The client's Shipper Agreement as files, in Client Confirmation: the signed
 * one as a PDF, and every version the load has had — each sent, signed or
 * replaced — downloadable as it was. See src/lib/signedAgreements.ts.
 *
 * The list is read only when opened. Each version can be previewed on screen
 * or downloaded; both draw the same stored copy.
 */
export default function SaAgreementVersions({ orderId, signed, refreshKey, party = 'client' }: {
  orderId: string;
  /** The carrier's agreement, on the Carrier section. */
  party?: 'client' | 'carrier';
  /** The order carries the client's signature — offer the signed PDF straight away. */
  signed: boolean;
  refreshKey?: unknown;
}) {
  const { formatDateTime } = useDateFormatters();
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState<AgreementVersion[] | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [loadedFor, setLoadedFor] = useState<unknown>(null);
  const [preview, setPreview] = useState<{ url: string; name: string; title: string } | null>(null);
  const doc = party === 'carrier' ? 'Dispatch Sheet (Rate Con)' : 'Shipper Agreement (SA)';

  const closePreview = useCallback(() => {
    setPreview((p) => { if (p) URL.revokeObjectURL(p.url); return null; });
  }, []);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && (versions === null || loadedFor !== refreshKey)) {
      setVersions(null);
      setLoadedFor(refreshKey);
      listAgreementVersions(orderId, party).then(setVersions).catch((e) => setError(e instanceof Error ? e.message : 'Could not load the versions'));
    }
  }

  async function download(key: string, ref?: string) {
    setBusy(key);
    setError('');
    try {
      await downloadAgreementPdf(orderId, ref, party);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not build the PDF');
    } finally {
      setBusy('');
    }
  }

  async function show(key: string, title: string, ref?: string) {
    setBusy(`view-${key}`);
    setError('');
    try {
      const { url, name } = await previewAgreementPdf(orderId, ref, party);
      setPreview({ url, name, title });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not build the PDF');
    } finally {
      setBusy('');
    }
  }

  // Saves the file already on screen rather than rendering it a second time.
  function saveShown() {
    if (!preview) return;
    const a = document.createElement('a');
    a.href = preview.url;
    a.download = preview.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  const previewButton = (key: string, title: string, ref?: string) => (
    <button type="button" onClick={() => void show(key, title, ref)} disabled={busy !== ''}
      className="inline-flex items-center gap-1 px-2.5 py-1 border border-gray-300 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50">
      {busy === `view-${key}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
      Preview
    </button>
  );

  return (
    <div className="mt-3 space-y-2">
      {signed && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void download('signed')} disabled={busy !== ''}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-xs font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50 transition">
            {busy === 'signed' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            Download signed {AGREEMENT_BUTTON[party]}
          </button>
          {previewButton('signed', `Signed ${doc}`)}
        </div>
      )}

      <div>
        <button type="button" onClick={toggle}
          className="flex items-center gap-1 text-xs font-semibold text-gray-600 hover:text-gray-900">
          {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          {AGREEMENT_BUTTON[party]} versions
        </button>
        {open && (
          versions === null && !error ? (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-gray-500"><Loader2 className="w-3.5 h-3.5 animate-spin" />Loading…</p>
          ) : versions && versions.length === 0 ? (
            <p className="mt-1 text-xs text-gray-500">No {doc} has been sent on this load yet.</p>
          ) : versions ? (
            <ul className="mt-1 divide-y divide-gray-100 rounded-lg border border-gray-200">
              {versions.map((v) => (
                <li key={v.ref} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <div className="text-xs">
                    <p className="font-semibold text-gray-900">
                      Version {v.version}
                      {v.current && !v.revoked && <span className="ml-1.5 font-normal text-brand-700">· the latest sent</span>}
                      {/* The same test the PDF's VOID stamp uses, as far as the list can see it. */}
                      {(v.revoked || v.supersededAt) && (
                        <span className="ml-1.5 rounded bg-red-50 px-1.5 py-px text-[10px] font-bold tracking-wide text-red-700">VOID</span>
                      )}
                    </p>
                    <p className="text-gray-500">
                      {v.sentAt ? <>Sent {formatDateTime(new Date(v.sentAt))}</> : 'Sent'}{v.sentTo && <> to {v.sentTo}</>}
                    </p>
                    {v.signed ? (
                      <p className="text-green-700">
                        Signed by {v.signed.name}{v.signed.title && ` (${v.signed.title})`} · {formatDateTime(new Date(v.signed.at))}
                      </p>
                    ) : (
                      <p className="text-gray-500">Not signed</p>
                    )}
                    {v.supersededAt && <p className="text-gray-400">Replaced {formatDateTime(new Date(v.supersededAt))}</p>}
                    {v.revoked && <p className="text-amber-700">Link cancelled — the load moved to another {party === 'carrier' ? 'carrier' : 'client'}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    {previewButton(v.ref, `${doc} version ${v.version}`, v.ref)}
                    <button type="button" onClick={() => void download(v.ref, v.ref)} disabled={busy !== ''}
                      className="inline-flex items-center gap-1 px-2.5 py-1 border border-gray-300 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50">
                      {busy === v.ref ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                      PDF
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : null
        )}
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
      {preview && (
        <AgreementPdfPreview url={preview.url} title={preview.title} onClose={closePreview} onDownload={saveShown} />
      )}
    </div>
  );
}
