'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { HardHat, Plus, Search } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { can } from '@/lib/accessControl';
import { listProviders } from '@/lib/providers';
import PhoneValue from '@/components/PhoneValue';
import { Bi } from '@/components/spanish/Es';
import { useDateFormatters } from '@/lib/useDateFormatters';
import {
  PROVIDER_SERVICES, PROVIDER_SERVICE_LABEL, isProviderService, providerMatches, type Provider,
} from '@/types/provider';

const INPUT = 'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400';

/**
 * The 3rd-party provider directory: every lumper, forklift, crane and the
 * rest anybody has added, for everybody signed in. The whole list is read
 * once and searched here — it is a phone book of a few hundred entries, not
 * the order book — so a search costs no reads. See src/types/provider.ts.
 *
 * The search, service, state and city live in the URL, as on the carriers
 * list, so opening a provider and coming back returns to the same search.
 */
function ProvidersList() {
  const { profile } = useAuth();
  const { formatCalendarDate } = useDateFormatters();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [providers, setProviders] = useState<Provider[] | null>(null);
  const [error, setError] = useState('');

  const q       = params.get('q') ?? '';
  const service = params.get('service') ?? '';
  const state   = params.get('state') ?? '';
  const city    = params.get('city') ?? '';
  const mayAdd  = can(profile, 'orders.view');

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value); else next.delete(key);
    router.replace(`${pathname}${next.toString() ? `?${next}` : ''}`, { scroll: false });
  }

  useEffect(() => {
    listProviders().then(setProviders).catch((e) => setError(e instanceof Error ? e.message : 'Could not load the directory'));
  }, []);

  const states = useMemo(
    () => [...new Set((providers ?? []).map((p) => p.address?.state?.trim().toUpperCase()).filter(Boolean))].sort() as string[],
    [providers],
  );
  const cities = useMemo(
    () => [...new Set((providers ?? [])
      .filter((p) => !state || p.address?.state?.toUpperCase() === state)
      .map((p) => p.address?.city?.trim()).filter(Boolean))].sort() as string[],
    [providers, state],
  );

  const shown = (providers ?? []).filter((p) =>
    (!service || (isProviderService(service) && p.services.includes(service)))
    && (!state || p.address?.state?.toUpperCase() === state)
    && (!city || p.address?.city?.trim().toLowerCase() === city.toLowerCase())
    && providerMatches(p, q));

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <HardHat className="w-6 h-6 text-gray-500" aria-hidden /> <Bi>3rd Party Providers</Bi>
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            <Bi>Lumpers, forklifts, cranes, rigging crews, pilot cars and everyone else we hire at a dock or on the road. Everybody in the company can see and search every one.</Bi>
          </p>
        </div>
        {mayAdd && (
          <Link href="/dashboard/providers/new"
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700">
            <Plus className="w-4 h-4" aria-hidden /> <span data-es>Add provider</span>
          </Link>
        )}
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-[16rem]">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden />
          <input value={q} onChange={(e) => setParam('q', e.target.value)}
            placeholder="Search name, service, city, phone, email, address…" aria-label="Search providers"
            className={`${INPUT} w-full pl-9`} />
        </div>
        <select value={service} onChange={(e) => setParam('service', e.target.value)} aria-label="Service" className={INPUT}>
          <option data-es value="">All services</option>
          {PROVIDER_SERVICES.map((s) => <option key={s} value={s}>{PROVIDER_SERVICE_LABEL[s]}</option>)}
        </select>
        <select value={state} onChange={(e) => { setParam('state', e.target.value); setParam('city', ''); }} aria-label="State" className={INPUT}>
          <option data-es value="">All states</option>
          {states.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={city} onChange={(e) => setParam('city', e.target.value)} aria-label="City" className={INPUT}>
          <option data-es value="">All cities</option>
          {cities.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {error && <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-600 mb-4">{error}</div>}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {providers === null ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : shown.length === 0 ? (
          <div className="text-center py-14 text-sm text-gray-400">
            {providers.length === 0
              ? <Bi>No providers yet. Add the first one you hire.</Bi>
              : <Bi>No provider matches that search.</Bi>}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {['Provider', 'Services', 'Location', 'Contact', 'Phone', 'Email', 'Last paid'].map((h) => (
                    <th key={h} data-es className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {shown.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link href={`/dashboard/providers/${p.id}`} className="font-semibold text-brand-700 hover:underline">{p.companyName}</Link>
                      {p.serviceArea && <p className="text-xs text-gray-500">{p.serviceArea}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {p.services.map((s) => (
                          <span key={s} data-es className="px-2 py-0.5 rounded-full bg-gray-100 text-xs text-gray-700">{PROVIDER_SERVICE_LABEL[s]}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                      {[p.address?.city, p.address?.state].filter(Boolean).join(', ')}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{p.contactName}</td>
                    <td className="px-4 py-3 whitespace-nowrap"><PhoneValue value={p.phone} region={p.phoneRegion} /></td>
                    <td className="px-4 py-3 text-gray-700">{p.email && <a href={`mailto:${p.email}`} className="hover:underline">{p.email}</a>}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{p.lastPaidOn ? formatCalendarDate(p.lastPaidOn) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {providers && providers.length > 0 && (
        <p className="text-xs text-gray-400 mt-2">{shown.length} of {providers.length}</p>
      )}
    </div>
  );
}

export default function ProvidersPage() {
  return (
    <Suspense fallback={null}>
      <ProvidersList />
    </Suspense>
  );
}
