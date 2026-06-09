'use client';

import { useState } from 'react';

interface Props {
  token: string;
  type: 'carrier_agreement' | 'shipper_agreement';
  orderNumber: string;
  partyName: string;
  driverName: string;
  commodity: string;
  weight: string;
  pieces: string;
  originStr: string;
  destinationStr: string;
  pickupDate: string;
  deliveryDate: string;
  rate: string;
  notes: string;
}

const CARRIER_TERMS = `CARRIER AGREEMENT & RATE CONFIRMATION

This Rate Confirmation ("Agreement") is entered into between Total Transport Logistics ("Broker") and the carrier identified above ("Carrier").

1. LOAD ACCEPTANCE. By signing below, Carrier accepts the load described in this Rate Confirmation and agrees to transport the shipment in accordance with all terms herein.

2. RATE. Carrier agrees to accept the Carrier Pay stated above as full and complete compensation for services rendered. Payment will be made within 30 days of receipt of a signed Proof of Delivery (POD) and invoice.

3. CARRIER OBLIGATIONS. Carrier shall: (a) pick up and deliver the shipment on the dates specified; (b) ensure the driver is properly licensed and the vehicle is in safe, roadworthy condition; (c) comply with all federal, state, and local regulations including FMCSA requirements; (d) not broker, re-broker, or assign this load to any third party without prior written consent from Broker.

4. INSURANCE. Carrier represents and warrants that it maintains continuous cargo insurance of at least $100,000 and liability insurance of at least $1,000,000. Carrier must provide certificate of insurance upon request.

5. LOSS & DAMAGE. Carrier is liable for cargo loss or damage under the Carmack Amendment (49 U.S.C. § 14706). Carrier shall not limit its liability below the full actual value of the shipment.

6. DOUBLE BROKERING. Any attempt to re-broker this shipment without authorization is grounds for immediate termination of this agreement and Carrier shall forfeit all compensation.

7. DIGITAL SIGNATURE. The parties agree that an electronic signature is legally binding to the same extent as a wet ink signature pursuant to the Electronic Signatures in Global and National Commerce Act (E-SIGN) and applicable state law. Carrier's name, IP address, date, and time are recorded upon submission.

8. GOVERNING LAW. This Agreement is governed by the laws of the United States and the state of Texas.`;

const SHIPPER_TERMS = `SHIPPER LOAD CONFIRMATION

This Load Confirmation ("Agreement") is entered into between Total Transport Logistics ("Broker") and the shipper identified above ("Shipper").

1. LOAD ACCEPTANCE. By signing below, Shipper confirms the freight details described in this confirmation and authorizes Total Transport Logistics to arrange transportation of the described shipment.

2. RATE. Shipper agrees to pay the Agreed Rate stated above for transportation services. Payment terms are net 30 days from invoice date.

3. FREIGHT DESCRIPTION. Shipper warrants that the commodity description, weight, and piece count are accurate. Any discrepancies may result in additional charges.

4. PICKUP & DELIVERY. Shipper is responsible for having freight ready at the origin location on the specified pickup date. Delivery estimates are not guaranteed unless stated as guaranteed service.

5. CLAIMS. Any freight claims must be submitted in writing within 9 months of delivery. Shipper must retain all supporting documentation including bills of lading and delivery receipts.

6. INDEMNIFICATION. Shipper shall indemnify and hold harmless Total Transport Logistics from any claims arising from Shipper's failure to properly prepare, describe, or label the freight.

7. DIGITAL SIGNATURE. The parties agree that an electronic signature is legally binding to the same extent as a wet ink signature pursuant to the Electronic Signatures in Global and National Commerce Act (E-SIGN) and applicable state law. Shipper's name, IP address, date, and time are recorded upon submission.

8. GOVERNING LAW. This Agreement is governed by the laws of the United States and the state of Texas.`;

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-2.5 border-b border-gray-100 last:border-0">
      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</span>
      <span className="text-sm text-gray-900 font-medium text-right max-w-[60%]">{value}</span>
    </div>
  );
}

