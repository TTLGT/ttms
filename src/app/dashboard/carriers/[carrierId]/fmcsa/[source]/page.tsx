'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { fetchFmcsaPage } from '@/lib/fmcsaClient';
import type { FmcsaPage } from '@/lib/fmcsaClient';
import { FMCSA_PAGE_LABEL, isFmcsaPageSource } from '@/types/fmcsaPage';
import { useDateFormatters } from '@/lib/useDateFormatters';

/**
 * An FMCSA page about one carrier, as TTMS's US server sees it — so the
 * Guatemala office can read SaferWeb, SMS and L&I without a VPN. See
 * lib/fmcsaPages for why, and for why the frame is sandboxed the way it is.
 *
 * The sandbox has no `allow-scripts` and no `allow-same-origin`: the page is
 * somebody else's HTML, and that pair is what keeps it from running or
 * reaching the TTMS session. Do not add either. `allow-popups` lets its links
 * open FMCSA in a new tab, which works for anybody on the VPN.
 */
export default function FmcsaPageViewer() {
  const { formatDateTime } = useDateFormatters();
  const params    = useParams();
  const carrierId = params.carrierId as string;
  const source    = params.source as string;

  const [page, setPage]       = useState<FmcsaPage | null>(null);
  const [error, setError]     = useState('');
  const [directUrl, setDirectUrl] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!isFmcsaPageSource(source)) {
      setError('There is no such FMCSA page.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const p = await fetchFmcsaPage(carrierId, source);
      setPage(p);
      setDirectUrl(p.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the FMCSA page.');
      const url = (e as { url?: string }).url;
      if (url) setDirectUrl(url);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carrierId, source]);

  const label = isFmcsaPageSource(source) ? FMCSA_PAGE_LABEL[source] : 'FMCSA';

  return (
    <div className="flex flex-col gap-3 h-[calc(100vh-6rem)]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-0.5">
          <Link href={`/dashboard/carriers/${encodeURIComponent(carrierId)}`}
            className="text-xs text-brand-600 hover:underline">
            Back to carrier
          </Link>
          <h1 className="text-lg font-semibold text-gray-900">
            {label}{page?.companyName && <span className="text-gray-500 font-normal"> · {page.companyName}</span>}
          </h1>
          <p className="text-xs text-gray-500">
            {page
              ? <>Fetched by TTMS from FMCSA at {formatDateTime(page.fetchedAt)}, so no VPN is needed to read it.
                  Links and buttons inside lead to FMCSA itself, which needs the US VPN.</>
              : 'Fetched by TTMS from FMCSA, so no VPN is needed to read it.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {directUrl && (
            <a href={directUrl} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline">
              Open on FMCSA (US VPN) <ExternalLink className="w-3 h-3" />
            </a>
          )}
          <button type="button" onClick={load} disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 bg-white text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50 transition">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Loading…' : 'Reload'}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {page && (
        // White whatever the theme: FMCSA's pages assume a white ground, and
        // dark mode cannot reach inside the frame to fix their text colours.
        <iframe
          title={`${label} for ${page.companyName || 'this carrier'}`}
          srcDoc={page.html}
          sandbox="allow-popups allow-popups-to-escape-sandbox"
          referrerPolicy="no-referrer"
          className="flex-1 w-full rounded-lg border border-gray-200"
          style={{ background: '#fff' }}
        />
      )}
    </div>
  );
}
