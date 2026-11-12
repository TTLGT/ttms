'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import WebLinksList from '@/components/WebLinksList';
import { webLinksOf } from '@/types/webLinks';
import { Contact, HardHat, History, PencilLine, StickyNote, Tag } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { can } from '@/lib/accessControl';
import { getProvider, listProviderHistory } from '@/lib/providers';
import ProviderForm, { providerInputOf } from '@/components/providers/ProviderForm';
import ProviderPayments from '@/components/providers/ProviderPayments';
import ChangeHistory from '@/components/history/ChangeHistory';
import PhoneValue from '@/components/PhoneValue';
import CopyLinkButton from '@/components/CopyLinkButton';
import { Bi } from '@/components/spanish/Es';
import OrderSection from '@/components/orders/OrderSection';
import OrderSidePanel, { RailItem } from '@/components/orders/OrderSidePanel';
import RecordHero, { AttentionCard, HeroBadge, RailCard, RecordColumns } from '@/components/records/RecordHero';
import type { Attention } from '@/components/records/RecordHero';
import { useDateFormatters } from '@/lib/useDateFormatters';
import { addressLine } from '@/types/partyAddress';
import { PROVIDER_SERVICE_LABEL, rateText, type Provider } from '@/types/provider';

const usd = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt data-es className="text-xs text-gray-500 mb-0.5">{label}</dt>
      <dd className="text-sm text-gray-900">{value || <span className="text-gray-300">—</span>}</dd>
    </div>
  );
}

/**
 * One 3rd-party provider, laid out like the order and carrier pages: who they
 * are and what we have paid them at the top, the record on the left, and on
 * the right what is missing and how to reach them.
 *
 * The totals in the header are the ones the payment routes keep on the
 * provider (`totalPaid`, `paymentCount`, `lastPaidOn`), so the header reads
 * nothing the page did not already have.
 */
