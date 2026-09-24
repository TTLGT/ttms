'use client';

import { useEffect, useState } from 'react';
import { Timestamp } from 'firebase/firestore';
import { getCarrier, updateCarrier } from '@/lib/carriers';
import { carrierMainContact, carrierNumber, formatCoverage, getInsuranceStatus, parseCoverageInput } from '@/types/carrier';
import type { Carrier } from '@/types/carrier';
import { useAuth } from '@/context/AuthContext';
import { useDateFormatters } from '@/lib/useDateFormatters';
import DateField from '@/components/DateField';
import CopyValue from '@/components/CopyValue';
import PhoneValue from '@/components/PhoneValue';
import InsuranceFileUpload from './InsuranceFileUpload';

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
 * expires and the amount it covers.
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
}: {
  carrierId: string;
  /** The carrier's name, drawn first on the top row beside MC and DOT. */
  nameCell?: React.ReactNode;
  /** The load's driver, drawn between the carrier's contact and its insurance. */
  driverRow?: React.ReactNode;
}) {
  const { can } = useAuth();
  const { formatDate } = useDateFormatters();
  const [carrier, setCarrier] = useState<Carrier | null>(null);
  const [loaded, setLoaded]   = useState(false);
  const [error, setError]     = useState('');
  const [mc, setMc]             = useState('');
  const [dot, setDot]           = useState('');
  const [expiry, setExpiry]     = useState('');
  const [coverage, setCoverage] = useState('');
  const [saving, setSaving]     = useState(false);

  const canEdit = can('carriers.edit');

  function resetFrom(c: Carrier | null) {
    setMc(c?.mc ?? '');
    setDot(c?.dot ?? '');
    setExpiry(toDateInput(c?.insuranceExpiration));
    setCoverage(coverageInput(c?.insuranceCoverage));
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
      setError('The coverage amount should be a number, like 1,000,000.');
      return;
    }
    setError('');
    setSaving(true);
    const updates: Partial<Carrier> = {
      insuranceExpiration: expiry ? Timestamp.fromDate(new Date(expiry)) : null,
      insuranceCoverage:   parsed,
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
    || coverage !== coverageInput(carrier.insuranceCoverage);

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
          <p className={`text-sm text-gray-400 ${wide ? '' : 'py-2'}`}>Not on record</p>
        )}
      </div>
    );
  }

  const certificate = (
    <div>
      <p className={fieldLabelCls}>Certificate of Insurance</p>
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
        <label className={fieldLabelCls}>Insurance Expiration</label>
        <DateField value={expiry} onChange={setExpiry} className={inputCls} />
        {status === 'expired' && expiry === toDateInput(carrier.insuranceExpiration) && (
          <p className="text-xs text-red-600 font-medium mt-1">Expired</p>
        )}
        {status === 'expiring_soon' && expiry === toDateInput(carrier.insuranceExpiration) && (
          <p className="text-xs text-amber-700 mt-1">Expires within 30 days</p>
        )}
      </div>
      <div>
        <label className={fieldLabelCls}>Coverage Amount (USD)</label>
        <input type="text" inputMode="numeric" value={coverage}
          onChange={(e) => setCoverage(e.target.value)} onKeyDown={saveOnEnter}
          placeholder="e.g. 1,000,000" className={inputCls} />
      </div>
    </>
  ) : (
    <>
      <div className="text-sm">
        <p className={fieldLabelCls}>Insurance Expiration</p>
        <p className={statusCls}>
          {carrier.insuranceExpiration
            ? <>{formatDate(carrier.insuranceExpiration)}{status === 'expired' && ' — expired'}</>
            : <span className="text-gray-400">Not on record</span>}
        </p>
      </div>
      <div className="text-sm">
        <p className={fieldLabelCls}>Coverage Amount</p>
        <p className="text-gray-900">
          {formatCoverage(carrier.insuranceCoverage) || <span className="text-gray-400">Not on record</span>}
        </p>
      </div>
    </>
  );

  return (
    <div className={wide ? 'space-y-6' : 'space-y-4'}>
      <div className={rowCls}>
        {wide && nameCell}
        {numberField('MC', mcOnFile, mc, setMc, 'Not on record — e.g. 123456')}
        {numberField('DOT', dotOnFile, dot, setDot, 'Not on record — e.g. 1234567')}
      </div>

      {/* Read off the carrier record rather than copied onto the load, for the
          same reason as PartyContact: a phone number is only useful if it is
          the current one. Edited on the carrier page. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div>
          <p className={viewLabelCls}>Main Contact</p>
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
          <p className={viewLabelCls}>Contact Phone</p>
          <p className="text-sm text-gray-900">
            {contact?.phone
              ? <PhoneValue value={contact.phone} region={contact.phoneRegion} label="carrier contact phone" />
              : '—'}
          </p>
        </div>
        <div className="min-w-0">
          <p className={viewLabelCls}>Contact Email</p>
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
