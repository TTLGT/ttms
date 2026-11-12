'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import AddressFields from '@/components/orders/AddressFields';
import PhoneField from '@/components/PhoneField';
import MoneyInput from '@/components/MoneyInput';
import { Bi } from '@/components/spanish/Es';
import WebLinksField from '@/components/WebLinksField';
import { webLinksOf } from '@/types/webLinks';
import { createProvider, updateProvider, ProviderExistsError, type ProviderInput } from '@/lib/providers';
import { blankAddress } from '@/types/partyAddress';
import {
  PROVIDER_SERVICES, PROVIDER_SERVICE_LABEL, RATE_UNITS, RATE_UNIT_LABEL, providerProblem,
  type Provider, type ProviderRate, type ProviderService, type RateUnit,
} from '@/types/provider';

const INPUT = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400';
const LABEL = 'block text-xs font-medium text-gray-600 mb-1';

export function blankProvider(services: ProviderService[] = []): ProviderInput {
  return {
    companyName: '', services, serviceNote: '', contactName: '',
    phone: '', phoneRegion: undefined, phone2: '', phone2Region: undefined,
    email: '', website: '', webLinks: [], address: blankAddress(), serviceArea: '', rates: [], notes: '',
  };
}

export function providerInputOf(p: Provider): ProviderInput {
  return {
    companyName: p.companyName, services: p.services, serviceNote: p.serviceNote, contactName: p.contactName,
    phone: p.phone, phoneRegion: p.phoneRegion, phone2: p.phone2, phone2Region: p.phone2Region,
    email: p.email, website: p.website, webLinks: webLinksOf(p), address: { ...blankAddress(), ...p.address }, serviceArea: p.serviceArea,
    rates: p.rates, notes: p.notes,
  };
}

let rateKey = 0;
function newRate(service: ProviderService): ProviderRate {
  rateKey += 1;
  return { id: `new${rateKey}`, service, description: '', amount: null, unit: 'flat' };
}

/**
 * Adding or editing one 3rd-party provider: what they do, where, how to reach
 * them and what they charge. Used by the directory's Add page, the
 * provider's own page and the order form's "Add a provider".
 *
 * `onExisting` is told when the name is already in the directory, so the
 * caller can offer that one instead of a second copy.
 */
