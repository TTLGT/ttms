'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Download, Eye, Loader2 } from 'lucide-react';
import { useDateFormatters } from '@/lib/useDateFormatters';
import { bolVersionUrl, listBolVersions } from '@/lib/bolRequestsClient';
import AgreementPdfPreview from './AgreementPdfPreview';
import type { BolVersion } from '@/types/bolRequest';

/**
 * The BOLs this load had before the current one, inside the Bill of Lading
 * card — each as it was, with who drew it, who replaced it and who it was
 * emailed to meanwhile. See BolVersion in src/types/bolRequest.ts.
 *
 * Read only when opened. `refreshKey` changes whenever the BOL is generated
 * on the page, so reopening after a regenerate shows the one just replaced.
 */
export default function BolVersions({ orderId, refreshKey }: { orderId: string; refreshKey: unknown }) {
  const { formatDateTime } = useDateFormatters();
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState<BolVersion[] | null>(null);
  const [loadedFor, setLoadedFor] = useState<unknown>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<{ url: string; title: string } | null>(null);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && (versions === null || loadedFor !== refreshKey)) {
      setVersions(null);
      setError('');
      setLoadedFor(refreshKey);
      listBolVersions(orderId).then(setVersions).catch((e) => setError(e instanceof Error ? e.message : 'Could not load the versions'));
    }
  }

  // A fresh link each time rather than one per row up front: they last two
  // hours, and most of this list is never opened.
  async function openVersion(key: string, v: BolVersion, n: number) {
    setBusy(key);
    setError('');
    try {
      const url = await bolVersionUrl(orderId, v.id);
      if (key.startsWith('view-')) setPreview({ url, title: `Bill of Lading, version ${n}` });
      else window.open(url, '_blank', 'noreferrer');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open that BOL');
    } finally {
      setBusy('');
    }
  }

  const button = 'inline-flex items-center gap-1 px-2.5 py-1 border border-gray-300 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50';

  return (
    <div className="mt-3">
      <button type="button" onClick={toggle}
        className="flex items-center gap-1 text-xs font-semibold text-gray-600 hover:text-gray-900">
        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        Earlier BOLs
      </button>
      {open && (
        versions === null && !error ? (
          <p className="mt-1 flex items-center gap-1.5 text-xs text-gray-500"><Loader2 className="w-3.5 h-3.5 animate-spin" />Loading…</p>
        ) : versions && versions.length === 0 ? (
          <p className="mt-1 text-xs text-gray-500">This is the only BOL this load has had. Earlier ones are kept from now on when it is generated again.</p>
        ) : versions ? (
          <ul className="mt-1 divide-y divide-gray-100 rounded-lg border border-gray-200">
            {versions.map((v, i) => {
              // Numbered oldest first, so version 1 stays version 1 as more arrive.
              const n = versions.length - i;
              return (
                <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <div className="text-xs">
                    <p className="font-semibold text-gray-900">Version {n}</p>
                    <p className="text-gray-500">
                      {v.generatedAt ? <>Generated {formatDateTime(new Date(v.generatedAt))}</> : 'Generated'}
                      {v.generatedByName && <> by {v.generatedByName}</>}
                    </p>
                    {v.sends.length > 0 ? v.sends.map((s, j) => (
                      <p key={j} className="text-green-700">
                        Emailed {formatDateTime(new Date(s.at))} by {s.byName} to {s.to.map((t) => `${t.label.toLowerCase()} ${t.email}`).join(', ')}
                      </p>
                    )) : (
                      <p className="text-gray-500">Not emailed from TTMS</p>
                    )}
                    <p className="text-gray-400">Replaced {formatDateTime(new Date(v.replacedAt))} by {v.replacedByName}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => void openVersion(`view-${v.id}`, v, n)} disabled={busy !== ''} className={button}>
                      {busy === `view-${v.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
                      Preview
                    </button>
                    <button type="button" onClick={() => void openVersion(v.id, v, n)} disabled={busy !== ''} className={button}>
                      {busy === v.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                      PDF
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null
      )}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      {preview && (
        <AgreementPdfPreview url={preview.url} title={preview.title}
          onClose={() => setPreview(null)}
          onDownload={() => window.open(preview.url, '_blank', 'noreferrer')} />
      )}
    </div>
  );
}
