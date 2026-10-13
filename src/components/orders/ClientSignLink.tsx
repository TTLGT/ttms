'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Check, Copy, Eye } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { copyToClipboard } from '@/lib/clipboard';
import { useDateFormatters } from '@/lib/useDateFormatters';

type LinkState = 'live' | 'held' | 'signed' | 'expired';
type SignLink = {
  url: string;
  state: LinkState;
  version: number;
  sentTo: string;
  sentAt: string | null;
  expiresAt: string | null;
};

/**
 * A signing link on the order, to copy and send another way when the email
 * is not enough, and where it stands — the client's Shipper Agreement, or with
 * `party="carrier"` the carrier's Carrier Agreement. See
 * GET /api/orders/{id}/sign-link and src/lib/clientAgreements.ts.
 *
 * Still shown once signed: the same link is where the signer downloads their
 * signed copy, so it is the thing to send somebody who has lost the email.
 *
 * Preview opens the staff preview page, which has no way to sign — never the
 * link itself, so nobody signs for the client by accident. The client's only:
 * the carrier's versions are previewed from the versions list beside it.
 *
 * `refreshKey` changes when the order page sends an SA, so the box picks up
 * the new state without a reload.
 *
 * `onSent` tells the page the SA already went out, so after a reload it
 * offers Resend rather than a first send. Only for a live or expired link: a
 * held one waits on dispatch's review, and sending it is the review's job.
 */
export default function ClientSignLink({ orderId, party = 'client', refreshKey, onSent }: {
  orderId: string;
  party?: 'client' | 'carrier';
  refreshKey?: unknown;
  onSent?: (sentTo: string) => void;
}) {
  const carrier = party === 'carrier';
  const who = carrier ? 'carrier' : 'client';
  const { formatDate } = useDateFormatters();
  const [link, setLink] = useState<SignLink | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [copy, setCopy] = useState<'idle' | 'copied' | 'manual'>('idle');
  const box = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const user = auth.currentUser;
      if (!user) return;
      const res = await fetch(`/api/orders/${orderId}/sign-link${carrier ? '?party=carrier' : ''}`, {
        headers: { Authorization: `Bearer ${await user.getIdToken()}` },
      });
      const body = await res.json().catch(() => ({}));
      if (cancelled || !res.ok) return;
      const next = (body as { link: SignLink | null }).link;
      setLink(next);
      if (next && (next.state === 'live' || next.state === 'expired')) onSent?.(next.sentTo || `the ${who}`);
    })().catch(() => {}).finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
    // onSent is left out on purpose: the page passes a new arrow each render,
    // and refetching on every render would read the link in a loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, party, refreshKey]);

  const preview = (
    <Link
      href={`/dashboard/orders/${orderId}/agreement`}
      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
    >
      <Eye className="h-3.5 w-3.5" /> Preview
    </Link>
  );

  if (!loaded) return null;

  // Nothing sent yet: the preview is still worth having — it is what dispatch
  // is about to send.
  if (!link) {
    if (carrier) return null;
    return (
      <div className="mt-3 flex items-center justify-between gap-3 text-xs text-gray-500">
        <span>See what the client will get before it is sent.</span>
        {preview}
      </div>
    );
  }

  async function copyLink() {
    if (!link) return;
    if (await copyToClipboard(link.url)) {
      setCopy('copied');
      window.setTimeout(() => setCopy('idle'), 2000);
    } else {
      // No clipboard on a plain-http desk: the link is selected for Ctrl+C.
      setCopy('manual');
      box.current?.focus();
      box.current?.select();
    }
  }

  const held = link.state === 'held';
  const tone = held ? 'border-amber-200 bg-amber-50' : 'border-gray-200 bg-gray-50';

  return (
    <div className={`mt-3 rounded-lg border p-3 ${tone}`}>
      <p className="text-xs font-semibold text-gray-700">
        Signing link{link.version > 1 && <span className="font-normal text-gray-500"> · version {link.version}</span>}
      </p>
      <p className={`mt-0.5 text-xs ${held ? 'text-amber-800' : 'text-gray-500'}`}>
        {held && (
          <>
            <strong>On hold.</strong> The order changed after this was sent, so the client sees &ldquo;being
            updated&rdquo; and cannot sign. Once dispatch reviews the change and sends it, this same link shows the
            update.
          </>
        )}
        {link.state === 'live' && (
          <>
            Send it to the {who} another way if they did not get the email.
            {link.sentTo && <> Last emailed to <strong>{link.sentTo}</strong>.</>}
            {link.expiresAt && <> Works until {formatDate(link.expiresAt)}.</>}
          </>
        )}
        {link.state === 'expired' && (
          <>
            Expired{link.expiresAt && <> on {formatDate(link.expiresAt)}</>}.{' '}
            {carrier
              ? <>Resending the Carrier Agreement (CA/RateCon) makes a new link, and this one stops working.</>
              : <>Sending the Shipper Agreement (SA) again renews this same link for another seven days.</>}
          </>
        )}
        {link.state === 'signed' && <>Signed by the {who}. The link now offers them their signed copy to download.</>}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          ref={box}
          readOnly
          value={link.url}
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 rounded border border-gray-300 bg-white px-2 py-1.5 font-mono text-xs text-gray-700"
        />
        <button
          type="button"
          onClick={() => void copyLink()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
        >
          {copy === 'copied'
            ? <><Check className="h-3.5 w-3.5 text-green-600" /> Copied</>
            : <><Copy className="h-3.5 w-3.5" /> Copy</>}
        </button>
        {!carrier && preview}
      </div>
      {copy === 'manual' && <p className="mt-1 text-xs text-amber-700">Copying is blocked here. The link is selected — press Ctrl+C.</p>}
    </div>
  );
}
