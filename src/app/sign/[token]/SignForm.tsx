'use client';

import { useState } from 'react';
import type { ConfirmationFreight, ConfirmationPayment, ConfirmationStop } from '@/types/loadConfirmation';
import { CARRIER_TERMS } from '@/types/agreementTerms';
import { MAX_CLIENT_INSTRUCTION } from '@/types/order';
import type { DeviceHints } from '@/types/saRequest';

/**
 * What the browser will say about the device, for the signature record —
 * see DeviceHints. Never allowed to hold up or fail a signature: any error,
 * or a browser slower than a second to answer, signs with what it has.
 */
async function deviceHints(): Promise<DeviceHints> {
  const hints: DeviceHints = { touchPoints: navigator.maxTouchPoints ?? 0 };
  type UaData = {
    mobile?: boolean;
    getHighEntropyValues?: (keys: string[]) => Promise<Record<string, unknown>>;
  };
  const uaData = (navigator as Navigator & { userAgentData?: UaData }).userAgentData;
  if (!uaData?.getHighEntropyValues) return hints;
  try {
    const values = await Promise.race([
      uaData.getHighEntropyValues(['model', 'platform', 'platformVersion']),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 1000)),
    ]);
    if (typeof uaData.mobile === 'boolean') hints.mobile = uaData.mobile;
    if (values) {
      if (typeof values.model === 'string') hints.model = values.model;
      if (typeof values.platform === 'string') hints.platform = values.platform;
      if (typeof values.platformVersion === 'string') hints.platformVersion = values.platformVersion;
    }
  } catch { /* signs with the touch count alone */ }
  return hints;
}

interface Props {
  /** The link's token. Absent in `preview`, which has nothing to sign with. */
  token?: string;
  type: 'carrier_agreement' | 'shipper_agreement';
  orderNumber: string;
  partyName: string;
  driverName: string;
  commodity: string;
  weight: string;
  pieces: string;
  /** Pre-formatted by the sender; '' on agreements sent before dimensions existed. */
  dimensions: string;
  originStr: string;
  destinationStr: string;
  pickupDate: string;
  deliveryDate: string;
  rate: string;
  /** Only on links sent before 2026-10-14 — see SignFormData.notes. */
  notes: string;
  /** Our special instructions for the signer. */
  instructions: string;
  /** What the client added when signing. Not shown on the form; it is for the signed PDF. */
  signerInstructions?: string;
  /** Who loads, unloads and counts — carrier links only. See SignFormData.dockWork. */
  dockWork?: { label: string; value: string }[];
  /** Ramps, a liftgate… as labels. See SignFormData.accessorials. */
  accessorials?: string[];
  /**
   * The terms this link was sent with. For a client agreement it is the copy
   * on the token (or the old standard wording, for a link sent before the
   * terms were a setting); for a carrier it is `CARRIER_TERMS` (src/types/agreementTerms.ts).
   */
  terms?: string;
  /**
   * The client agreement's full review — every stop, the freight line by
   * line, how payment is made. Absent on carrier links and on client links
   * sent before these were copied onto the token; the page then falls back to
   * the one-line summary those links were always shown.
   */
  stops?: ConfirmationStop[];
  freight?: ConfirmationFreight[];
  equipment?: string;
  payment?: ConfirmationPayment | null;
  /** "October 15, 2026" — when the link stops working. */
  validUntil?: string;
  sentByName?: string;
  sentByEmail?: string;
  /** The load's broker — see signFormData(). '' on older links. */
  brokerName?: string;
  brokerEmail?: string;
  brokerPhone?: string;
  /**
   * The version of the agreement on screen, sent with the signature so the
   * server can refuse it if the link was revised while the page was open.
   * Absent on links from before revisions existed.
   */
  version?: number;
  /** Shown above everything on version 2 and later. */
  revisedNote?: string;
  /**
   * Staff preview, from the order page. Everything the client sees, the
   * signature section included, and no way to sign: that section is drawn
   * inside a disabled fieldset and is not a <form>, so there is nothing to
   * submit and no token to post to. A signature from staff would record their
   * device and address against the client's name.
   */
  preview?: boolean;
}

