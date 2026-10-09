'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Download, Loader2 } from 'lucide-react';
import { useDateFormatters } from '@/lib/useDateFormatters';
import { downloadAgreementPdf, listAgreementVersions, type AgreementVersion } from '@/lib/orderPaperwork';

/**
 * The client's Shipper Agreement as files, in Client Confirmation: the signed
 * one as a PDF, and every version the load has had — each sent, signed or
 * replaced — downloadable as it was. See src/lib/signedAgreements.ts.
 *
 * The list is read only when opened.
 */
export default function SaAgreementVersions({ orderId, signed, refreshKey }: {
  orderId: string;
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

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && (versions === null || loadedFor !== refreshKey)) {
      setVersions(null);
      setLoadedFor(refreshKey);
      listAgreementVersions(orderId).then(setVersions).catch((e) => setError(e instanceof Error ? e.message : 'Could not load the SA versions'));
    }
  }

  async function download(key: string, ref?: string) {
    setBusy(key);
    setError('');
    try {
      await downloadAgreementPdf(orderId, ref);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not build the SA');
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="mt-3 space-y-2">
      {signed && (
        <button type="button" onClick={() => void download('signed')} disabled={busy !== ''}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-xs font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50 transition">
          {busy === 'signed' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
          Download signed SA
        </button>
      )}

      <div>
        <button type="button" onClick={toggle}
          className="flex items-center gap-1 text-xs font-semibold text-gray-600 hover:text-gray-900">
          {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          SA versions
        </button>
        {open && (
          versions === null && !error ? (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-gray-500"><Loader2 className="w-3.5 h-3.5 animate-spin" />Loading…</p>
          ) : versions && versions.length === 0 ? (
            <p className="mt-1 text-xs text-gray-500">No SA has been sent on this load yet.</p>
          ) : versions ? (
            <ul className="mt-1 divide-y divide-gray-100 rounded-lg border border-gray-200">
              {versions.map((v) => (
                <li key={v.ref} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <div className="text-xs">
                    <p className="font-semibold text-gray-900">
                      Version {v.version}
                      {v.current && !v.revoked && <span className="ml-1.5 font-normal text-brand-700">· on the client&apos;s link now</span>}
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
                    {v.revoked && <p className="text-amber-700">Link cancelled — the load moved to another client</p>}
                  </div>
                  <button type="button" onClick={() => void download(v.ref, v.ref)} disabled={busy !== ''}
                    className="inline-flex items-center gap-1 px-2.5 py-1 border border-gray-300 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50">
                    {busy === v.ref ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                    PDF
                  </button>
                </li>
              ))}
            </ul>
          ) : null
        )}
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
    </div>
  );
}