export default function ProviderPage() {
  const { providerId } = useParams<{ providerId: string }>();
  const router = useRouter();
  const { profile } = useAuth();
  const { formatCalendarDate } = useDateFormatters();
  const mayWork = can(profile, 'orders.view');
  const [provider, setProvider] = useState<Provider | null>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(0);
  const [historyOpen, setHistoryOpen] = useState(false);

  const reload = useCallback(() => {
    getProvider(providerId).then(setProvider).catch((e) => setError(e instanceof Error ? e.message : 'Could not load the provider'));
  }, [providerId]);
  useEffect(reload, [reload]);

  if (error) {
    return (
      <div className="p-8">
        <p className="text-sm text-red-600">{error}</p>
        <Link href="/dashboard/providers" className="text-sm text-brand-600 hover:underline">← Back to 3rd Party Providers</Link>
      </div>
    );
  }
  if (!provider) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const p = provider;
  const place = [p.address?.city, p.address?.state].filter(Boolean).join(', ');
  const edit = mayWork ? () => setEditing(true) : undefined;

  const attention: Attention[] = [];
  if (!p.phone && !p.phone2) attention.push({ id: 'phone', level: 'warn', title: 'No phone on file', sub: 'Nobody can call them from here.', onClick: edit });
  if (!p.email) attention.push({ id: 'email', level: 'info', title: 'No email on file', onClick: edit });
  if (!p.address?.city && !p.serviceArea) attention.push({ id: 'where', level: 'warn', title: 'No location or service area', sub: 'They will not turn up when somebody filters by state or city.', onClick: edit });
  if (p.rates.length === 0) attention.push({ id: 'rates', level: 'info', title: 'No prices recorded', sub: 'What they last quoted, as a guide for the next booking.', onClick: edit });

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl">
      <Link href="/dashboard/providers" className="text-sm text-gray-500 hover:text-gray-700">← <span data-es>Back to 3rd Party Providers</span></Link>

      <div className="mt-2">
        <RecordHero
          icon={HardHat}
          iconTone="bg-amber-50 text-amber-600"
          band="from-amber-500 via-orange-500 to-rose-500"
          title={p.companyName}
          badges={<>
            {p.services.map((s) => <HeroBadge key={s} tone="brand"><span data-es>{PROVIDER_SERVICE_LABEL[s]}</span></HeroBadge>)}
            {p.serviceNote && <HeroBadge>{p.serviceNote}</HeroBadge>}
          </>}
          sub={[place, p.serviceArea].filter(Boolean).join(' · ') || undefined}
          actions={<>
            <CopyLinkButton />
            {mayWork && !editing && (
              <button type="button" onClick={() => setEditing(true)} data-es
                className="px-4 py-2 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700">
                Edit
              </button>
            )}
          </>}
          stats={[
            { label: 'Paid, all time', value: p.totalPaid ? usd(p.totalPaid) : '—', emphasis: true },
            { label: 'Payments', value: (p.paymentCount ?? 0).toLocaleString() },
            { label: 'Last paid', value: p.lastPaidOn ? formatCalendarDate(p.lastPaidOn) : '—' },
            { label: 'Prices on file', value: p.rates.length.toLocaleString() },
          ]}
        />
      </div>

      <RecordColumns rail={<>
        <AttentionCard items={attention} allClear="Nothing missing. Contact, location and prices are on file." />

        <RailCard title="Quick contact">
          <div className="space-y-1.5 text-sm text-gray-800">
            {p.contactName && <p className="font-medium">{p.contactName}</p>}
            <PhoneValue value={p.phone} region={p.phoneRegion} />
            {p.phone2 && <PhoneValue value={p.phone2} region={p.phone2Region} label="second phone" />}
            {p.email && <a href={`mailto:${p.email}`} className="block truncate text-brand-700 hover:underline">{p.email}</a>}
            <WebLinksList links={webLinksOf(p)} compact empty={null} />
          </div>
        </RailCard>

        <RailItem title="Change log" sub={<span data-es>Every change to this provider, who made it and when</span>} icon={History} tone="gray"
          onOpen={() => setHistoryOpen(true)} />
      </>}>
        {editing ? (
          <OrderSection id="details" icon={PencilLine} tone="brand" title="Edit provider">
            <ProviderForm initial={providerInputOf(p)} providerId={p.id}
              onSaved={(next) => { setProvider(next); setEditing(false); setSaved((n) => n + 1); }}
              onCancel={() => setEditing(false)}
              onExisting={(id) => router.push(`/dashboard/providers/${id}`)} />
          </OrderSection>
        ) : (
          <>
            <OrderSection id="details" icon={Contact} tone="blue" title="Contact and location">
              <dl className="grid grid-cols-1 sm:grid-cols-3 gap-y-4 gap-x-6">
                <Detail label="Contact" value={p.contactName} />
                <Detail label="Phone" value={p.phone && <PhoneValue value={p.phone} region={p.phoneRegion} />} />
                <Detail label="Second phone" value={p.phone2 && <PhoneValue value={p.phone2} region={p.phone2Region} label="second phone" />} />
                <Detail label="Email" value={p.email && <a href={`mailto:${p.email}`} className="text-brand-700 hover:underline">{p.email}</a>} />
                <Detail label="Website and social media" value={webLinksOf(p).length > 0 && <WebLinksList links={webLinksOf(p)} />} />
                <Detail label="Address" value={addressLine(p.address)} />
                <Detail label="Where they work" value={p.serviceArea} />
                <Detail label="Added by" value={p.createdByName} />
              </dl>
            </OrderSection>

            <OrderSection id="prices" icon={Tag} tone="amber" title="Prices"
              sub={<Bi>What they last quoted us. A guide for the next booking, not a contract.</Bi>}>
              {p.rates.length === 0 ? (
                <p className="text-sm text-gray-400"><Bi>No prices recorded.</Bi></p>
              ) : (
                <table className="min-w-full text-sm">
                  <tbody className="divide-y divide-gray-100">
                    {p.rates.map((r) => (
                      <tr key={r.id}>
                        <td data-es={PROVIDER_SERVICE_LABEL[r.service]} className="py-2 pr-4 text-gray-600 whitespace-nowrap">{PROVIDER_SERVICE_LABEL[r.service]}</td>
                        <td className="py-2 pr-4 text-gray-800">{r.description}</td>
                        <td className="py-2 text-right font-semibold text-gray-900 whitespace-nowrap">{rateText(r)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </OrderSection>

            {p.notes && (
              <OrderSection id="notes" icon={StickyNote} tone="gray" title="Notes">
                <p className="text-sm text-gray-700 whitespace-pre-line">{p.notes}</p>
              </OrderSection>
            )}
          </>
        )}

        {mayWork && <ProviderPayments provider={p} onTotals={() => { reload(); setSaved((n) => n + 1); }} />}
      </RecordColumns>

      {/* Read only when opened — see ChangeHistory. Mounted only while open. */}
      <OrderSidePanel open={historyOpen} onClose={() => setHistoryOpen(false)} title="Change log" icon={History}>
        {historyOpen && <ChangeHistory load={() => listProviderHistory(p.id)} refreshKey={saved} startOpen />}
      </OrderSidePanel>
    </div>
  );
}
