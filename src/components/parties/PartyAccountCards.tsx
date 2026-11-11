'use client';

import { useState } from 'react';
import { BellRing, CreditCard, Mail, Phone, Receipt } from 'lucide-react';
import OrderSection from '@/components/orders/OrderSection';
import { Pill } from '@/components/orders/DetailBits';
import PhoneValue from '@/components/PhoneValue';
import { Bi } from '@/components/spanish/Es';
import { useAuth } from '@/context/AuthContext';
import { updateParty } from '@/lib/parties';
import {
  PAYMENT_TERMS, PAYMENT_TERMS_LABEL, UPDATE_CHANNELS, UPDATE_CHANNEL_LABEL, UPDATE_FREQUENCIES,
  UPDATE_FREQUENCY_LABEL, isPaymentTerms,
} from '@/types/party';
import type { Party, PaymentTerms, UpdatePrefs } from '@/types/party';

/**
 * Two cards on a client's page (2026-11-11): how they pay us, and how they
 * want to hear about their loads. Both are read on every load of theirs
 * (the order's General card), so they live on the client, not the order.
 *
 * The people are not entered here: billing and update contacts are the
 * contacts ticked Billing or Load updates in PartyContactsCard, so one person
 * is never typed twice. These cards list them and point there.
 */

const INPUT = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400';

function EditButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" data-es onClick={onClick}
      className="px-3 py-1.5 border border-gray-300 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-50">
      Edit
    </button>
  );
}

function SaveRow({ saving, onSave, onCancel, error }: { saving: boolean; onSave: () => void; onCancel: () => void; error: string }) {
  return (
    <>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={onSave} disabled={saving}
          className="px-4 py-2 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 disabled:opacity-50">
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" data-es onClick={onCancel} disabled={saving} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
          Cancel
        </button>
      </div>
    </>
  );
}

