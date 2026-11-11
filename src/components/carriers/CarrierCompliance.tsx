'use client';

import { useEffect, useRef, useState } from 'react';
import { Timestamp } from 'firebase/firestore';
import { Contact, Landmark, Mail, Phone, ShieldCheck, User } from 'lucide-react';
import { fmcsaConcerns, fmcsaLevel } from '@/types/fmcsa';
import { FixList, HealthChecks, showPart, type FixItem, type HealthCheck } from '@/components/orders/DetailBits';
import { getCarrier, updateCarrier } from '@/lib/carriers';
import { carrierMainContact, carrierNumber, formatCoverage, getInsuranceStatus, parseCoverageInput } from '@/types/carrier';
import type { Carrier } from '@/types/carrier';
import { useAuth } from '@/context/AuthContext';
import { useDateFormatters } from '@/lib/useDateFormatters';
import DateField from '@/components/DateField';
import CopyValue from '@/components/CopyValue';
import PhoneValue from '@/components/PhoneValue';
import InsuranceFileUpload from './InsuranceFileUpload';
import CoverageInput from './CoverageInput';
import FmcsaPanel from './FmcsaPanel';

/** Same round trip the carrier page uses, so both screens agree on the day. */
function toDateInput(ts: { toDate?: () => Date } | null | undefined): string {
  if (!ts || typeof ts.toDate !== 'function') return '';
  return ts.toDate().toISOString().split('T')[0];
}

function coverageInput(n: number | null | undefined): string {
  return n === null || n === undefined ? '' : String(n);
}

const labelCls = 'block text-xs font-medium text-gray-600 mb-1';
/** The order screen's own label style, so these rows match its others. */
const viewLabelCls = 'block text-xs font-medium text-gray-500 uppercase tracking-wide mb-0.5';
const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400';

/**
 * What a broker checks about a carrier before tendering a load, reached from
 * the load: MC and DOT numbers, the certificate of insurance, the date it
 * expires and the liability and cargo amounts it covers.
 *
 * All of it is the carrier's, not the order's: it is written to the carrier
 * record — the same fields the carrier page edits — so what is filled in while
 * booking one load is what every later load with that carrier shows. Nothing
 * is copied onto the order. A certificate is renewed every year, and a load
 * pointing at last year's copy would be answering "is this truck insured" with
 * an out-of-date yes.
 *
 * MC and DOT are shown as text once the carrier has them and only offered as
 * boxes while they are blank. They identify the company — changing one is a
 * correction to the carrier record, made on the carrier page, not something
 * to do in passing from somebody's load. Blank is common: the BATS import
 * carried no DOT numbers at all.
 *
 * The file saves on the spot, like the carrier page, because the upload has
 * already happened by the time the path comes back — holding it until Save
 * would leave a file nothing points at if the broker cancels. Everything else
 * waits for its own Save button, because a date saved on every keystroke would
 * be written half-typed.
 *
 * Read through the carrier record itself (one document) rather than the
 * page's carrier list, which holds active carriers only; a load booked with a
 * carrier since deactivated still has to show what it ran under.
 */
