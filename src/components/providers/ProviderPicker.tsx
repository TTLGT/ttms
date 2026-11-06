'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { HardHat, Plus, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { can } from '@/lib/accessControl';
import { listProviders } from '@/lib/providers';
import ProviderForm, { blankProvider } from './ProviderForm';
import { Bi } from '@/components/spanish/Es';
import { PROVIDER_SERVICE_LABEL, providerMatches, type Provider, type ProviderService } from '@/types/provider';

const INPUT = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400';

/** One read of the directory per page, shared by both ends of the load. */
let cache: Promise<Provider[]> | null = null;
function directory(): Promise<Provider[]> {
  cache ??= listProviders().catch((e) => { cache = null; throw e; });
  return cache;
}

export interface ProviderChoice {
  providerId?: string;
  providerName?: string;
}

/**
 * Which provider from the 3rd-party directory does the work at one end of
 * a load — offered under Loading and Unloading once "3rd party" is chosen.
 * Optional: the dock answer is what the SA needs; this is who to call.
 *
 * Lists the providers offering that service first, and finds any of them by
 * name, city, state or phone. "Add a provider" opens the directory's own
 * form over the page — portalled to `<body>`, because inside the order
 * `<form>` an Enter in one of its boxes would save the order.
 */
export default function ProviderPicker({ service, near, value, onChange }: {
  service: ProviderService | null;
  /** The state of the stop, so providers there come first. */
  near?: string;
  value: ProviderChoice;
  onChange: (v: ProviderChoice) => void;
}) {
  const { profile } = useAuth();
  const [providers, setProviders] = useState<Provider[] | null>(null);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);

  useEffect(() => { directory().then(setProviders).catch(() => setProviders([])); }, []);

  const list = useMemo(() => {
    const state = (near ?? '').trim().toUpperCase();
    return (providers ?? [])
      .filter((p) => providerMatches(p, q))
      .sort((a, b) => {
        const rank = (p: Provider) =>
          (service && p.services.includes(service) ? 2 : 0) + (state && p.address?.state?.toUpperCase() === state ? 1 : 0);
        return rank(b) - rank(a) || a.companyName.localeCompare(b.companyName);
      })
      .slice(0, 8);
  }, [providers, q, service, near]);

  if (value.providerId) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm">
        <span className="flex items-center gap-2 min-w-0">
          <HardHat className="w-4 h-4 text-brand-600 shrink-0" aria-hidden />
          <Link href={`/dashboard/providers/${value.providerId}`} target="_blank"
            className="font-semibold text-brand-800 hover:underline truncate">{value.providerName || 'Provider'}</Link>
        </span>
        <button type="button" aria-label="Clear provider" onClick={() => onChange({})}
          className="p-1 text-gray-400 hover:text-gray-700"><X className="w-4 h-4" /></button>
      </div>
    );
  }

  return (
    <div className="relative">
      <input value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Search the 3rd party directory (optional)" aria-label="3rd party provider" className={INPUT} />
      {open && (
        <ul className="absolute z-20 mt-1 w-full max-h-72 overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg text-sm">
          {providers === null && <li className="px-3 py-2 text-gray-400">Loading…</li>}
          {list.map((p) => (
            <li key={p.id}>
              <button type="button" onMouseDown={(e) => e.preventDefault()}
                onClick={() => { onChange({ providerId: p.id, providerName: p.companyName }); setQ(''); setOpen(false); }}
                className="w-full text-left px-3 py-2 hover:bg-gray-50">
                <span className="font-medium text-gray-900">{p.companyName}</span>
                <span className="block text-xs text-gray-500">
                  {[p.services.map((s) => PROVIDER_SERVICE_LABEL[s]).join(', '), [p.address?.city, p.address?.state].filter(Boolean).join(', '), p.phone]
                    .filter(Boolean).join(' · ')}
                </span>
              </button>
            </li>
          ))}
          {providers !== null && list.length === 0 && (
            <li className="px-3 py-2 text-gray-400"><Bi>No provider matches.</Bi></li>
          )}
          {can(profile, 'orders.view') && (
            <li className="border-t border-gray-100">
              <button type="button" onMouseDown={(e) => e.preventDefault()}
                onClick={() => { setAdding(true); setOpen(false); }}
                className="w-full text-left px-3 py-2 text-brand-700 font-medium hover:bg-gray-50 inline-flex items-center gap-1">
                <Plus className="w-4 h-4" aria-hidden /> <span data-es>Add a provider</span>
              </button>
            </li>
          )}
        </ul>
      )}

      {adding && createPortal(
        <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center overflow-y-auto p-4" role="dialog" aria-modal>
          <div className="bg-white rounded-xl border border-gray-200 shadow-xl w-full max-w-2xl p-6 my-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900"><Bi>Add a 3rd party provider</Bi></h2>
              <button type="button" aria-label="Close" onClick={() => setAdding(false)} className="p-1 text-gray-400 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <ProviderForm compact
              initial={{ ...blankProvider(service ? [service] : []), companyName: q.trim() }}
              onSaved={(p) => {
                cache = null;
                setProviders((prev) => [...(prev ?? []), p]);
                onChange({ providerId: p.id, providerName: p.companyName });
                setAdding(false);
                setQ('');
              }}
              onExisting={(existingId) => {
                const found = providers?.find((x) => x.id === existingId);
                if (found) { onChange({ providerId: found.id, providerName: found.companyName }); setAdding(false); }
              }}
              onCancel={() => setAdding(false)} />
            <p className="text-xs text-gray-500 mt-3">
              <Bi>Prices, a second phone and notes can be added on the provider&apos;s own page afterwards.</Bi>
            </p>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