export default function ProviderForm({ initial, providerId, onSaved, onCancel, onExisting, compact = false }: {
  initial: ProviderInput;
  /** Set when editing; absent when adding. */
  providerId?: string;
  onSaved: (p: Provider) => void;
  onCancel?: () => void;
  onExisting?: (existingId: string) => void;
  /** Fewer boxes, for the order form: rates and notes can wait for the provider's page. */
  compact?: boolean;
}) {
  const [v, setV] = useState<ProviderInput>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [existingId, setExistingId] = useState('');
  const set = <K extends keyof ProviderInput>(k: K, value: ProviderInput[K]) => setV((prev) => ({ ...prev, [k]: value }));

  function toggle(s: ProviderService) {
    set('services', v.services.includes(s) ? v.services.filter((x) => x !== s) : [...v.services, s]);
  }
  function setRate(id: string, change: Partial<ProviderRate>) {
    set('rates', v.rates.map((r) => (r.id === id ? { ...r, ...change } : r)));
  }

  async function save() {
    const input = { ...v, companyName: v.companyName.trim() };
    const problem = providerProblem({ ...input, phone: input.phone.trim(), email: input.email.trim() });
    if (problem) { setError(problem); return; }
    setSaving(true);
    setError('');
    setExistingId('');
    try {
      onSaved(providerId ? await updateProvider(providerId, input) : await createProvider(input));
    } catch (e) {
      if (e instanceof ProviderExistsError) {
        setExistingId(e.existingId);
        onExisting?.(e.existingId);
      }
      setError(e instanceof Error ? e.message : 'Could not save the provider');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label data-es className={LABEL}>Company or crew name</label>
          <input value={v.companyName} maxLength={120} onChange={(e) => set('companyName', e.target.value)} className={INPUT} />
        </div>
        <div className="sm:col-span-2">
          <p data-es className={LABEL}>Services</p>
          <div className="flex flex-wrap gap-2">
            {PROVIDER_SERVICES.map((s) => {
              const on = v.services.includes(s);
              return (
                <button key={s} type="button" role="checkbox" aria-checked={on} data-es onClick={() => toggle(s)}
                  className={`px-3 py-1.5 rounded-lg border text-xs transition ${
                    on ? 'border-brand-300 bg-brand-50 text-brand-800 font-semibold' : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'}`}>
                  {PROVIDER_SERVICE_LABEL[s]}
                </button>
              );
            })}
          </div>
          {(v.services.includes('other') || v.serviceNote) && (
            <input value={v.serviceNote} maxLength={200} onChange={(e) => set('serviceNote', e.target.value)}
              placeholder="What else, e.g. Pallet exchange, Reefer washout" aria-label="Other services" className={`${INPUT} mt-2`} />
          )}
        </div>
        <div>
          <label data-es className={LABEL}>Contact name</label>
          <input value={v.contactName} maxLength={120} onChange={(e) => set('contactName', e.target.value)} className={INPUT} />
        </div>
        <div>
          <label data-es className={LABEL}>Email</label>
          <input type="email" value={v.email} maxLength={160} onChange={(e) => set('email', e.target.value)} className={INPUT} />
        </div>
        <PhoneField label="Phone" value={v.phone} region={v.phoneRegion}
          onChange={(phone, phoneRegion) => setV((prev) => ({ ...prev, phone, phoneRegion }))} />
        {!compact && (
          <PhoneField label="Second phone" value={v.phone2} region={v.phone2Region}
            onChange={(phone2, phone2Region) => setV((prev) => ({ ...prev, phone2, phone2Region }))} />
        )}
        {!compact && (
          <div className="sm:col-span-2">
            <WebLinksField value={v.webLinks} onChange={(webLinks) => set('webLinks', webLinks)} />
          </div>
        )}
      </div>

      <AddressFields label="Address" value={v.address} onChange={(a) => set('address', a)} />
      <div>
        <label data-es className={LABEL}>Where they work</label>
        <input value={v.serviceArea} maxLength={200} onChange={(e) => set('serviceArea', e.target.value)}
          placeholder="e.g. Dallas–Fort Worth and 100 miles around" className={INPUT} />
      </div>

      {!compact && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p data-es className="text-sm font-semibold text-gray-700">Prices</p>
            <button type="button" onClick={() => set('rates', [...v.rates, newRate(v.services[0] ?? 'other')])}
              className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700">
              <Plus className="w-3.5 h-3.5" aria-hidden /> <span data-es>Add a price</span>
            </button>
          </div>
          {v.rates.length === 0 ? (
            <p className="text-xs text-gray-500"><Bi>No prices yet. Add what they quoted, so the next person knows what to expect.</Bi></p>
          ) : (
            <div className="space-y-2">
              {v.rates.map((r) => (
                <div key={r.id} className="grid grid-cols-1 sm:grid-cols-[10rem_minmax(0,1fr)_8rem_8rem_auto] gap-2 items-center">
                  <select value={r.service} onChange={(e) => setRate(r.id, { service: e.target.value as ProviderService })}
                    aria-label="Service" className={INPUT}>
                    {PROVIDER_SERVICES.map((s) => <option key={s} value={s}>{PROVIDER_SERVICE_LABEL[s]}</option>)}
                  </select>
                  <input value={r.description} maxLength={160} placeholder="e.g. Floor load, 53' trailer"
                    onChange={(e) => setRate(r.id, { description: e.target.value })} aria-label="What it is for" className={INPUT} />
                  <MoneyInput value={r.amount == null ? '' : String(r.amount)} aria-label="Amount"
                    onChange={(raw) => setRate(r.id, { amount: raw.trim() === '' ? null : Number(raw.replace(/,/g, '')) })}
                    className={INPUT} placeholder="$" />
                  <select value={r.unit} onChange={(e) => setRate(r.id, { unit: e.target.value as RateUnit })}
                    aria-label="Charged" className={INPUT}>
                    {RATE_UNITS.map((u) => <option key={u} value={u}>{RATE_UNIT_LABEL[u]}</option>)}
                  </select>
                  <button type="button" aria-label="Remove price" onClick={() => set('rates', v.rates.filter((x) => x.id !== r.id))}
                    className="p-2 text-gray-400 hover:text-red-600">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!compact && (
        <div>
          <label data-es className={LABEL}>Notes</label>
          <textarea value={v.notes} rows={3} maxLength={4000} onChange={(e) => set('notes', e.target.value)}
            placeholder="Hours, how they want to be paid, who to ask for…" className={INPUT} />
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600">
          {error}
          {existingId && !onExisting && (
            <a href={`/dashboard/providers/${existingId}`} className="ml-2 font-semibold underline">Open it</a>
          )}
        </div>
      )}

      <div className="flex gap-3">
        <button type="button" onClick={save} disabled={saving} data-es
          className="px-4 py-2 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 disabled:opacity-50">
          {saving ? 'Saving…' : providerId ? 'Save' : 'Add provider'}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} data-es
            className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50">
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
