'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Timestamp } from 'firebase/firestore';
import { getCarrier, listCarrierHistory, updateCarrier } from '@/lib/carriers';
import ChangeHistory from '@/components/history/ChangeHistory';
import ContactTitleSelect from '@/components/carriers/ContactTitleSelect';
import PersonNameFields from '@/components/PersonNameFields';
import { listOrders } from '@/lib/orders';
import type { Carrier } from '@/types/carrier';
import { formatCoverage, parseCoverageInput, carrierNumber, getInsuranceStatus } from '@/types/carrier';
import { fmcsaConcerns, fmcsaLevel } from '@/types/fmcsa';
import { displayStatus } from '@/types/order';
import type { Order, OrderStatus } from '@/types/order';
import OrderLink from '@/components/orders/OrderLink';
import PhoneValue from '@/components/PhoneValue';
import PhoneField from '@/components/PhoneField';
import { phoneRegionOf } from '@/lib/phone';
import type { PhoneRegion } from '@/lib/phone';
import InsuranceBadge from '@/components/carriers/InsuranceBadge';
import FmcsaPanel from '@/components/carriers/FmcsaPanel';
import InsuranceFileUpload from '@/components/carriers/InsuranceFileUpload';
import CoverageInput from '@/components/carriers/CoverageInput';
import DriverFormModal from '@/components/carriers/DriverFormModal';
import { listDriversForCarrier } from '@/lib/drivers';
import { driverDisplayName, driverNameKey, getLicenseStatus } from '@/types/driver';
import type { Driver } from '@/types/driver';
import CopyLinkButton from '@/components/CopyLinkButton';
import StatusBadge from '@/components/orders/StatusBadge';
import { useDateFormatters } from '@/lib/useDateFormatters';
import DateField from '@/components/DateField';
import { Bi } from '@/components/spanish/Es';
import { Building2, Headset, History, Package, Receipt, Shield, ShieldCheck, StickyNote, Truck, Users } from 'lucide-react';
import OrderSection from '@/components/orders/OrderSection';
import OrderSidePanel, { RailItem } from '@/components/orders/OrderSidePanel';
import RecordHero, { AttentionCard, EditBar, HeroBadge, RailCard, RecordColumns } from '@/components/records/RecordHero';
import type { Attention } from '@/components/records/RecordHero';

/** A load counted as "on the road or booked" in the header: after the quote, before delivery. */
const ACTIVE_STEPS: OrderStatus[] = ['booked', 'shipper_signed', 'carrier_signed', 'in_transit'];

function millis(value: unknown): number {
  const ts = value as { toMillis?: () => number } | null | undefined;
  return typeof ts?.toMillis === 'function' ? ts.toMillis() : 0;
}

function toDateInput(ts: { toDate?: () => Date } | null | undefined): string {
  if (!ts || typeof ts.toDate !== 'function') return '';
  const d = ts.toDate();
  return d.toISOString().split('T')[0];
}

