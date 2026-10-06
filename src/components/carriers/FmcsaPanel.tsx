'use client';

import { useEffect, useRef, useState } from 'react';
import { ShieldCheck, ShieldAlert, ShieldX, RefreshCw, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';
import { runFmcsaCheck } from '@/lib/fmcsaClient';
import { useDateFormatters } from '@/lib/useDateFormatters';
import {
  authorityLabel,
  fmcsaConcerns,
  fmcsaDollars,
  fmcsaIsStale,
  fmcsaLevel,
  fmcsaRate,
  safetyRatingLabel,
} from '@/types/fmcsa';
import type { FmcsaCheck, FmcsaLevel } from '@/types/fmcsa';

const LEVEL_STYLE: Record<FmcsaLevel, { box: string; pill: string; label: string; Icon: typeof ShieldCheck }> = {
  ok:   { box: 'border-green-200 bg-green-50',  pill: 'bg-green-100 text-green-700', label: 'Authorized',     Icon: ShieldCheck },
  warn: { box: 'border-amber-200 bg-amber-50',  pill: 'bg-amber-100 text-amber-700', label: 'Look first',     Icon: ShieldAlert },
  bad:  { box: 'border-red-200 bg-red-50',      pill: 'bg-red-100 text-red-700',     label: 'Problem found',  Icon: ShieldX },
};

const labelCls = 'block text-xs font-medium text-gray-500 uppercase tracking-wide mb-0.5';

/** FMCSA's public page for the carrier, for anybody who wants the source. */
function saferUrl(dot: string): string {
  return `https://safer.fmcsa.dot.gov/query.asp?searchtype=ANY&query_type=queryCarrierSnapshot&query_param=USDOT&query_string=${encodeURIComponent(dot)}`;
}

/**
 * The FMCSA check for one carrier: whether it may haul, whether FMCSA has its
 * insurance, and anything on its record a broker should stop for.
 *
 * `autoCheck` is for screens where the carrier is about to be used — the
 * order and the assign form. There a missing or day-old answer is refreshed
 * on its own, because a warning that waits for somebody to think of clicking
 * is not a warning. The carrier page leaves it to the button.
 *
 * A check is also stale when the numbers on the record are not the ones it
 * was made with: somebody corrected the DOT, and the answer on screen is
 * about a different company.
 *
 * Nothing here blocks booking. It tells; deciding is the broker's.
 */
export default function FmcsaPanel({
  carrierId,
  check: initial,
  dot,
  mc,
  autoCheck = false,
  compact = false,
  onChecked,
}: {
  carrierId: string;
  check: FmcsaCheck | null | undefined;
  dot: string;
  mc: string;
  autoCheck?: boolean;
  /** Concerns only, details behind a toggle — for the order screen. */
  compact?: boolean;
  /** A fresh answer, so the page holding the carrier can keep its copy current. */
  onChecked?: (check: FmcsaCheck) => void;
}) {
  const { formatDateTime } = useDateFormatters();
  const [check, setCheck]     = useState<FmcsaCheck | null>(initial ?? null);
  const [running, setRunning] = useState(false);
  const [error, setError]     = useState('');
  const [open, setOpen]       = useState(!compact);
  const autoRan = useRef(false);

  const query = (dot || mc).trim();
  const numbersChanged = !!check && !!query && check.query !== query;

  useEffect(() => { setCheck(initial ?? null); }, [initial]);

  async function run() {
    setRunning(true);
    setError('');
    try {
      const fresh = await runFmcsaCheck(carrierId);
      setCheck(fresh);
      onChecked?.(fresh);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The FMCSA check failed.');
    } finally {
      setRunning(false);
    }
  }

  // Once per carrier per mount, so an FMCSA outage is not retried in a loop.
  useEffect(() => {
    autoRan.current = false;
  }, [carrierId]);
  useEffect(() => {
    if (!autoCheck || autoRan.current || !query) return;
    if (!fmcsaIsStale(check) && !numbersChanged) return;
    autoRan.current = true;
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoCheck, carrierId, query]);

  if (!query) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-500">
        Add a DOT or MC number to check this carrier with FMCSA.
      </div>
    );
  }

  const button = (
    <button type="button" onClick={run} disabled={running}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 bg-white text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50 transition">
      <RefreshCw className={`w-3.5 h-3.5 ${running ? 'animate-spin' : ''}`} />
      {running ? 'Checking FMCSA…' : check ? 'Check again' : 'Check FMCSA'}
    </button>
  );

  if (!check) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-gray-600">Not checked with FMCSA yet.</p>
          {button}
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  const concerns = fmcsaConcerns(check, mc);
  const level = fmcsaLevel(concerns);
  const style = LEVEL_STYLE[level];
  const { Icon } = style;
  const stale = fmcsaIsStale(check) || numbersChanged;

  return (
    <div className={`rounded-lg border p-3 space-y-3 ${style.box}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-0.5">
          <p className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <Icon className="w-4 h-4" />
            FMCSA
            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${style.pill}`}>{style.label}</span>
          </p>
          <p className="text-xs text-gray-500">
            Checked {formatDateTime(check.checkedAt)} by {check.checkedByName}
            {numbersChanged && ' — the DOT/MC on record has changed since'}
            {!numbersChanged && stale && ' — over a day old'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {check.dotNumber && (
            <a href={saferUrl(check.dotNumber)} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline">
              SAFER <ExternalLink className="w-3 h-3" />
            </a>
          )}
          {button}
        </div>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      {concerns.length > 0 ? (
        <ul className="space-y-1">
          {concerns.map((c) => (
            <li key={c.text} className={`text-sm ${c.level === 'bad' ? 'text-red-700 font-medium' : 'text-amber-800'}`}>
              {c.text}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-green-800">
          Authorized to operate, operating authority active and liability insurance on file.
        </p>
      )}

      {check.found && compact && (
        <button type="button" onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900">
          {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          {open ? 'Hide FMCSA details' : 'Show FMCSA details'}
        </button>
      )}

      {check.found && open && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1 text-sm">
          <div>
            <p className={labelCls}>Legal Name</p>
            <p className="text-gray-900">{check.legalName || '—'}</p>
            {check.dbaName && <p className="text-xs text-gray-500">DBA {check.dbaName}</p>}
          </div>
          <div>
            <p className={labelCls}>DOT / MC at FMCSA</p>
            <p className="text-gray-900">
              DOT {check.dotNumber || '—'}
              {check.docketNumbers.length > 0 && <> · MC {check.docketNumbers.join(', ')}</>}
            </p>
            {!dot && check.dotNumber && (
              <p className="text-xs text-gray-500">Our record has no DOT number.</p>
            )}
          </div>
          <div>
            <p className={labelCls}>Based In</p>
            <p className="text-gray-900">{[check.city, check.state].filter(Boolean).join(', ') || '—'}</p>
          </div>
          <div>
            <p className={labelCls}>Operating Authority</p>
            <p className="text-gray-900">
              Common {authorityLabel(check.commonAuthority)} · Contract {authorityLabel(check.contractAuthority)}
            </p>
          </div>
          <div>
            <p className={labelCls}>Insurance on File</p>
            <p className="text-gray-900">
              Liability {check.liabilityOnFile > 0 ? fmcsaDollars(check.liabilityOnFile) : 'none'}
              {check.liabilityRequired === 'Y' && check.liabilityRequiredAmount > 0 && (
                <span className="text-gray-500"> (needs {fmcsaDollars(check.liabilityRequiredAmount)})</span>
              )}
            </p>
            <p className="text-gray-900">
              Cargo {check.cargoOnFile > 0 ? fmcsaDollars(check.cargoOnFile) : 'none'}
            </p>
          </div>
          <div>
            <p className={labelCls}>Safety Rating</p>
            <p className="text-gray-900">{safetyRatingLabel(check.safetyRating)}</p>
          </div>
          <div>
            <p className={labelCls}>Fleet</p>
            <p className="text-gray-900">
              {check.powerUnits} truck{check.powerUnits === 1 ? '' : 's'}
              {check.drivers > 0 && <> · {check.drivers} driver{check.drivers === 1 ? '' : 's'}</>}
            </p>
          </div>
          <div>
            <p className={labelCls}>Crashes (24 months)</p>
            <p className="text-gray-900">
              {check.crashTotal}{check.fatalCrash > 0 && <span className="text-red-700"> · {check.fatalCrash} fatal</span>}
            </p>
          </div>
          <div>
            <p className={labelCls}>Out-of-Service Rate</p>
            <p className="text-gray-900">
              Vehicle {fmcsaRate(check.vehicleOosRate)} <span className="text-gray-500">(avg {fmcsaRate(check.vehicleOosNational)})</span>
            </p>
            <p className="text-gray-900">
              Driver {fmcsaRate(check.driverOosRate)} <span className="text-gray-500">(avg {fmcsaRate(check.driverOosNational)})</span>
            </p>
          </div>
          <p className="sm:col-span-3 text-xs text-gray-500">
            FMCSA shows whether insurance is on file, not the insurer or the expiry date — the
            certificate details on this carrier are still the ones to keep current.
          </p>
        </div>
      )}
    </div>
  );
}
