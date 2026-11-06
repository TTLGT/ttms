'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { HardHat } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { can } from '@/lib/accessControl';
import { getProvider, listProviderHistory } from '@/lib/providers';
import ProviderForm, { providerInputOf } from '@/components/providers/ProviderForm';
import ProviderPayments from '@/components/providers/ProviderPayments';
import ChangeHistory from '@/components/history/ChangeHistory';
import PhoneValue from '@/components/PhoneValue';
import CopyLinkButton from '@/components/CopyLinkButton';
import { Bi } from '@/components/spanish/Es';
import { addressLine } from '@/types/partyAddress';
import { PROVIDER_SERVICE_LABEL, rateText, type Provider } from '@/types/provider';

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt data-es className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</dt>
      <dd className="mt-1 text-gray-800">{value || <span className="text-gray-300">—</span>}</dd>
    </div>
  );
}

/** One 3rd-party provider: details, prices, payments with receipts, and its change log. */
export default function ProviderPage() {
  const { providerId } = useParams<{ providerId: string }>();
  const router = useRouter();
  const { profile } = useAuth();
  const mayWork = can(profile, 'orders.view');
  const [provider, setProvider] = useState<Provider | null>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(0);

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
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl">
      <Link href="/dashboard/providers" className="text-sm text-gray-500 hover:text-gray-700">← <span data-es>Back to 3rd Party Providers</span></Link>
      <div className="flex flex-wrap items-start justify-between gap-3 mt-2 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <HardHat className="w-6 h-6 text-gray-500" aria-hidden /> {p.companyName}
          </h1>
          <div className="flex flex-wrap gap-1 mt-2">
            {p.services.map((s) => (
              <span key={s} data-es className="px-2 py-0.5 rounded-full bg-brand-50 text-xs font-medium text-brand-800">{PROVIDER_SERVICE_LABEL[s]}</span>
            ))}
            {p.serviceNote && <span className="px-2 py-0.5 rounded-full bg-gray-100 text-xs text-gray-700">{p.serviceNote}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <CopyLinkButton />
          {mayWork && !editing && (
            <button type="button" onClick={() => setEditing(true)} data-es
              className="px-4 py-2 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700">
              Edit
            </button>
          )}
        </div>
      </div>

      {editing ? (
        <section className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <ProviderForm initial={providerInputOf(p)} providerId={p.id}
            onSaved={(next) => { setProvider(next); setEditing(false); setSaved((n) => n + 1); }}
            onCancel={() => setEditing(false)}
            onExisting={(id) => router.push(`/dashboard/providers/${id}`)} />
        </section>
      ) : (
        <>
          <section className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
            <dl className="grid grid-cols-1 sm:grid-cols-3 gap-y-4 gap-x-6 text-sm">
              <Detail label="Contact" value={p.contactName} />
              <Detail label="Phone" value={p.phone && <PhoneValue value={p.phone} region={p.phoneRegion} />} />
              <Detail label="Second phone" value={p.phone2 && <PhoneValue value={p.phone2} region={p.phone2Region} label="second phone" />} />
              <Detail label="Email" value={p.email && <a href={`mailto:${p.email}`} className="text-brand-700 hover:underline">{p.email}</a>} />
              <Detail label="Website" value={p.website && (
                <a href={/^https?:\/\//i.test(p.website) ? p.website : `https://${p.website}`} target="_blank" rel="noreferrer"
                  className="text-brand-700 hover:underline break-all">{p.website}</a>
              )} />
              <Detail label="Address" value={addressLine(p.address)} />
              <Detail label="Where they work" value={p.serviceArea} />
              <Detail label="Added by" value={p.createdByName} />
            </dl>
            {p.notes && (
              <div className="mt-5 pt-5 border-t border-gray-100">
                <p data-es className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Notes</p>
                <p className="text-sm text-gray-700 whitespace-pre-line">{p.notes}</p>
              </div>
            )}
          </section>

          <section className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-1"><Bi>Prices</Bi></h2>
            <p className="text-xs text-gray-500 mb-3"><Bi>What they last quoted us. A guide for the next booking, not a contract.</Bi></p>
            {p.rates.length === 0 ? (
              <p className="text-sm text-gray-400"><Bi>No prices recorded.</Bi></p>
            ) : (
              <table className="min-w-full text-sm">
                <tbody className="divide-y divide-gray-100">
                  {p.rates.map((r) => (
                    <tr key={r.id}>
                      <td className="py-2 pr-4 text-gray-600 whitespace-nowrap">{PROVIDER_SERVICE_LABEL[r.service]}</td>
                      <td className="py-2 pr-4 text-gray-800">{r.description}</td>
                      <td className="py-2 text-right font-semibold text-gray-900 whitespace-nowrap">{rateText(r)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}

      {mayWork && <ProviderPayments provider={p} onTotals={() => { reload(); setSaved((n) => n + 1); }} />}

      <section className="bg-white rounded-xl border border-gray-200 p-6">
        <ChangeHistory load={() => listProviderHistory(p.id)} refreshKey={saved} />
      </section>
    </div>
  );
}