function formatCurrency(n: number | undefined): string {
  if (!n) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400';

export default function CarrierDetailPage() {
  // Dates are written the way the company setting says — see Settings →
  // Operations → Date Format.
  const { formatDate } = useDateFormatters();
  const params    = useParams();
  const carrierId = params.carrierId as string;
  // Where "Back" goes: the load this was opened from, when it was — set by the
  // carrier link on the order page — otherwise the carriers list. Same idea as
  // `fromOrder` on a client's page.
  const fromOrder = useSearchParams().get('fromOrder');
  const back = fromOrder
    ? { href: `/dashboard/orders/${encodeURIComponent(fromOrder)}`, label: 'Back to order' }
    : { href: '/dashboard/carriers', label: 'Back to Carriers' };

  const [carrier, setCarrier]   = useState<Carrier | null>(null);
  const [orders, setOrders]     = useState<Order[]>([]);
  const [loading, setLoading]   = useState(true);
  const [editing, setEditing]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');
  // The change log opens in a side panel from the rail. It used to be a tab;
  // the page is one long record now, sections in place of tabs, so Drivers
  // and Orders are on it and only the history — read on demand — is apart.
  const [historyOpen, setHistoryOpen] = useState(false);

  // Drivers on file for this carrier, loaded with the record: their section
  // and the rail's expired-licence line both need them.
  const [drivers, setDrivers]           = useState<Driver[]>([]);
  const [editingDriver, setEditDriver]  = useState<Driver | null>(null);
  const [addingDriver, setAddingDriver] = useState(false);

  // edit fields
  const [companyName, setCompanyName]           = useState('');
  const [contactName, setContactName]           = useState('');
  const [contactTitle, setContactTitle]         = useState('');
  const [email, setEmail]                       = useState('');
  const [phone, setPhone]                       = useState('');
  const [phoneRegion, setPhoneRegion]           = useState<PhoneRegion | undefined>(undefined);
  const [address, setAddress]                   = useState('');
  const [fax, setFax]                           = useState('');
  const [dot, setDot]                           = useState('');
  const [mc, setMc]                             = useState('');
  const [dispatcher, setDispatcher]             = useState('');
  const [dispatcherPhone, setDispatcherPhone]   = useState('');
  const [dispatcherRegion, setDispatcherRegion] = useState<PhoneRegion | undefined>(undefined);
  const [dispatcherEmail, setDispatcherEmail]   = useState('');
  const [billingContact, setBillingContact]     = useState('');
  const [billingPhone, setBillingPhone]         = useState('');
  const [billingRegion, setBillingRegion]       = useState<PhoneRegion | undefined>(undefined);
  const [billingEmail, setBillingEmail]         = useState('');
  const [insProvider, setInsProvider]           = useState('');
  const [insPolicyNo, setInsPolicyNo]           = useState('');
  const [insExpiry, setInsExpiry]               = useState('');
  const [insCoverage, setInsCoverage]           = useState('');
  const [insCargo, setInsCargo]                 = useState('');
  // Not part of the edit buffer below: the certificate saves the moment it is
  // uploaded, because the file is already in the bucket by then and a Cancel
  // that dropped the reference would leave it there unreachable.
  const [insFile, setInsFile]                   = useState<string | null>(null);
  const [insFileError, setInsFileError]         = useState('');
  const [isActive, setIsActive]                 = useState(true);
  const [notes, setNotes]                       = useState('');

  function syncFields(c: Carrier) {
    setCompanyName(c.companyName);
    setContactName(c.contactName ?? '');
    setContactTitle(c.contactTitle ?? '');
    setEmail(c.email ?? '');
    setPhone(c.phone ?? '');
    setPhoneRegion(c.phoneRegion);
    setAddress(c.address ?? '');
    setFax(c.fax ?? '');
    setDot(c.dot ?? '');
    setMc(c.mc ?? '');
    setDispatcher(c.dispatcher ?? '');
    setDispatcherPhone(c.dispatcherPhone ?? '');
    setDispatcherRegion(c.dispatcherPhoneRegion);
    setDispatcherEmail(c.dispatcherEmail ?? '');
    setBillingContact(c.billingContact ?? '');
    setBillingPhone(c.billingPhone ?? '');
    setBillingRegion(c.billingPhoneRegion);
    setBillingEmail(c.billingEmail ?? '');
    setInsProvider(c.insuranceProvider ?? '');
    setInsPolicyNo(c.insurancePolicyNumber ?? '');
    setInsExpiry(toDateInput(c.insuranceExpiration));
    setInsCoverage(c.insuranceCoverage != null ? String(c.insuranceCoverage) : '');
    setInsCargo(c.insuranceCargoCoverage != null ? String(c.insuranceCargoCoverage) : '');
    setInsFile(c.insuranceStoragePath ?? null);
    setIsActive(c.isActive ?? true);
    setNotes(c.notes ?? '');
  }

  useEffect(() => {
    async function load() {
      try {
        const c = await getCarrier(carrierId);
        setCarrier(c);
        if (c) syncFields(c);
        // Asked of the server rather than filtered here. Pulling every order
        // in the company to show one carrier's loads took about seventeen
        // seconds; this is a single indexed query.
        setOrders(await listOrders({ carrierId }));
        setDrivers(await listDriversForCarrier(carrierId).catch(() => []));
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        setLoading(false);
      }
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carrierId]);

  /**
   * How many of this carrier's loads a driver has run.
   *
   * Counted off the orders already loaded for the Orders tab, so it costs no
   * further reads. Matched on `driverId` where the load has one, and on the
   * name otherwise — every load written before drivers existed names its
   * driver in text only, and those are exactly the loads worth showing here.
   */
  function loadCount(driver: Driver): number {
    const key = driverNameKey(driver.name);
    return orders.filter((o) => (
      o.driverId ? o.driverId === driver.id : driverNameKey(o.driverName ?? '') === key
    )).length;
  }

  function handleDriverSaved(saved: Driver) {
    setDrivers((prev) => {
      const without = prev.filter((d) => d.id !== saved.id);
      return [...without, saved].sort((a, b) => a.name.localeCompare(b.name));
    });
    setAddingDriver(false);
    setEditDriver(null);
  }

  /** Writes the certificate straight through — see the state note above. */
  async function handleInsuranceFile(path: string | null) {
    setInsFile(path);
    setInsFileError('');
    try {
      await updateCarrier(carrierId, { insuranceStoragePath: path });
      setCarrier((prev) => (prev ? { ...prev, insuranceStoragePath: path } : prev));
    } catch (e: unknown) {
      setInsFileError(e instanceof Error ? e.message : 'Failed to save the certificate');
    }
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const updates: Partial<Omit<Carrier, 'id' | 'createdAt'>> = {
        companyName:          companyName.trim(),
        contactName:          contactName.trim(),
        contactTitle,
        email:                email.trim(),
        phone:                phone.trim(),
        phoneRegion:          phoneRegionOf(phoneRegion),
        address:              address.trim(),
        fax:                  fax.trim(),
        dot:                  carrierNumber(dot),
        mc:                   carrierNumber(mc),
        dispatcher:           dispatcher.trim(),
        dispatcherPhone:      dispatcherPhone.trim(),
        dispatcherPhoneRegion: phoneRegionOf(dispatcherRegion),
        dispatcherEmail:      dispatcherEmail.trim(),
        billingContact:       billingContact.trim(),
        billingPhone:         billingPhone.trim(),
        billingPhoneRegion:   phoneRegionOf(billingRegion),
        billingEmail:         billingEmail.trim(),
        insuranceProvider:    insProvider.trim(),
        insurancePolicyNumber: insPolicyNo.trim(),
        insuranceExpiration:  insExpiry ? Timestamp.fromDate(new Date(insExpiry)) : null,
        insuranceCoverage:    parseCoverageInput(insCoverage),
        insuranceCargoCoverage: parseCoverageInput(insCargo),
        isActive,
        notes:                notes.trim(),
      };
      await updateCarrier(carrierId, updates);
      setCarrier((prev) => prev ? { ...prev, ...updates } as Carrier : prev);
      setEditing(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  function cancelEdit() {
    if (carrier) syncFields(carrier);
    setEditing(false);
  }

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!carrier) return (
    <div className="p-4 sm:p-6 lg:p-8">
      <p data-es className="text-gray-500">Carrier not found.</p>
      <Link href={back.href} className="text-sm text-brand-600 hover:underline mt-2 block">← {back.label}</Link>
    </div>
  );

  // The hero's numbers, off the loads already read for the Orders section —
  // no query of their own. Only loads this person can see are counted, which
  // the label says, because a broker's "12 loads" is their twelve.
  const live = orders.filter((o) => o.status !== 'cancelled');
  const activeLoads = live.filter((o) => ACTIVE_STEPS.includes(displayStatus(o.status))).length;
  const totalPay = live.reduce((sum, o) => sum + (o.carrierPay || 0), 0);
  const lastPickup = live.reduce<number>((max, o) => Math.max(max, millis(o.pickupDate)), 0);

  const insurance = getInsuranceStatus(carrier.insuranceExpiration);
  const fmcsaWorst = carrier.fmcsa
    ? fmcsaLevel(fmcsaConcerns(carrier.fmcsa, carrier.mc))
    : null;
  const expiredLicences = drivers.filter((d) => d.isActive && getLicenseStatus(d.licenseExpiration) === 'expired');

  /** Opens the editor and takes the reader to the section to fill in. */
  function editAt(id: string) {
    setEditing(true);
    setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  }

  // What is missing or out of date, worst first — see AttentionCard. Every
  // line is something a broker would otherwise find out about on a load.
  const attention: Attention[] = [];
  if (!carrier.isActive) {
    attention.push({ id: 'inactive', level: 'info', title: 'Marked inactive', sub: 'Hidden from the carrier list unless "Show inactive" is ticked.' });
  }
  if (insurance === 'expired') {
    attention.push({ id: 'ins', level: 'bad', title: 'Insurance has expired', sub: `Expired ${formatDate(carrier.insuranceExpiration as { toDate: () => Date })}.`, href: '#insurance' });
  } else if (insurance === 'expiring_soon') {
    attention.push({ id: 'ins', level: 'warn', title: 'Insurance expires soon', sub: `On ${formatDate(carrier.insuranceExpiration as { toDate: () => Date })}.`, href: '#insurance' });
  } else if (insurance === 'unknown') {
    attention.push({ id: 'ins', level: 'warn', title: 'No insurance expiry on file', onClick: () => editAt('insurance') });
  }
  if (!insFile) {
    attention.push({ id: 'coi', level: 'warn', title: 'No certificate of insurance', sub: 'Upload it in the Insurance section.', href: '#insurance' });
  }
  if (!carrier.dot && !carrier.mc) {
    attention.push({ id: 'auth', level: 'bad', title: 'No DOT or MC number', sub: 'FMCSA cannot be checked without one.', onClick: () => editAt('authority') });
  } else if (!carrier.fmcsa) {
    attention.push({ id: 'fmcsa', level: 'warn', title: 'Never checked with FMCSA', href: '#fmcsa' });
  } else if (fmcsaWorst === 'bad') {
    attention.push({ id: 'fmcsa', level: 'bad', title: 'FMCSA found a problem', sub: 'See the FMCSA check.', href: '#fmcsa' });
  } else if (fmcsaWorst === 'warn') {
    attention.push({ id: 'fmcsa', level: 'warn', title: 'FMCSA raised a concern', sub: 'See the FMCSA check.', href: '#fmcsa' });
  }
  if (expiredLicences.length) {
    attention.push({
      id: 'cdl', level: 'warn',
      title: expiredLicences.length === 1 ? 'A driver’s licence has expired' : `${expiredLicences.length} drivers’ licences have expired`,
      sub: expiredLicences.map(driverDisplayName).join(', '), href: '#drivers',
    });
  }
  if (!carrier.dispatcher && !carrier.dispatcherPhone && !carrier.dispatcherEmail) {
    attention.push({ id: 'disp', level: 'info', title: 'No dispatcher on file', onClick: () => editAt('dispatcher') });
  }
  if (!carrier.billingContact && !carrier.billingPhone && !carrier.billingEmail) {
    attention.push({ id: 'bill', level: 'info', title: 'No billing contact on file', onClick: () => editAt('billing') });
  }

  const authority = [carrier.dot && `DOT ${carrier.dot}`, carrier.mc && `MC ${carrier.mc}`].filter(Boolean).join(' · ');

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl">
      <Link href={back.href} className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 mb-4">
        ← {fromOrder ? 'Back to order' : 'Carriers'}
      </Link>

      <RecordHero
        icon={Truck}
        iconTone="bg-violet-50 text-violet-600"
        band="from-violet-500 via-indigo-500 to-blue-500"
        title={carrier.companyName}
        badges={<>
          <HeroBadge tone={carrier.isActive ? 'green' : 'gray'}>{carrier.isActive ? 'Active' : 'Inactive'}</HeroBadge>
          <InsuranceBadge expiration={carrier.insuranceExpiration} />
        </>}
        sub={<span className="font-mono">{authority || <Bi>No authority on file</Bi>}</span>}
        actions={!editing ? (
          <>
            <CopyLinkButton />
            <button onClick={() => setEditing(true)} data-es
              className="px-4 py-2 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 transition">
              Edit
            </button>
          </>
        ) : (
          <>
            <button data-es onClick={cancelEdit}
              className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition">
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving}
              className="px-4 py-2 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 disabled:opacity-50 transition">
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </>
        )}
        stats={[
          { label: 'Loads', value: live.length.toLocaleString(), note: <Bi>that you can see</Bi> },
          { label: 'On the road or booked', value: activeLoads.toLocaleString() },
          { label: 'Carrier pay, all loads', value: totalPay ? formatCurrency(totalPay) : '—', emphasis: true },
          { label: 'Last pickup', value: lastPickup ? formatDate(new Date(lastPickup)) : '—' },
        ]}
      />

      {error && <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-600 mt-4">{error}</div>}

      <RecordColumns rail={<>
        <AttentionCard items={attention} allClear="Nothing missing. Insurance, authority and contacts are on file." />

        <RailCard title="Quick contact">
          <dl className="space-y-3 text-sm">
            <RailContact label="Main" name={carrier.contactName} phone={<PhoneValue value={carrier.phone} region={carrier.phoneRegion} />} email={carrier.email} />
            {(carrier.dispatcher || carrier.dispatcherPhone || carrier.dispatcherEmail) && (
              <RailContact label="Dispatcher" name={carrier.dispatcher}
                phone={<PhoneValue value={carrier.dispatcherPhone} region={carrier.dispatcherPhoneRegion} label="dispatcher phone" />}
                email={carrier.dispatcherEmail} />
            )}
            {(carrier.billingContact || carrier.billingPhone || carrier.billingEmail) && (
              <RailContact label="Billing" name={carrier.billingContact}
                phone={<PhoneValue value={carrier.billingPhone} region={carrier.billingPhoneRegion} label="billing phone" />}
                email={carrier.billingEmail} />
            )}
          </dl>
        </RailCard>

        <RailItem title="Change log" sub={<span data-es>Every change to this carrier, who made it and when</span>} icon={History} tone="gray"
          onOpen={() => setHistoryOpen(true)} />
      </>}>
        {/* The saved numbers, not the edit boxes: a check runs against what
            is on the record, and the panel says so when they differ. */}
        <div id="fmcsa" className="scroll-mt-4">
          <FmcsaPanel
            carrierId={carrierId}
            check={carrier.fmcsa}
            dot={carrier.dot ?? ''}
            mc={carrier.mc ?? ''}
            onChecked={(fmcsa) => setCarrier((prev) => (prev ? { ...prev, fmcsa } : prev))}
            carrier={editing ? undefined : carrier}
            onFilled={(updates) => {
              const next = { ...carrier, ...updates };
              setCarrier(next);
              // The edit boxes are filled from these, and would otherwise
              // open on the blanks the fill just replaced.
              syncFields(next);
            }}
          />
        </div>

        <OrderSection id="company" icon={Building2} tone="blue" title="Company Info">
          {!editing ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              {[
                ['Contact', carrier.contactName],
                ['Contact Title', carrier.contactTitle],
                ['Phone', <PhoneValue key="phone" value={carrier.phone} region={carrier.phoneRegion} />],
                ['Email', carrier.email],
                ['Address', carrier.address],
                ['Fax', carrier.fax],
              ].map(([label, val]) => (
                <div key={label as string}>
                  <p data-es className="text-xs text-gray-500 mb-0.5">{label}</p>
                  <p className="text-sm text-gray-900">{val || '—'}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="col-span-1 sm:col-span-2">
                <label data-es className="block text-xs font-medium text-gray-600 mb-1">Company Name</label>
                <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} className={inputCls} />
              </div>
              <div className="col-span-1 sm:col-span-2">
                <PersonNameFields label="Contact" value={contactName} onChange={setContactName} />
              </div>
              <ContactTitleSelect value={contactTitle} onChange={setContactTitle} className={inputCls} />
              <PhoneField
                label="Phone"
                value={phone}
                region={phoneRegion}
                onChange={(v, r) => { setPhone(v); setPhoneRegion(r); }}
              />
              <div className="col-span-1 sm:col-span-2">
                <label data-es className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label data-es className="block text-xs font-medium text-gray-600 mb-1">Address (City, State)</label>
                <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Chicago, IL" className={inputCls} />
              </div>
              <div>
                <label data-es className="block text-xs font-medium text-gray-600 mb-1">Fax</label>
                <input type="tel" value={fax} onChange={(e) => setFax(e.target.value)} className={inputCls} />
              </div>
              <div className="col-span-1 sm:col-span-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="w-4 h-4 rounded" />
                  <span data-es className="text-sm text-gray-700">Active carrier</span>
                </label>
              </div>
            </div>
          )}
        </OrderSection>

        <OrderSection id="authority" icon={ShieldCheck} tone="indigo" title="Authority">
          {!editing ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <p data-es className="text-xs text-gray-500 mb-0.5">DOT Number</p>
                <p className="text-sm font-mono text-gray-900">{carrier.dot || '—'}</p>
              </div>
              <div>
                <p data-es className="text-xs text-gray-500 mb-0.5">MC / FF Number</p>
                <p className="text-sm font-mono text-gray-900">{carrier.mc || '—'}</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label data-es className="block text-xs font-medium text-gray-600 mb-1">DOT Number</label>
                <input value={dot} onChange={(e) => setDot(e.target.value)} placeholder="1234567" className={inputCls} />
              </div>
              <div>
                <label data-es className="block text-xs font-medium text-gray-600 mb-1">MC / FF Number</label>
                <input value={mc} onChange={(e) => setMc(e.target.value)} placeholder="123456" className={inputCls} />
              </div>
            </div>
          )}
        </OrderSection>

        {/* Dispatcher and billing sit side by side: each is three short
            lines, and a full-width box per three lines was most of the old
            page's length. Shown while empty too now, saying so — the rail
            points here when one is missing. */}
        <div className="grid gap-6 lg:grid-cols-2">
          <OrderSection id="dispatcher" icon={Headset} tone="violet" title="Dispatcher">
            {!editing ? (
              <ContactLines name={carrier.dispatcher}
                phone={<PhoneValue value={carrier.dispatcherPhone} region={carrier.dispatcherPhoneRegion} label="dispatcher phone" />}
                hasPhone={!!carrier.dispatcherPhone} email={carrier.dispatcherEmail} empty="No dispatcher on file." />
            ) : (
              <div className="space-y-4">
                <PersonNameFields label="Dispatcher" value={dispatcher} onChange={setDispatcher} />
                <PhoneField
                  label="Dispatcher Phone"
                  value={dispatcherPhone}
                  region={dispatcherRegion}
                  onChange={(v, r) => { setDispatcherPhone(v); setDispatcherRegion(r); }}
                />
                <div>
                  <label data-es className="block text-xs font-medium text-gray-600 mb-1">Dispatcher Email</label>
                  <input type="email" value={dispatcherEmail} onChange={(e) => setDispatcherEmail(e.target.value)} className={inputCls} />
                </div>
              </div>
            )}
          </OrderSection>

          <OrderSection id="billing" icon={Receipt} tone="emerald" title="Billing Contact">
            {!editing ? (
              <ContactLines name={carrier.billingContact}
                phone={<PhoneValue value={carrier.billingPhone} region={carrier.billingPhoneRegion} label="billing phone" />}
                hasPhone={!!carrier.billingPhone} email={carrier.billingEmail} empty="No billing contact on file." />
            ) : (
              <div className="space-y-4">
                <PersonNameFields label="Billing Contact" value={billingContact} onChange={setBillingContact} />
                <PhoneField
                  label="Billing Phone"
                  value={billingPhone}
                  region={billingRegion}
                  onChange={(v, r) => { setBillingPhone(v); setBillingRegion(r); }}
                />
                <div>
                  <label data-es className="block text-xs font-medium text-gray-600 mb-1">Billing Email</label>
                  <input type="email" value={billingEmail} onChange={(e) => setBillingEmail(e.target.value)} className={inputCls} />
                </div>
              </div>
            )}
          </OrderSection>
        </div>

        <OrderSection id="insurance" icon={Shield} tone="amber" title="Insurance"
          action={<InsuranceBadge expiration={carrier.insuranceExpiration} />}>
          {!editing ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div>
                <p data-es className="text-xs text-gray-500 mb-0.5">Insurance Company</p>
                <p className="text-sm text-gray-900">{carrier.insuranceProvider || '—'}</p>
              </div>
              <div>
                <p data-es className="text-xs text-gray-500 mb-0.5">Policy Number</p>
                <p className="text-sm text-gray-900">{carrier.insurancePolicyNumber || '—'}</p>
              </div>
              <div>
                <p data-es className="text-xs text-gray-500 mb-0.5">Expiration</p>
                <p className="text-sm text-gray-900">
                  {formatDate(carrier.insuranceExpiration as { toDate: () => Date } | null)}
                </p>
              </div>
              <div>
                <p data-es className="text-xs text-gray-500 mb-0.5">Liability Amount</p>
                <p className="text-sm text-gray-900">{formatCoverage(carrier.insuranceCoverage) || '—'}</p>
              </div>
              <div>
                <p data-es className="text-xs text-gray-500 mb-0.5">Cargo Amount</p>
                <p className="text-sm text-gray-900">{formatCoverage(carrier.insuranceCargoCoverage) || '—'}</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label data-es className="block text-xs font-medium text-gray-600 mb-1">Insurance Company</label>
                <input value={insProvider} onChange={(e) => setInsProvider(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label data-es className="block text-xs font-medium text-gray-600 mb-1">Policy Number</label>
                <input value={insPolicyNo} onChange={(e) => setInsPolicyNo(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label data-es className="block text-xs font-medium text-gray-600 mb-1">Expiration Date</label>
                <DateField value={insExpiry} onChange={setInsExpiry} className={inputCls} />
              </div>
              <div>
                <label data-es className="block text-xs font-medium text-gray-600 mb-1">Liability Amount</label>
                <CoverageInput value={insCoverage} onChange={setInsCoverage}
                  placeholder="e.g. 1,000,000" className={inputCls} />
              </div>
              <div>
                <label data-es className="block text-xs font-medium text-gray-600 mb-1">Cargo Amount</label>
                <CoverageInput value={insCargo} onChange={setInsCargo}
                  placeholder="e.g. 100,000" className={inputCls} />
              </div>
            </div>
          )}

          {/* Shown in both modes, and saved on the spot rather than with the
              rest of the form. */}
          <div className="mt-6 pt-4 border-t border-gray-100">
            <p data-es className="text-xs text-gray-500 mb-1.5">Certificate of Insurance</p>
            <InsuranceFileUpload
              carrierId={carrierId}
              value={insFile}
              onChange={handleInsuranceFile}
            />
            {insFileError && <p className="text-xs text-red-500 mt-1">{insFileError}</p>}
          </div>
        </OrderSection>

        {(editing || carrier.notes) && (
          <OrderSection id="notes" icon={StickyNote} tone="gray" title="Notes">
            {editing ? (
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 resize-none" />
            ) : (
              <p className="text-sm text-gray-700 whitespace-pre-line">{carrier.notes}</p>
            )}
          </OrderSection>
        )}

        {editing && <EditBar saving={saving} onSave={handleSave} onCancel={cancelEdit} />}

        <OrderSection id="drivers" icon={Users} tone="teal" title={`Drivers (${drivers.length})`}
          sub={<Bi>The people this carrier sends. Picking one on a load copies their name and phone onto it, so paperwork already sent stays as it was.</Bi>}
          action={(
            <button onClick={() => setAddingDriver(true)} data-es="+ Add Driver"
              className="px-3 py-1.5 bg-brand-600 text-white text-xs font-semibold rounded-lg hover:bg-brand-700 transition">
              + Add Driver
            </button>
          )}>
          {drivers.length === 0 ? (
            <div className="py-6 text-center">
              <p data-es className="text-sm text-gray-400">No drivers on file for this carrier yet.</p>
              <p className="text-xs text-gray-400 mt-1">
                <Bi>You can also add one while assigning this carrier to a load.</Bi>
              </p>
            </div>
          ) : (
            <div className="-mx-5 sm:-mx-6 overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100">
                <thead className="bg-gray-50">
                  <tr>
                    {['Driver', 'Phone', 'CDL', 'Licence Expires', 'Loads', ''].map((h) => (
                      <th key={h} data-es className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide first:pl-5 sm:first:pl-6">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {drivers.map((d) => {
                    const status = getLicenseStatus(d.licenseExpiration);
                    return (
                      <tr key={d.id} className={`hover:bg-gray-50 transition ${d.isActive ? '' : 'opacity-60'}`}>
                        <td className="px-4 py-3 pl-5 sm:pl-6 text-sm font-medium text-gray-900">
                          {driverDisplayName(d)}
                          {!d.isActive && <span data-es className="ml-2 text-xs font-normal text-gray-500">retired</span>}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">
                          <PhoneValue value={d.phone} region={d.phoneRegion} label="driver phone" />
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">{d.licenseNumber || '—'}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          <span className="flex items-center gap-2">
                            {formatDate(d.licenseExpiration as { toDate: () => Date } | null)}
                            {status === 'expired' && (
                              <span data-es className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-700">Expired</span>
                            )}
                            {status === 'expiring_soon' && (
                              <span data-es className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700">Expiring</span>
                            )}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">{loadCount(d)}</td>
                        <td className="px-4 py-3 text-right">
                          <button onClick={() => setEditDriver(d)} data-es
                            className="text-xs text-brand-600 hover:underline font-medium">
                            Edit
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </OrderSection>

        <OrderSection id="orders" icon={Package} tone="blue" title={`Orders (${orders.length})`}>
          {orders.length === 0 ? (
            <p data-es className="py-6 text-center text-sm text-gray-400">No orders assigned to this carrier yet.</p>
          ) : (
            <div className="-mx-5 sm:-mx-6 overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100">
                <thead className="bg-gray-50">
                  <tr>
                    {['Order #', 'Shipper', 'Route', 'Status', 'Pickup', 'Carrier Pay', ''].map((h) => (
                      <th key={h} data-es className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide first:pl-5 sm:first:pl-6">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {orders.map((o) => (
                    <tr key={o.id} className="hover:bg-gray-50 transition">
                      <td className="px-4 py-3 pl-5 sm:pl-6 text-sm"><OrderLink order={o} /></td>
                      <td className="px-4 py-3 text-sm text-gray-700">{o.shipperName || '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {o.origin?.city}, {o.origin?.state} → {o.destination?.city}, {o.destination?.state}
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={o.status} /></td>
                      <td className="px-4 py-3 text-sm text-gray-600">{formatDate(o.pickupDate as { toDate: () => Date } | null)}</td>
                      <td className="px-4 py-3 text-sm text-gray-800">{formatCurrency(o.carrierPay)}</td>
                      <td className="px-4 py-3 text-right">
                        <Link data-es href={`/dashboard/orders/${o.id}`} className="text-xs text-brand-600 hover:underline font-medium">View →</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </OrderSection>
      </RecordColumns>

      {(addingDriver || editingDriver) && (
        <DriverFormModal
          carrierId={carrierId}
          driver={editingDriver}
          onSaved={handleDriverSaved}
          onCancel={() => { setAddingDriver(false); setEditDriver(null); }}
        />
      )}

      {/* Read only when opened — see ChangeHistory. Mounted only while open,
          so a closed panel costs no reads. */}
      <OrderSidePanel open={historyOpen} onClose={() => setHistoryOpen(false)} title="Change log" icon={History}>
        {historyOpen && <ChangeHistory load={() => listCarrierHistory(carrierId)} refreshKey={carrier} startOpen />}
      </OrderSidePanel>
    </div>
  );
}

/** One contact in the rail: who, then their phone and email, each only when there is one. */
function RailContact({ label, name, phone, email }: {
  label: string;
  name?: string;
  phone: React.ReactNode;
  email?: string;
}) {
  return (
    <div>
      <dt data-es={label} className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="mt-0.5 space-y-0.5 text-gray-800">
        {name && <p className="font-medium">{name}</p>}
        <div>{phone}</div>
        {email && <a href={`mailto:${email}`} className="block truncate text-brand-700 hover:underline">{email}</a>}
      </dd>
    </div>
  );
}

/** A dispatcher's or billing contact's three lines, or a plain "none on file". */
function ContactLines({ name, phone, hasPhone, email, empty }: {
  name?: string;
  phone: React.ReactNode;
  hasPhone: boolean;
  email?: string;
  empty: string;
}) {
  if (!name && !hasPhone && !email) return <p data-es={empty} className="text-sm text-gray-400">{empty}</p>;
  return (
    <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
      <div>
        <dt data-es className="text-xs text-gray-500 mb-0.5">Name</dt>
        <dd className="text-sm text-gray-900">{name || '—'}</dd>
      </div>
      <div>
        <dt data-es className="text-xs text-gray-500 mb-0.5">Phone</dt>
        <dd className="text-sm text-gray-900">{phone}</dd>
      </div>
      <div>
        <dt data-es className="text-xs text-gray-500 mb-0.5">Email</dt>
        <dd className="text-sm text-gray-900 break-all">{email || '—'}</dd>
      </div>
    </dl>
  );
}