/** The contacts ticked for one purpose, with how to reach them. */
function PeopleFor({ party, flag, none }: { party: Party; flag: 'billing' | 'updates'; none: string }) {
  const people = (party.contacts ?? []).filter((c) => c[flag]);
  if (!people.length) {
    return (
      <p className="text-xs text-gray-500">
        <Bi>{none}</Bi>{' '}
        <a href="#contacts" data-es className="text-brand-600 hover:underline">Go to Contacts</a>
      </p>
    );
  }
  return (
    <ul className="space-y-1.5">
      {people.map((c, i) => (
        <li key={c.id ?? i} className="text-sm text-gray-800">
          <span className="font-medium">{c.name || '—'}</span>
          {c.role && <span className="text-xs text-gray-500"> · {c.role}</span>}
          <span className="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-600">
            {c.email && <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1 hover:text-brand-700 hover:underline"><Mail className="w-3 h-3" />{c.email}</a>}
            {c.phone && <span className="inline-flex items-center gap-1"><Phone className="w-3 h-3" /><PhoneValue value={c.phone} region={c.phoneRegion} label="phone number" /></span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function PartyBillingCard({ party, canEdit, onChange }: {
  party: Party;
  canEdit: boolean;
  onChange: (patch: Partial<Party>) => void;
}) {
  const { can } = useAuth();
  // The server checks the same permission — see updatePartyAsCaller().
  const canCredit = can('orders.payments');
  const [draft, setDraft] = useState<{ paymentTerms: PaymentTerms | ''; creditClient: boolean; billingNotes: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    if (!draft) return;
    setSaving(true);
    setError('');
    try {
      const patch: Partial<Party> = {
        paymentTerms: draft.paymentTerms || null,
        billingNotes: draft.billingNotes,
        // Sent only by somebody allowed to change it, so an ordinary edit of
        // the terms is never refused over a flag they did not touch.
        ...(canCredit ? { creditClient: draft.creditClient } : {}),
      };
      await updateParty(party.id, patch);
      onChange(patch);
      setDraft(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <OrderSection id="billing" icon={Receipt} tone="emerald" title="Billing"
      sub={<Bi>How this client pays us and who handles their invoices.</Bi>}
      action={canEdit && !draft ? <EditButton onClick={() => setDraft({
        paymentTerms: isPaymentTerms(party.paymentTerms) ? party.paymentTerms : '',
        creditClient: party.creditClient === true,
        billingNotes: party.billingNotes ?? '',
      })} /> : undefined}>
      {!draft ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div className="space-y-3">
            <div>
              <p data-es className="text-xs font-medium text-gray-500 mb-0.5">Payment terms</p>
              <p className="text-sm text-gray-900">{isPaymentTerms(party.paymentTerms) ? PAYMENT_TERMS_LABEL[party.paymentTerms] : <span data-es className="text-gray-400">Not set</span>}</p>
            </div>
            <div>
              <p data-es className="text-xs font-medium text-gray-500 mb-0.5">Credit services</p>
              {party.creditClient
                ? <Pill tone="emerald" icon={CreditCard}>Credit client</Pill>
                : <p data-es className="text-sm text-gray-500">Not a credit client</p>}
            </div>
            {party.billingNotes?.trim() && (
              <div>
                <p data-es className="text-xs font-medium text-gray-500 mb-0.5">Billing instructions</p>
                <p className="text-sm text-gray-800 whitespace-pre-line">{party.billingNotes}</p>
              </div>
            )}
          </div>
          <div>
            <p data-es className="text-xs font-medium text-gray-500 mb-1">Billing contacts</p>
            <PeopleFor party={party} flag="billing" none="Nobody ticked Billing yet — invoices go to the main contact." />
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label data-es className="block text-xs font-medium text-gray-600 mb-1">Payment terms</label>
              <select value={draft.paymentTerms} onChange={(e) => setDraft({ ...draft, paymentTerms: e.target.value as PaymentTerms | '' })} className={INPUT}>
                <option data-es value="">Not set</option>
                {PAYMENT_TERMS.map((t) => <option key={t} value={t}>{PAYMENT_TERMS_LABEL[t]}</option>)}
              </select>
            </div>
            <label className={`flex items-start gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm ${canCredit ? 'cursor-pointer hover:bg-gray-50' : 'opacity-60'}`}>
              <input type="checkbox" className="mt-0.5" checked={draft.creditClient} disabled={!canCredit}
                onChange={(e) => setDraft({ ...draft, creditClient: e.target.checked })} />
              <span>
                <span data-es className="block font-medium text-gray-800">Credit client</span>
                <span className="block text-xs text-gray-500">
                  <Bi>{canCredit
                    ? 'Approved for our Credit services with our factoring company.'
                    : 'Approved for our Credit services with our factoring company. Only admin and finance can change this.'}</Bi>
                </span>
              </span>
            </label>
          </div>
          <div>
            <label data-es className="block text-xs font-medium text-gray-600 mb-1">Billing instructions</label>
            <textarea rows={3} value={draft.billingNotes} onChange={(e) => setDraft({ ...draft, billingNotes: e.target.value })}
              placeholder="Upload invoices to their portal, quote their PO number, send to AP and cc the buyer…" className={INPUT} />
          </div>
          <p className="text-xs text-gray-500"><Bi>Billing contacts are the people ticked Billing in Contacts.</Bi></p>
          <SaveRow saving={saving} onSave={save} onCancel={() => setDraft(null)} error={error} />
        </div>
      )}
    </OrderSection>
  );
}

export function PartyUpdatesCard({ party, canEdit, onChange }: {
  party: Party;
  canEdit: boolean;
  onChange: (patch: Partial<Party>) => void;
}) {
  const [draft, setDraft] = useState<UpdatePrefs | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const prefs = party.updatePrefs;

  async function save() {
    if (!draft) return;
    setSaving(true);
    setError('');
    try {
      await updateParty(party.id, { updatePrefs: draft });
      onChange({ updatePrefs: draft });
      setDraft(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <OrderSection id="updates" icon={BellRing} tone="blue" title="Load updates"
      sub={<Bi>How and how often this client wants to hear where their loads are.</Bi>}
      action={canEdit && !draft ? <EditButton onClick={() => setDraft({
        channels: prefs?.channels ?? [], frequency: prefs?.frequency ?? null, note: prefs?.note ?? '',
      })} /> : undefined}>
      {!draft ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div className="space-y-2 text-sm text-gray-800">
            <UpdatePrefsLine prefs={prefs} />
          </div>
          <div>
            <p data-es className="text-xs font-medium text-gray-500 mb-1">Who to update</p>
            <PeopleFor party={party} flag="updates" none="Nobody ticked Load updates yet — updates go to the main contact." />
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <p data-es className="text-xs font-medium text-gray-600 mb-1.5">How</p>
            <div className="flex flex-wrap gap-2">
              {UPDATE_CHANNELS.map((c) => {
                const on = draft.channels.includes(c);
                return (
                  <button key={c} type="button" aria-pressed={on} data-es={UPDATE_CHANNEL_LABEL[c]}
                    onClick={() => setDraft({ ...draft, channels: on ? draft.channels.filter((x) => x !== c) : [...draft.channels, c] })}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition ${on ? 'border-brand-300 bg-brand-50 text-brand-800' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                    {UPDATE_CHANNEL_LABEL[c]}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="sm:max-w-sm">
            <label data-es className="block text-xs font-medium text-gray-600 mb-1">How often</label>
            <select value={draft.frequency ?? ''} onChange={(e) => setDraft({ ...draft, frequency: (e.target.value || null) as UpdatePrefs['frequency'] })} className={INPUT}>
              <option data-es value="">Not said</option>
              {UPDATE_FREQUENCIES.map((f) => <option key={f} value={f}>{UPDATE_FREQUENCY_LABEL[f]}</option>)}
            </select>
          </div>
          <div>
            <label data-es className="block text-xs font-medium text-gray-600 mb-1">Anything else</label>
            <textarea rows={2} value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })}
              placeholder="Call before 10am Central, cc their customer, photos at pickup…" className={INPUT} />
          </div>
          <SaveRow saving={saving} onSave={save} onCancel={() => setDraft(null)} error={error} />
        </div>
      )}
    </OrderSection>
  );
}

/** "Email, Text message · At pickup and delivery", and the note — also used on the order page. */
export function UpdatePrefsLine({ prefs }: { prefs: UpdatePrefs | null | undefined }) {
  if (!prefs || (!prefs.channels.length && !prefs.frequency && !prefs.note)) {
    return <p data-es className="text-sm text-gray-400">Not said</p>;
  }
  return (
    <>
      <p className="text-sm text-gray-800">
        {[prefs.channels.map((c) => UPDATE_CHANNEL_LABEL[c]).join(', '), prefs.frequency ? UPDATE_FREQUENCY_LABEL[prefs.frequency] : '']
          .filter(Boolean).join(' · ')}
      </p>
      {prefs.note && <p className="text-xs text-gray-600 whitespace-pre-line">{prefs.note}</p>}
    </>
  );
}