export default function CarrierCompliance({
  carrierId,
  nameCell,
  driverRow,
  paperChecks,
  onCarrier,
}: {
  carrierId: string;
  /** The carrier's name, drawn first on the top row beside MC and DOT. */
  nameCell?: React.ReactNode;
  /** The load's driver, drawn between the carrier's contact and its insurance. */
  driverRow?: React.ReactNode;
  /**
   * The load's own checks — the Dispatch Sheet and the driver link — drawn
   * after this card's FMCSA and insurance ones, in the row of four along
   * the top. The order page owns those facts, so it hands them in.
   */
  paperChecks?: HealthCheck[];
  /**
   * The carrier as this card currently holds it — on load, and again after
   * every FMCSA check or save. The order's Next step card reads FMCSA from
   * here (orderNextSteps), because the check this card runs by itself on a
   * newly assigned carrier lands after the page's own carrier list was read,
   * and that list leaves out inactive carriers anyway.
   */
  onCarrier?: (carrier: Carrier | null) => void;
}) {
  const { can } = useAuth();
  const { formatDate } = useDateFormatters();
  const [carrier, setCarrier] = useState<Carrier | null>(null);
  // Through a ref so a parent passing an inline function does not re-fire it.
  const onCarrierRef = useRef(onCarrier);
  onCarrierRef.current = onCarrier;
  useEffect(() => { onCarrierRef.current?.(carrier); }, [carrier]);
  const [loaded, setLoaded]   = useState(false);
  const [error, setError]     = useState('');
  const [mc, setMc]             = useState('');
  const [dot, setDot]           = useState('');
  const [expiry, setExpiry]     = useState('');
  const [coverage, setCoverage] = useState('');
  const [cargo, setCargo]       = useState('');
  const [saving, setSaving]     = useState(false);
  // Where each "things to fix" button takes you. Declared up here, before
  // the early return below, as hooks must be.
  const fmcsaRef = useRef<HTMLDivElement>(null);
  const insuranceRef = useRef<HTMLDivElement>(null);
  const numbersRef = useRef<HTMLDivElement>(null);

  const canEdit = can('carriers.edit');

  function resetFrom(c: Carrier | null) {
    setMc(c?.mc ?? '');
    setDot(c?.dot ?? '');
    setExpiry(toDateInput(c?.insuranceExpiration));
    setCoverage(coverageInput(c?.insuranceCoverage));
    setCargo(coverageInput(c?.insuranceCargoCoverage));
  }

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setError('');
    getCarrier(carrierId)
      .then((c) => {
        if (cancelled) return;
        setCarrier(c);
        resetFrom(c);
      })
      .catch(() => { if (!cancelled) setCarrier(null); })
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [carrierId]);

  async function handleFile(path: string | null) {
    setError('');
    const before = carrier;
    setCarrier((prev) => (prev ? { ...prev, insuranceStoragePath: path } : prev));
    try {
      await updateCarrier(carrierId, { insuranceStoragePath: path });
    } catch (e: unknown) {
      setCarrier(before);
      setError(e instanceof Error ? e.message : 'Failed to save the certificate');
    }
  }

  async function handleSave() {
    if (!carrier) return;
    const parsed = parseCoverageInput(coverage);
    if (coverage.trim() && parsed === null) {
      setError('The liability amount should be a number, like 1,000,000.');
      return;
    }
    const parsedCargo = parseCoverageInput(cargo);
    if (cargo.trim() && parsedCargo === null) {
      setError('The cargo amount should be a number, like 100,000.');
      return;
    }
    setError('');
    setSaving(true);
    const updates: Partial<Carrier> = {
      insuranceExpiration: expiry ? Timestamp.fromDate(new Date(expiry)) : null,
      insuranceCoverage:   parsed,
      insuranceCargoCoverage: parsedCargo,
    };
    // Only a number that was blank is written from here — see the note above.
    if (!carrier.mc?.trim())  updates.mc  = carrierNumber(mc);
    if (!carrier.dot?.trim()) updates.dot = carrierNumber(dot);
    try {
      await updateCarrier(carrierId, updates);
      const next = { ...carrier, ...updates };
      setCarrier(next);
      resetFrom(next);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save the carrier details');
    } finally {
      setSaving(false);
    }
  }

  // The name and driver belong to the load, not to this read, so they are
  // drawn even while the carrier is loading or could not be read at all.
  if (!loaded || !carrier) {
    const placeholder = <p className="text-sm text-gray-400">{loaded ? '—' : 'Loading…'}</p>;
    if (nameCell === undefined && driverRow === undefined) return placeholder;
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">{nameCell}</div>
        {placeholder}
        {driverRow}
      </div>
    );
  }

  const mcOnFile  = (carrier.mc  ?? '').trim();
  const dotOnFile = (carrier.dot ?? '').trim();

  const status = getInsuranceStatus(carrier.insuranceExpiration);
  const statusCls = status === 'expired' ? 'text-red-600 font-medium'
    : status === 'expiring_soon' ? 'text-amber-700' : 'text-gray-900';

  const dirty = (!mcOnFile && mc.trim() !== '')
    || (!dotOnFile && dot.trim() !== '')
    || expiry !== toDateInput(carrier.insuranceExpiration)
    || coverage !== coverageInput(carrier.insuranceCoverage)
    || cargo !== coverageInput(carrier.insuranceCargoCoverage);

  // On the new-order form this sits inside the order's <form>, and Enter in
  // any of these boxes would create the quote rather than save this.
  function saveOnEnter(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (dirty) handleSave();
  }

  // Laid out as rows of three when the order screen hands over the carrier's
  // name, so MC and DOT sit beside it and line up with the contact and driver
  // rows below. Without one (the assign form, where the name is a dropdown
  // above) the two numbers keep their pair of columns.
  const wide = nameCell !== undefined;
  const rowCls = wide ? 'grid grid-cols-1 sm:grid-cols-3 gap-6' : 'grid grid-cols-1 sm:grid-cols-2 gap-3';
  const fieldLabelCls = wide ? viewLabelCls : labelCls;
  const contact = carrierMainContact(carrier);

  function numberField(label: string, onFile: string, value: string, set: (v: string) => void, placeholder: string) {
    return (
      <div>
        <label className={fieldLabelCls}>{label}</label>
        {onFile ? (
          <p className={`text-sm text-gray-900 ${wide ? '' : 'py-2'}`}>
            <span className="group inline-flex">
              <CopyValue value={onFile} label={`${label} number`}>{onFile}</CopyValue>
            </span>
          </p>
        ) : canEdit ? (
          <input value={value} onChange={(e) => set(e.target.value)} onKeyDown={saveOnEnter}
            placeholder={placeholder} className={inputCls} />
        ) : (
          <p data-es className={`text-sm text-gray-400 ${wide ? '' : 'py-2'}`}>Not on record</p>
        )}
      </div>
    );
  }

  const certificate = (
    <div>
      <p data-es className={fieldLabelCls}>Certificate of Insurance</p>
      <InsuranceFileUpload
        carrierId={carrierId}
        value={carrier.insuranceStoragePath ?? null}
        onChange={handleFile}
        readOnly={!canEdit}
      />
    </div>
  );

  const insurance = canEdit ? (
    <>
      <div>
        <label data-es className={fieldLabelCls}>Insurance Expiration</label>
        <DateField value={expiry} onChange={setExpiry} className={inputCls} />
        {status === 'expired' && expiry === toDateInput(carrier.insuranceExpiration) && (
          <p data-es className="text-xs text-red-600 font-medium mt-1">Expired</p>
        )}
        {status === 'expiring_soon' && expiry === toDateInput(carrier.insuranceExpiration) && (
          <p data-es className="text-xs text-amber-700 mt-1">Expires within 30 days</p>
        )}
      </div>
      <div>
        <label data-es className={fieldLabelCls}>Liability Amount</label>
        <CoverageInput value={coverage} onChange={setCoverage} onKeyDown={saveOnEnter}
          placeholder="e.g. 1,000,000" className={inputCls} />
      </div>
      <div>
        <label data-es className={fieldLabelCls}>Cargo Amount</label>
        <CoverageInput value={cargo} onChange={setCargo} onKeyDown={saveOnEnter}
          placeholder="e.g. 100,000" className={inputCls} />
      </div>
    </>
  ) : (
    <>
      <div className="text-sm">
        <p data-es className={fieldLabelCls}>Insurance Expiration</p>
        <p className={statusCls}>
          {carrier.insuranceExpiration
            ? <>{formatDate(carrier.insuranceExpiration)}{status === 'expired' && ' — expired'}</>
            : <span data-es className="text-gray-400">Not on record</span>}
        </p>
      </div>
      <div className="text-sm">
        <p data-es className={fieldLabelCls}>Liability Amount</p>
        <p className="text-gray-900">
          {formatCoverage(carrier.insuranceCoverage) || <span data-es className="text-gray-400">Not on record</span>}
        </p>
      </div>
      <div className="text-sm">
        <p data-es className={fieldLabelCls}>Cargo Amount</p>
        <p className="text-gray-900">
          {formatCoverage(carrier.insuranceCargoCoverage) || <span data-es className="text-gray-400">Not on record</span>}
        </p>
      </div>
    </>
  );

  const fmcsaPanel = (
    <FmcsaPanel
      carrierId={carrierId}
      check={carrier.fmcsa}
      dot={dotOnFile}
      mc={mcOnFile}
      autoCheck
      compact
      onChecked={(fmcsa) => setCarrier((prev) => (prev ? { ...prev, fmcsa } : prev))}
      carrier={dirty ? undefined : carrier}
      onFilled={(updates) => {
        const next = { ...carrier, ...updates };
        setCarrier(next);
        resetFrom(next);
      }}
    />
  );

  const saveBar = (
    <>
      {dirty && (
        <div className="flex flex-wrap items-center gap-2">
          {wide && <span data-es className="text-xs font-medium text-amber-700">Unsaved changes to the carrier</span>}
          <button type="button" onClick={handleSave} disabled={saving}
            className="px-3 py-1.5 bg-brand-600 text-white text-xs font-semibold rounded-lg hover:bg-brand-700 disabled:opacity-50 transition">
            {saving ? 'Saving…' : 'Save to carrier'}
          </button>
          <button type="button" disabled={saving}
            onClick={() => { resetFrom(carrier); setError(''); }}
            className="px-3 py-1.5 border border-gray-300 text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-50 transition">
            Undo
          </button>
        </div>
      )}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </>
  );

  // The order page (2026-11-11): the carrier's name large with its numbers
  // beside it, FMCSA's verdict straight under that, then the contact, the
  // driver and the insurance each in a titled tile of its own — where they
  // used to be three unlabelled rows of three that read as one grid.
  if (wide) {
    const insuranceTone = status === 'expired' ? 'red' : status === 'expiring_soon' ? 'amber' : carrier.insuranceExpiration ? 'green' : 'gray';
    const insuranceWord = status === 'expired' ? 'Expired' : status === 'expiring_soon' ? 'Expires soon' : carrier.insuranceExpiration ? 'In date' : 'Not on record';
    const pill = {
      red: 'bg-red-50 text-red-700 border-red-200', amber: 'bg-amber-50 text-amber-800 border-amber-200',
      green: 'bg-green-50 text-green-700 border-green-200', gray: 'bg-gray-100 text-gray-600 border-gray-200',
    }[insuranceTone];
    const tileCls = 'rounded-xl border border-gray-200 bg-gray-50 p-4';
    const tileTitle = (Icon: typeof User, title: string, aside?: React.ReactNode) => (
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4 shrink-0 text-gray-400" />
        <p data-es className="min-w-0 flex-1 text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</p>
        {aside}
      </div>
    );
    // FMCSA's verdict, by the same rules as the panel below it.
    const concerns = carrier.fmcsa ? fmcsaConcerns(carrier.fmcsa, mcOnFile) : [];
    const level = carrier.fmcsa ? fmcsaLevel(concerns) : null;
    const bad = concerns.filter((c) => c.level === 'bad');
    const checks: HealthCheck[] = [
      {
        key: 'fmcsa', label: 'FMCSA', icon: Landmark,
        ...(level === 'bad' ? { status: 'Problem found', tone: 'red' as const }
          : level === 'warn' ? { status: 'Look first', tone: 'amber' as const }
          : level === 'ok' ? { status: 'All clear', tone: 'green' as const }
          : { status: 'Not checked', tone: 'gray' as const }),
      },
      { key: 'insurance', label: 'Insurance', icon: ShieldCheck, status: insuranceWord, tone: insuranceTone === 'gray' ? 'gray' : insuranceTone },
    ];

    // What stands between this carrier and the load. Each button takes the
    // reader to where that thing is already fixed on this card.
    const expiry = carrier.insuranceExpiration ? formatDate(carrier.insuranceExpiration) : '';
    const fixes: FixItem[] = [];
    if (bad.length) {
      fixes.push({
        key: 'fmcsa',
        text: bad.length === 1 ? `FMCSA: ${bad[0].text}` : `FMCSA found ${bad.length} problems. ${bad[0].text}`,
        action: 'Show me', onAct: () => showPart(fmcsaRef.current),
      });
    }
    if (status === 'expired') {
      fixes.push({ key: 'ins', text: `Insurance expired on ${expiry}.`, action: 'Update insurance', onAct: () => showPart(insuranceRef.current) });
    } else if (status === 'expiring_soon') {
      fixes.push({ key: 'ins', text: `Insurance expires on ${expiry}, within 30 days.`, action: 'Update insurance', onAct: () => showPart(insuranceRef.current) });
    } else if (!carrier.insuranceExpiration) {
      fixes.push({ key: 'ins', text: 'No insurance expiry date on record.', action: 'Add it', onAct: () => showPart(insuranceRef.current) });
    }
    if (!carrier.insuranceStoragePath) {
      fixes.push({ key: 'coi', text: 'No certificate of insurance uploaded.', action: 'Upload it', onAct: () => showPart(insuranceRef.current) });
    }
    if (!mcOnFile || !dotOnFile) {
      const which = !mcOnFile && !dotOnFile ? 'The MC and DOT numbers are' : !mcOnFile ? 'The MC number is' : 'The DOT number is';
      fixes.push({ key: 'numbers', text: `${which} missing.`, action: 'Add it', onAct: () => showPart(numbersRef.current) });
    }

    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <div className="min-w-0 flex-1 basis-56">{nameCell}</div>
          <div ref={numbersRef} className="flex gap-x-6 gap-y-3">
            <div className="w-36">{numberField('MC', mcOnFile, mc, setMc, 'e.g. 123456')}</div>
            <div className="w-36">{numberField('DOT', dotOnFile, dot, setDot, 'e.g. 1234567')}</div>
          </div>
        </div>

        <HealthChecks checks={[...checks, ...(paperChecks ?? [])]} />

        <div ref={fmcsaRef}>{fmcsaPanel}</div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {/* Read off the carrier record rather than copied onto the load,
              for the same reason as PartyContact: a phone number is only
              useful if it is the current one. Edited on the carrier page. */}
          <div className={tileCls}>
            {tileTitle(Contact, 'Main Contact')}
            {contact?.name || contact?.phone || contact?.email ? (
              <div className="space-y-1.5 text-sm text-gray-900">
                {contact?.name && (
                  <p className="flex flex-wrap items-center gap-2 font-semibold">
                    {contact.name}
                    {contact.title && (
                      <span className="inline-flex px-1.5 py-0.5 rounded bg-gray-200 text-gray-700 text-[11px] font-medium">{contact.title}</span>
                    )}
                  </p>
                )}
                {contact?.phone && (
                  <p className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                    <PhoneValue value={contact.phone} region={contact.phoneRegion} label="carrier contact phone" /></p>
                )}
                {contact?.email && (
                  <p className="group flex min-w-0 items-center gap-2"><Mail className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                    <CopyValue value={contact.email} label="email address">
                      <a href={`mailto:${contact.email}`} className="truncate text-brand-600 hover:underline">{contact.email}</a>
                    </CopyValue>
                  </p>
                )}
              </div>
            ) : <p data-es className="text-sm text-gray-400">No contact on the carrier record</p>}
          </div>

          <div className={tileCls}>
            {tileTitle(User, 'Driver')}
            {driverRow}
          </div>
        </div>

        <div ref={insuranceRef} className={tileCls}>
          {tileTitle(ShieldCheck, 'Insurance',
            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${pill}`}>{insuranceWord}</span>)}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {certificate}
            {insurance}
          </div>
        </div>

        {saveBar}

        <FixList items={fixes} title={fixes.length === 1 ? '1 thing to fix before this carrier runs' : `${fixes.length} things to fix before this carrier runs`} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className={rowCls}>
        {numberField('MC', mcOnFile, mc, setMc, 'Not on record — e.g. 123456')}
        {numberField('DOT', dotOnFile, dot, setDot, 'Not on record — e.g. 1234567')}
      </div>

      {/* Checked by itself here, unlike on the carrier page: this is where the
          carrier is being booked, and a warning nobody thought to ask for is
          the one that matters. Uses the saved numbers, so it re-runs once a
          blank MC or DOT above has been saved. */}
      <FmcsaPanel
        carrierId={carrierId}
        check={carrier.fmcsa}
        dot={dotOnFile}
        mc={mcOnFile}
        autoCheck
        compact
        onChecked={(fmcsa) => setCarrier((prev) => (prev ? { ...prev, fmcsa } : prev))}
        carrier={dirty ? undefined : carrier}
        onFilled={(updates) => {
          const next = { ...carrier, ...updates };
          setCarrier(next);
          resetFrom(next);
        }}
      />

      {/* Read off the carrier record rather than copied onto the load, for the
          same reason as PartyContact: a phone number is only useful if it is
          the current one. Edited on the carrier page. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div>
          <p data-es className={viewLabelCls}>Main Contact</p>
          {contact?.name ? (
            <p className="text-sm text-gray-900 flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span>{contact.name}</span>
              {contact.title && (
                <span className="inline-flex px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 text-xs font-medium">
                  {contact.title}
                </span>
              )}
            </p>
          ) : <p className="text-sm text-gray-900">—</p>}
        </div>
        <div>
          <p data-es className={viewLabelCls}>Contact Phone</p>
          <p className="text-sm text-gray-900">
            {contact?.phone
              ? <PhoneValue value={contact.phone} region={contact.phoneRegion} label="carrier contact phone" />
              : '—'}
          </p>
        </div>
        <div className="min-w-0">
          <p data-es className={viewLabelCls}>Contact Email</p>
          {contact?.email ? (
            <p className="text-sm text-gray-900 group flex min-w-0">
              <CopyValue value={contact.email} label="email address">
                <a href={`mailto:${contact.email}`} className="truncate text-brand-600 hover:underline">
                  {contact.email}
                </a>
              </CopyValue>
            </p>
          ) : <p className="text-sm text-gray-900">—</p>}
        </div>
      </div>

      {driverRow}

      {wide ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {certificate}
          {insurance}
        </div>
      ) : (
        <>
          {certificate}
          <div className={`grid grid-cols-1 sm:grid-cols-2 gap-3 ${canEdit ? '' : 'text-sm'}`}>{insurance}</div>
        </>
      )}

      {dirty && (
        <div className="flex gap-2">
          <button type="button" onClick={handleSave} disabled={saving}
            className="px-3 py-1.5 bg-brand-600 text-white text-xs font-semibold rounded-lg hover:bg-brand-700 disabled:opacity-50 transition">
            {saving ? 'Saving…' : 'Save to carrier'}
          </button>
          <button type="button" disabled={saving}
            onClick={() => { resetFrom(carrier); setError(''); }}
            className="px-3 py-1.5 border border-gray-300 text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-50 transition">
            Undo
          </button>
        </div>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