export default function SignForm({
  token, type, orderNumber, partyName, driverName, commodity, weight, pieces,
  originStr, destinationStr, pickupDate, deliveryDate, rate, notes,
}: Props) {
  const [signerName, setSignerName] = useState('');
  const [agreed, setAgreed]         = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState('');
  const [signed, setSigned]         = useState(false);

  const isShipper  = type === 'shipper_agreement';
  const partyLabel = isShipper ? 'Shipper' : 'Carrier';
  const rateLabel  = isShipper ? 'Agreed Rate' : 'Carrier Pay';
  const terms      = isShipper ? SHIPPER_TERMS : CARRIER_TERMS;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!signerName.trim()) { setError('Please enter your full legal name.'); return; }
    if (!agreed)            { setError('You must agree to the terms before signing.'); return; }

    setError('');
    setSubmitting(true);
    try {
      const res = await fetch(`/api/sign/${token}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ signerName: signerName.trim() }),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error ?? 'Signing failed');
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
      <div className="bg-white rounded-xl border border-green-200 p-10 text-center">
        <p className="text-5xl mb-4">✅</p>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Signed Successfully</h2>
        <p className="text-sm text-gray-600 mb-1">
          Thank you, <strong>{signerName}</strong>. Your signature has been recorded.
        </p>
        <p className="text-sm text-gray-600">
          {isShipper ? 'Load confirmation' : 'Rate confirmation'} <strong>{orderNumber}</strong> is now complete.
        </p>
        <p className="text-xs text-gray-400 mt-4">You may close this window.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Load summary */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide">Load Details</h2>
          <span className="font-mono text-sm font-bold text-gray-800">{orderNumber}</span>
        </div>
        <DetailRow label={partyLabel} value={partyName} />
        {!isShipper && driverName && <DetailRow label="Driver" value={driverName} />}
        <DetailRow label="From"      value={originStr} />
        <DetailRow label="To"        value={destinationStr} />
        <DetailRow label="Commodity" value={commodity} />
        <DetailRow label="Weight"    value={weight} />
        <DetailRow label="Pieces"    value={pieces} />
        <DetailRow label="Pickup"    value={pickupDate} />
        <DetailRow label="Delivery"  value={deliveryDate} />
        <div className="flex justify-between pt-3 mt-1 border-t-2 border-gray-200">
          <span className="text-sm font-bold text-gray-700 uppercase tracking-wide">{rateLabel}</span>
          <span className="text-xl font-bold text-gray-900">{rate}</span>
        </div>
        {notes && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Notes</p>
            <p className="text-sm text-gray-700 whitespace-pre-line">{notes}</p>
          </div>
        )}
      </div>

      {/* Agreement terms */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Agreement Terms</h2>
        <div className="bg-gray-50 rounded-lg p-4 h-56 overflow-y-auto border border-gray-200">
          <pre className="text-xs text-gray-600 whitespace-pre-wrap font-sans leading-relaxed">{terms}</pre>
        </div>
      </div>

      {/* Signature */}
      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide">Sign</h2>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Type your full legal name to sign
          </label>
          <input
            type="text"
            value={signerName}
            onChange={(e) => setSignerName(e.target.value)}
            placeholder="Full legal name"
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
            style={{ fontFamily: 'cursive' }}
          />
        </div>

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 w-4 h-4 flex-shrink-0"
          />
          <span className="text-sm text-gray-700">
            I have read and agree to all terms in this {isShipper ? 'Shipper Load Confirmation' : 'Carrier Agreement & Rate Confirmation'}. I understand this constitutes a legally binding electronic signature.
          </span>
        </label>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600">{error}</div>
        )}

        <button
          type="submit"
          disabled={submitting || !signerName.trim() || !agreed}
          className="w-full py-3 bg-brand-600 text-white font-bold text-sm rounded-lg hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          {submitting ? 'Submitting…' : 'Sign & Submit →'}
        </button>

        <p className="text-xs text-gray-400 text-center">
          Your name, IP address, and the date/time of signing will be recorded for legal purposes.
        </p>
      </form>
    </div>
  );
}