/**
 * The client's signed copy, as a PDF, from GET /api/sign/[token]/pdf. A plain
 * link: the client has no account. The token in the URL and the cookie set
 * when they confirmed their email or phone are the credential, as they are
 * for signing — so the link only works in a browser that has answered.
 */
export function SignedCopyLink({ token, label = 'Download your signed agreement (PDF)' }: { token: string; label?: string }) {
  return (
    <a href={`/api/sign/${token}/pdf`}
      className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 transition">
      {label}
    </a>
  );
}

/**
 * The signature card: a real form on the client's link, a locked look-alike in
 * a staff preview, with a line saying why nothing in it responds.
 */
function SignatureBox({ preview, onSubmit, children }: {
  preview?: boolean;
  onSubmit: (e: React.FormEvent) => void;
  children: React.ReactNode;
}) {
  const className = 'bg-white rounded-xl border border-gray-200 p-6 space-y-4';
  const heading = <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide">Sign</h2>;
  if (!preview) return <form onSubmit={onSubmit} className={className}>{heading}{children}</form>;
  return (
    <div className={className} aria-disabled="true">
      <div className="flex items-center justify-between gap-3">
        {heading}
        <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-semibold text-gray-600">
          Preview — locked
        </span>
      </div>
      {children}
      <p className="text-xs text-gray-500 text-center">
        This is what the client fills in on their own link. Staff cannot type, tick or sign anything here.
      </p>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-2.5 border-b border-gray-100 last:border-0">
      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</span>
      <span className="text-sm text-gray-900 font-medium text-right max-w-[60%]">{value}</span>
    </div>
  );
}

function Card({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide">{title}</h2>
        {aside}
      </div>
      {children}
    </div>
  );
}

