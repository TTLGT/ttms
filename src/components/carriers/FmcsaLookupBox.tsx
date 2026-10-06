'use client';

import { useState } from 'react';
import { Search, ShieldCheck, ShieldAlert, ShieldX } from 'lucide-react';
import { lookupFmcsa } from '@/lib/fmcsaClient';
import type { FmcsaLookupResult } from '@/lib/fmcsaClient';
import { fmcsaAddress, fmcsaConcerns, fmcsaLevel } from '@/types/fmcsa';
import type { FmcsaAnswer } from '@/types/fmcsa';

export interface FmcsaFill {
  companyName: string;
  dot: string;
  mc: string;
  address: string;
}

/** The parts of an FMCSA answer that become a new carrier's details. */
function fillFrom(a: FmcsaAnswer, kind: 'dot' | 'mc', typed: string): FmcsaFill {
  return {
    companyName: a.legalName,
    dot: a.dotNumber || (kind === 'dot' ? typed : ''),
    // The MC the broker typed when they typed one: a company can hold several
    // dockets, and the one on the rate confirmation is the one they meant.
    mc: kind === 'mc' ? typed : (a.docketNumbers[0] ?? ''),
    address: fmcsaAddress(a),
  };
}

const inputCls = 'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400';

/**
 * The top of the Add Carrier forms: type a DOT or MC, and FMCSA fills in the
 * rest of what it knows — the legal name, both numbers and the address.
 *
 * It fills, it does not save. The broker still adds the contact, phone and
 * email (FMCSA's lookup has none of those) and the certificate, and can
 * correct anything it filled before pressing Save.
 *
 * When the company is already in TTMS it says so instead of filling, and
 * `renderExisting` decides what to offer — open it from the Carriers page,
 * use it from an order. A second record for the same company splits its loads
 * and its insurance between two places, and that is a mistake nobody notices
 * until a certificate lapses on the copy nobody was looking at.
 *
 * Sits inside the carrier `<form>`, so Enter in its box is caught here rather
 * than saving a half-filled carrier.
 */
export default function FmcsaLookupBox({
  onFill,
  renderExisting,
}: {
  onFill: (fill: FmcsaFill, answer: FmcsaAnswer) => void;
  renderExisting: (existing: NonNullable<FmcsaLookupResult['existing']>) => React.ReactNode;
}) {
  const [kind, setKind]       = useState<'dot' | 'mc'>('dot');
  const [number, setNumber]   = useState('');
  const [running, setRunning] = useState(false);
  const [error, setError]     = useState('');
  const [result, setResult]   = useState<FmcsaLookupResult | null>(null);

  const digits = number.replace(/\D+/g, '');

  async function run() {
    if (!digits || running) return;
    setRunning(true);
    setError('');
    setResult(null);
    try {
      const r = await lookupFmcsa(digits, kind);
      setResult(r);
      if (r.lookup.found && !r.existing) onFill(fillFrom(r.lookup, kind, digits), r.lookup);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The FMCSA lookup failed.');
    } finally {
      setRunning(false);
    }
  }

  const answer = result?.lookup;
  const concerns = answer?.found ? fmcsaConcerns(answer, kind === 'mc' ? digits : undefined) : [];
  const level = fmcsaLevel(concerns);
  const LevelIcon = level === 'bad' ? ShieldX : level === 'warn' ? ShieldAlert : ShieldCheck;

  return (
    <div className="rounded-xl border border-brand-100 bg-brand-50 p-4 space-y-3">
      <div>
        <p className="text-sm font-semibold text-gray-900">Look up on FMCSA</p>
        <p className="text-xs text-gray-600">
          Type the DOT or MC number and the name, numbers and address are filled in for you.
          Contact, phone and email still need typing — FMCSA does not give those out.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <select value={kind} onChange={(e) => setKind(e.target.value === 'mc' ? 'mc' : 'dot')}
          className={`${inputCls} bg-white`} aria-label="Number type">
          <option value="dot">DOT</option>
          <option value="mc">MC</option>
        </select>
        <input value={number} onChange={(e) => setNumber(e.target.value)} inputMode="numeric"
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); run(); } }}
          placeholder={kind === 'dot' ? 'e.g. 1234567' : 'e.g. 123456'}
          className={`${inputCls} flex-1 min-w-[10rem] bg-white`} />
        <button type="button" onClick={run} disabled={!digits || running}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 disabled:opacity-50 transition">
          <Search className="w-4 h-4" />
          {running ? 'Looking up…' : 'Look up'}
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {result && !answer?.found && (
        <p className="text-sm text-red-700 font-medium">
          FMCSA has no carrier under {kind.toUpperCase()} {digits}. Check the number with the carrier.
        </p>
      )}

      {result?.existing && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
          <p className="text-sm text-amber-900">
            <span className="font-semibold">Already in TTMS</span> as {result.existing.companyName || 'an unnamed carrier'}
            {!result.existing.isActive && ' (marked inactive)'}. Use that record rather than adding a second one.
          </p>
          {renderExisting(result.existing)}
        </div>
      )}

      {answer?.found && !result?.existing && (
        <div className="space-y-1.5">
          <p className="flex items-center gap-1.5 text-sm text-gray-900">
            <LevelIcon className={`w-4 h-4 ${level === 'bad' ? 'text-red-600' : level === 'warn' ? 'text-amber-600' : 'text-green-600'}`} />
            Filled in from FMCSA: <span className="font-semibold">{answer.legalName}</span>
            {answer.dbaName && <span className="text-gray-500">(DBA {answer.dbaName})</span>}
          </p>
          {concerns.length > 0 ? (
            <ul className="space-y-0.5 pl-5">
              {concerns.map((c) => (
                <li key={c.text} className={`text-sm ${c.level === 'bad' ? 'text-red-700 font-medium' : 'text-amber-800'}`}>
                  {c.text}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-green-800 pl-5">
              Authorized to operate, operating authority active and liability insurance on file.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
