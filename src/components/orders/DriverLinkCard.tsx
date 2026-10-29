'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Copy, MapPin, Send, Truck } from 'lucide-react';
import { copyToClipboard } from '@/lib/clipboard';
import { getDriverLink, revokeDriverLink, sendDriverLink } from '@/lib/driverLinks';
import { useDateFormatters } from '@/lib/useDateFormatters';
import {
  DRIVER_STEPS,
  DRIVER_STEP_LABEL,
  mapsUrl,
  type DriverLinkInfo,
  type DriverLocation,
  type DriverProgress,
} from '@/types/driverLink';

/**
 * The driver link on the order: make it, copy it or email it, switch it
 * off, and see what the driver has reported — each step with its time and
 * where it was tapped, and the last location they sent. See
 * src/types/driverLink.ts.
 *
 * The steps come from the order (`driverProgress`), so they are as fresh as
 * the page; the room gets a line the moment the driver taps one.
 */
export default function DriverLinkCard({ orderId, progress, location, onChanged }: {
  orderId: string;
  progress: DriverProgress | null | undefined;
  location: DriverLocation | null | undefined;
  onChanged?: () => void;
}) {
  const { formatDate, formatDateTime } = useDateFormatters();
  const [link, setLink] = useState<DriverLinkInfo | null>(null);
  const [cannotMake, setCannotMake] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copy, setCopy] = useState<'idle' | 'copied' | 'manual'>('idle');
  const [emailing, setEmailing] = useState(false);
  const [email, setEmail] = useState('');
  const box = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    getDriverLink(orderId)
      .then((r) => { if (!cancelled) { setLink(r.link); setCannotMake(r.cannotMake); } })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [orderId]);

  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await fn();
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work');
    } finally {
      setBusy(false);
    }
  }

  async function copyLink(url: string) {
    if (await copyToClipboard(url)) {
      setCopy('copied');
      window.setTimeout(() => setCopy('idle'), 2000);
    } else {
      setCopy('manual');
      box.current?.focus();
      box.current?.select();
    }
  }

  const steps = DRIVER_STEPS.filter((s) => progress?.[s]);
  const live = link && !link.expired ? link : null;

  return (
    <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-4">
      <div className="flex items-center gap-2">
        <Truck className="h-4 w-4 text-gray-500" />
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Driver link</p>
      </div>
      <p className="mt-1 text-xs text-gray-500">
        A page for the driver to tap Arrived, Picked up, In transit and Delivered, send pictures and their
        location, and say when they were paid. They type the driver phone on this load to open it.
        Picked up and Delivered move the status once the carrier has signed.
      </p>

      {loaded && !live && (
        cannotMake ? (
          <p className="mt-3 text-xs text-amber-800">{cannotMake}</p>
        ) : (
          <button type="button" disabled={busy}
            onClick={() => void act(async () => setLink(await sendDriverLink(orderId, { create: true })))}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
            <Truck className="h-3.5 w-3.5" /> {link?.expired ? 'Make a new driver link' : 'Make driver link'}
          </button>
        )
      )}

      {live && (
        <div className="mt-3">
          <div className="flex flex-wrap items-center gap-2">
            <input ref={box} readOnly value={live.url} onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 rounded border border-gray-300 bg-white px-2 py-1.5 font-mono text-xs text-gray-700" />
            <button type="button" onClick={() => void copyLink(live.url)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50">
              {copy === 'copied' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copy === 'copied' ? 'Copied' : 'Copy'}
            </button>
            <button type="button" onClick={() => setEmailing((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50">
              <Send className="h-3.5 w-3.5" /> Email
            </button>
          </div>
          {copy === 'manual' && <p className="mt-1 text-xs text-gray-500">Press Ctrl+C to copy the selected link.</p>}
          {emailing && (
            <form className="mt-2 flex flex-wrap gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void act(async () => {
                  setLink(await sendDriverLink(orderId, { email }));
                  setEmailing(false);
                  setEmail('');
                });
              }}>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="driver@example.com"
                className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs" />
              <button type="submit" disabled={busy}
                className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
                {busy ? 'Sending…' : 'Send'}
              </button>
            </form>
          )}
          <p className="mt-2 text-xs text-gray-500">
            For <strong>{live.driverName}</strong>. Works until {formatDate(new Date(live.expiresAt))}.
            {live.lastSentTo && <> Last emailed to <strong>{live.lastSentTo}</strong>.</>}
            {' '}{live.opened ? 'The driver has opened it.' : 'Not opened yet.'}
          </p>
          <div className="mt-2 flex flex-wrap gap-3 text-xs">
            <button type="button" disabled={busy}
              onClick={() => {
                if (confirm('Make a new link? The one already sent stops working.')) {
                  void act(async () => setLink(await sendDriverLink(orderId, { create: true })));
                }
              }}
              className="text-brand-600 hover:underline disabled:opacity-50">
              New link (for a new driver)
            </button>
            <button type="button" disabled={busy}
              onClick={() => {
                if (confirm('Switch this driver link off? The driver will no longer be able to use it.')) {
                  void act(async () => { await revokeDriverLink(orderId); setLink(null); });
                }
              }}
              className="text-red-600 hover:underline disabled:opacity-50">
              Switch off
            </button>
          </div>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      {(steps.length > 0 || location) && (
        <div className="mt-4 border-t border-gray-200 pt-3">
          <p className="mb-2 text-xs font-semibold text-gray-700">What the driver reported</p>
          <ol className="space-y-1">
            {steps.map((s) => {
              const m = progress![s]!;
              return (
                <li key={s} className="flex flex-wrap items-baseline gap-x-2 text-sm text-gray-800">
                  <Check className="h-3.5 w-3.5 self-center text-green-600" />
                  <span className="font-medium">{DRIVER_STEP_LABEL[s]}</span>
                  <span className="text-xs text-gray-500">{formatDateTime(new Date(m.at))}</span>
                  {m.point && (
                    <a href={mapsUrl(m.point)} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-brand-600 hover:underline">Map</a>
                  )}
                </li>
              );
            })}
          </ol>
          {location && (
            <a href={mapsUrl(location)} target="_blank" rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:underline">
              <MapPin className="h-4 w-4" /> Last location, {formatDateTime(new Date(location.at))}
              {location.accuracy ? <span className="text-xs font-normal text-gray-500">(within {location.accuracy} m)</span> : null}
            </a>
          )}
        </div>
      )}
    </div>
  );
}