/** One kind of stop, numbered when there is more than one of it. */
function StopList({ title, stops }: { title: string; stops: ConfirmationStop[] }) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{title}</p>
      {stops.length === 0 ? (
        <p className="text-sm text-gray-500">To be confirmed</p>
      ) : (
        <ol className="space-y-3">
          {stops.map((st, i) => {
            // The facility as the heading when there is one, then whatever of
            // the address is left — a stop typed in with no party leads with
            // its street instead.
            const head = st.name || st.street || st.place || 'Address to be confirmed';
            const lines = [st.street, st.place].filter((l) => l && l !== head);
            return (
              <li key={i} className="text-sm text-gray-900">
                <p className="font-semibold">
                  {stops.length > 1 && <span className="text-gray-400 mr-1">{i + 1}.</span>}
                  {head}
                </p>
                {lines.map((l) => <p key={l} className="text-gray-700">{l}</p>)}
                <p className="text-xs text-gray-500 mt-0.5">{st.dates || 'Date to be confirmed'}</p>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

export default function SignForm({
  token, type, orderNumber, partyName, driverName, commodity, weight, pieces, dimensions,
  originStr, destinationStr, pickupDate, deliveryDate, rate, notes, instructions, dockWork, accessorials,
  terms, stops, freight, equipment, payment, validUntil, sentByName, sentByEmail,
  brokerName, brokerEmail, brokerPhone,
  version, revisedNote, preview,
}: Props) {
  // The broker when the link names one; a link from before brokers were
  // named shows whoever sent it, as it always did.
  const contact = brokerName
    ? [brokerName, brokerPhone, brokerEmail].filter(Boolean).join(' · ')
    : sentByName ? (sentByEmail ? `${sentByName} · ${sentByEmail}` : sentByName) : '';
  const contactLabel = brokerName ? 'Your broker' : 'Your contact';
  const [signerName, setSignerName]   = useState('');
  const [signerTitle, setSignerTitle] = useState('');
  const [addedInstructions, setAddedInstructions] = useState('');
  const [consent, setConsent]         = useState(false);
  const [agreed, setAgreed]           = useState(false);
  const [submitting, setSubmitting]   = useState(false);
  const [error, setError]             = useState('');
  const [signed, setSigned]           = useState(false);

  // The type string is historical; the party signing this one is the client.
  const isClient   = type === 'shipper_agreement';
  const partyLabel = isClient ? 'Client' : 'Carrier';
  const rateLabel  = isClient ? 'Agreed Rate' : 'Carrier Pay';
  const termsText  = terms || CARRIER_TERMS;
  const docName    = isClient ? 'Client Load Confirmation' : 'Dispatch Sheet';

  // The full review exists only on client links sent since it was added.
  const detailed = isClient && Array.isArray(stops) && stops.length > 0;
  const pickups    = (stops ?? []).filter((s) => s.kind === 'pickup');
  const deliveries = (stops ?? []).filter((s) => s.kind === 'delivery');

  const ready = Boolean(signerName.trim()) && consent && agreed;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (preview || !token) return;
    if (!signerName.trim()) { setError('Please enter your full legal name.'); return; }
    if (!consent)           { setError('Please agree to sign electronically.'); return; }
    if (!agreed)            { setError('You must accept the terms before signing.'); return; }

    setError('');
    setSubmitting(true);
    try {
      const res = await fetch(`/api/sign/${token}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          signerName: signerName.trim(),
          signerTitle: signerTitle.trim(),
          // The client's own additions. A carrier's form has no box for it.
          ...(isClient ? { instructions: addedInstructions.trim() } : {}),
          esignConsent: consent,
          acceptTerms: agreed,
          version,
          deviceHints: await deviceHints(),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? 'Signing failed');
      }
      setSigned(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Signing failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (signed) {
    return (
      <div className="bg-white rounded-xl border border-green-200 p-6 sm:p-10 text-center">
        <p className="text-5xl mb-4">✅</p>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Signed Successfully</h2>
        <p className="text-sm text-gray-600 mb-1">
          Thank you, <strong>{signerName}</strong>. Your signature has been recorded.
        </p>
        <p className="text-sm text-gray-600">
          {isClient ? 'Load confirmation' : 'Dispatch sheet'} <strong>{orderNumber}</strong> is now complete.
        </p>
        {token && (
          <div className="mt-5">
            <SignedCopyLink token={token} />
            <p className="text-xs text-gray-500 mt-2">
              We have also emailed you a copy. You can come back to this link any time to download it again.
            </p>
          </div>
        )}
        <p className="text-xs text-gray-400 mt-4">You may close this window.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {revisedNote && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">Updated agreement{version ? ` · version ${version}` : ''}</p>
          <p className="mt-1">{revisedNote}</p>
        </div>
      )}

      {detailed ? (
        <>
          {/* Who and how much, first: the two things a client checks before reading on. */}
          <Card title="Load Confirmation" aside={<span className="font-mono text-sm font-bold text-gray-800">{orderNumber}</span>}>
            <DetailRow label={partyLabel} value={partyName || '—'} />
            {contact && <DetailRow label={contactLabel} value={contact} />}
            {validUntil && <DetailRow label="Sign by" value={validUntil} />}
            <div className="flex justify-between items-baseline pt-3 mt-1 border-t-2 border-gray-200">
              <span className="text-sm font-bold text-gray-700 uppercase tracking-wide">{rateLabel}</span>
              <span className="text-2xl font-bold text-gray-900">{rate}</span>
            </div>
          </Card>

          <Card title="Pickup and Delivery">
            <div className="grid gap-6 sm:grid-cols-2">
              <StopList title={pickups.length > 1 ? 'Pickups' : 'Pickup'} stops={pickups} />
              <StopList title={deliveries.length > 1 ? 'Deliveries' : 'Delivery'} stops={deliveries} />
            </div>
          </Card>

          <Card title="Freight">
            {equipment && <DetailRow label="Equipment" value={equipment} />}
            {accessorials && accessorials.length > 0 && <DetailRow label="Accessorials" value={accessorials.join(', ')} />}
            {freight && freight.length > 0 ? (
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
                      <th className="py-2 pr-3 font-semibold">Description</th>
                      <th className="py-2 pr-3 font-semibold">Qty</th>
                      <th className="py-2 pr-3 font-semibold">Dimensions</th>
                      <th className="py-2 font-semibold text-right">Weight</th>
                    </tr>
                  </thead>
                  <tbody>
                    {freight.map((f, i) => (
                      <tr key={i} className="border-b border-gray-100 last:border-0 text-gray-900">
                        <td className="py-2 pr-3">
                          {f.description || f.vehicle || '—'}
                          {f.vehicle && f.description ? <span className="block text-xs text-gray-500">{f.vehicle}</span> : null}
                          {f.vin ? <span className="block text-xs text-gray-500">VIN {f.vin}</span> : null}
                        </td>
                        <td className="py-2 pr-3">{f.quantity || '—'}</td>
                        <td className="py-2 pr-3">{f.dimensions || '—'}</td>
                        <td className="py-2 text-right whitespace-nowrap">{f.weight || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <DetailRow label="Commodity" value={commodity || '—'} />
            )}
            {weight !== '—' && (
              <div className="flex justify-between pt-3 mt-2 border-t border-gray-200 text-sm">
                <span className="font-semibold text-gray-700">Total weight</span>
                <span className="font-semibold text-gray-900">{weight}</span>
              </div>
            )}
          </Card>

          <Card title="Rate and Payment">
            <DetailRow label={rateLabel} value={rate} />
            <DetailRow label="Payment method" value={payment?.method || 'As invoiced'} />
            {payment?.fee && <DetailRow label="Payment fee" value={payment.fee} />}
            {payment?.parts && payment.parts.length > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Paid in parts</p>
                {payment.parts.map((part) => <DetailRow key={part.label} label={part.label} value={part.amount} />)}
              </div>
            )}
            <p className="text-xs text-gray-500 mt-3">
              Payment terms, and anything not stated here, are set out in the terms and conditions below.
            </p>
          </Card>

          {instructions && (
            <Card title="Special Instructions">
              <p className="text-sm text-gray-700 whitespace-pre-line">{instructions}</p>
            </Card>
          )}

          {notes && (
            <Card title="Notes">
              <p className="text-sm text-gray-700 whitespace-pre-line">{notes}</p>
            </Card>
          )}
        </>
      ) : (
        // A carrier's link, or a client link sent before the full review existed.
        <Card title="Load Details" aside={<span className="font-mono text-sm font-bold text-gray-800">{orderNumber}</span>}>
          <DetailRow label={partyLabel} value={partyName} />
          {!isClient && driverName && <DetailRow label="Driver" value={driverName} />}
          {contact && <DetailRow label={contactLabel} value={contact} />}
          <DetailRow label="From"      value={originStr} />
          <DetailRow label="To"        value={destinationStr} />
          <DetailRow label="Commodity" value={commodity} />
          <DetailRow label="Weight"    value={weight} />
          <DetailRow label="Pieces"    value={pieces} />
          {dimensions && <DetailRow label="Dimensions" value={dimensions} />}
          <DetailRow label="Pickup"    value={pickupDate} />
          <DetailRow label="Delivery"  value={deliveryDate} />
          {(dockWork ?? []).map((l) => <DetailRow key={l.label} label={l.label} value={l.value} />)}
          {accessorials && accessorials.length > 0 && <DetailRow label="Accessorials" value={accessorials.join(', ')} />}
          <div className="flex justify-between pt-3 mt-1 border-t-2 border-gray-200">
            <span className="text-sm font-bold text-gray-700 uppercase tracking-wide">{rateLabel}</span>
            <span className="text-xl font-bold text-gray-900">{rate}</span>
          </div>
          {instructions && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Special Instructions</p>
              <p className="text-sm text-gray-700 whitespace-pre-line">{instructions}</p>
            </div>
          )}
          {notes && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Notes</p>
              <p className="text-sm text-gray-700 whitespace-pre-line">{notes}</p>
            </div>
          )}
        </Card>
      )}

      <Card title="Terms and Conditions">
        <div className="bg-gray-50 rounded-lg p-4 max-h-96 overflow-y-auto border border-gray-200">
          <pre className="text-xs text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">{termsText}</pre>
        </div>
      </Card>

      {/*
        Signature. In a preview the same section is drawn, so staff see the
        page exactly as the client does, but as a plain <div> with every field
        inside a disabled <fieldset>: nothing can be typed, ticked or pressed,
        and there is no form to submit even if a browser were coaxed into it.
      */}
      <SignatureBox preview={preview} onSubmit={handleSubmit}>
        <fieldset disabled={preview} className="min-w-0 space-y-4">

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="signer-name" className="block text-sm font-medium text-gray-700 mb-1">
              Full legal name
            </label>
            <input
              id="signer-name"
              type="text"
              autoComplete="name"
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              placeholder="Full legal name"
              maxLength={120}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
          </div>
          <div>
            <label htmlFor="signer-title" className="block text-sm font-medium text-gray-700 mb-1">
              Title <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <input
              id="signer-title"
              type="text"
              autoComplete="organization-title"
              value={signerTitle}
              onChange={(e) => setSignerTitle(e.target.value)}
              placeholder="e.g. Logistics Manager"
              maxLength={120}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
          </div>
        </div>

        {/*
          The client's chance to tell us anything else. Optional, and added
          beside our instructions on the order, never in place of them. Not
          offered to a carrier: their instructions come from dispatch.
        */}
        {isClient && (
          <div>
            <label htmlFor="signer-instructions" className="block text-sm font-medium text-gray-700 mb-1">
              Special instructions for us <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <textarea
              id="signer-instructions"
              value={addedInstructions}
              onChange={(e) => setAddedInstructions(e.target.value)}
              rows={3}
              maxLength={MAX_CLIENT_INSTRUCTION}
              placeholder="Anything else we should know about this load — gate codes, contact on site, hours."
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 resize-y"
            />
            <p className="text-xs text-gray-500 mt-1">Kept with your signed agreement and added to the instructions on this load.</p>
          </div>
        )}

        {/* What the signature will look like — so "typing my name" reads as signing. */}
        <div className="rounded-lg border border-dashed border-gray-300 px-4 py-3">
          <p className="text-[11px] uppercase tracking-wide text-gray-400">Signature</p>
          <p className="text-2xl text-gray-900 min-h-[2.25rem] truncate" style={{ fontFamily: 'cursive' }}>
            {signerName.trim() || ' '}
          </p>
          <p className="text-xs text-gray-500">
            {[signerTitle.trim(), partyName].filter(Boolean).join(', ') || ' '}
          </p>
        </div>

        {/*
          Two boxes, not one, on purpose. Agreeing to do business electronically
          is a separate consent under the E-SIGN Act from agreeing to what the
          document says, and a single box that bundles them is the weaker record.
        */}
        <label className={`flex items-start gap-3 ${preview ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-0.5 w-4 h-4 flex-shrink-0"
          />
          <span className="text-sm text-gray-700">
            I agree to sign this document electronically. My typed name is my signature and has the same legal
            effect as a handwritten one.
          </span>
        </label>

        <label className={`flex items-start gap-3 ${preview ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 w-4 h-4 flex-shrink-0"
          />
          <span className="text-sm text-gray-700">
            I have read and accept the terms and conditions of this {docName}
            {isClient ? ', and I confirm the rate, the pickup and delivery details and the payment terms shown above' : ''}
            {partyName ? `, on behalf of ${partyName}` : ''}.
          </span>
        </label>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600">{error}</div>
        )}

        <button
          type="submit"
          disabled={submitting || !ready}
          className="w-full py-3 bg-brand-600 text-white font-bold text-sm rounded-lg hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          {submitting ? 'Submitting…' : 'Sign & Submit →'}
        </button>

        <p className="text-xs text-gray-400 text-center">
          Your name, title, IP address, device, and the date and time of signing will be recorded for legal purposes.
        </p>
        </fieldset>
      </SignatureBox>
    </div>
  );
}
