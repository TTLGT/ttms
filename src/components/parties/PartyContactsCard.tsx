'use client';

import { useState } from 'react';
import { BadgeCheck, FileSignature, Mail, MapPin, Phone, Plus, Receipt, Trash2, Users, BellRing } from 'lucide-react';
import OrderSection from '@/components/orders/OrderSection';
import { Pill } from '@/components/orders/DetailBits';
import PhoneField from '@/components/PhoneField';
import PhoneValue from '@/components/PhoneValue';
import CopyValue from '@/components/CopyValue';
import { Bi } from '@/components/spanish/Es';
import { getParty, updateParty } from '@/lib/parties';
import { DEFAULT_RECORD_REGION } from '@/lib/phone';
import { CONTACT_POSITIONS, MAX_CONTACTS, saContactIndex } from '@/types/party';
import type { Contact, Party } from '@/types/party';
import { addressLine, partyLocations } from '@/types/partyAddress';

/**
 * The people at a client, shipper or consignee beyond the main contact
 * (2026-11-11): each with a title, their own email and phone, the addresses
 * they work at, and what they are for — decision maker, signs the SA, billing,
 * load updates.
 *
 * Saved as one list through the ordinary party save (updatePartyAsCaller()),
 * which cleans it with cleanContacts() — so the change log records it like
 * any other edit, and the browser never decides what is stored.
 *
 * "Signs the SA" changes where the SA is emailed: saContactIndex() is the one
 * rule, and the card says out loud who it currently picks, because that is
 * the one tick here with consequences outside TTMS.
 */

type Row = Contact & { key: string; isNew?: boolean };

let nextKey = 0;
const keyOf = () => `c${++nextKey}`;

const INPUT = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400';

const FLAGS = [
  { key: 'decisionMaker', label: 'Decision maker', hint: 'Can say yes to a rate or a new lane', Icon: BadgeCheck, tone: 'violet' },
  { key: 'saSigner',      label: 'Signs the SA',   hint: 'The SA is emailed to them instead of the main contact', Icon: FileSignature, tone: 'brand' },
  { key: 'billing',       label: 'Billing',        hint: 'Invoices and payment questions', Icon: Receipt, tone: 'emerald' },
  { key: 'updates',       label: 'Load updates',   hint: 'Gets told where their loads are', Icon: BellRing, tone: 'blue' },
] as const;
type FlagKey = (typeof FLAGS)[number]['key'];

const FLAG_PILL: Record<FlagKey, 'violet' | 'indigo' | 'emerald' | 'blue'> = {
  decisionMaker: 'violet', saSigner: 'indigo', billing: 'emerald', updates: 'blue',
};

export default function PartyContactsCard({ party, canEdit, onChange }: {
  party: Party;
  canEdit: boolean;
  onChange: (contacts: Contact[]) => void;
}) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const contacts = party.contacts ?? [];
  const locations = partyLocations(party);
  const signerIndex = saContactIndex(contacts);
  const mainEmail = (party.email || party.email2 || '').trim();

  function start() {
    setRows(contacts.map((c) => ({ ...c, key: keyOf() })));
    setError('');
  }

  function update(key: string, change: Partial<Row>) {
    setRows((rs) => (rs ?? []).map((r) => {
      if (r.key === key) return { ...r, ...change };
      // One SA signer: ticking it here unticks it everywhere else.
      if (change.saSigner === true) return { ...r, saSigner: false };
      return r;
    }));
  }

  async function save() {
    if (!rows) return;
    const bad = rows.find((r) => r.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email.trim()));
    if (bad) { setError(`"${bad.email}" does not look like an email address.`); return; }
    const signerWithoutEmail = rows.find((r) => r.saSigner && !r.email.trim());
    if (signerWithoutEmail) { setError(`${signerWithoutEmail.name || 'The SA signer'} needs an email — the SA is sent there.`); return; }
    setSaving(true);
    setError('');
    try {
      // `isNew` asks the server for an id; `key` is the form's own and dropped.
      const payload = rows.map(({ key, ...r }) => { void key; return r; });
      await updateParty(party.id, { contacts: payload as Contact[] });
      // Read back, so new contacts carry the ids the server gave them.
      const fresh = await getParty(party.id);
      onChange(fresh.status === 'ok' ? fresh.party.contacts ?? [] : payload as Contact[]);
      setRows(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the contacts');
    } finally {
      setSaving(false);
    }
  }

  const action = canEdit && !rows ? (
    <button type="button" data-es onClick={start}
      className="px-3 py-1.5 border border-gray-300 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-50">
      Edit contacts
    </button>
  ) : undefined;

  return (
    <OrderSection id="contacts" icon={Users} tone="indigo" title={`Contacts (${contacts.length + 1})`} action={action}
      sub={<Bi>Everybody we deal with there, what they do and where they work.</Bi>}>
      {!rows ? (
        <div className="space-y-3">
          {/* The record's own main contact first, so the list is everybody. */}
          <div className="rounded-xl border border-gray-200 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-gray-900">{party.contactName || '—'}</p>
              <Pill tone="gray">Main contact</Pill>
              {signerIndex < 0 && mainEmail && <Pill tone="indigo" icon={FileSignature}>Gets the SA</Pill>}
            </div>
            <ContactLines email={mainEmail} phone={party.phone} region={party.phoneRegion} />
          </div>

          {contacts.map((c, i) => (
            <div key={c.id ?? `${i}-${c.email}`} className="rounded-xl border border-gray-200 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-gray-900">{c.name || '—'}</p>
                {c.role && <span className="text-xs text-gray-500">{c.role}</span>}
                {i === signerIndex && <Pill tone="indigo" icon={FileSignature}>Gets the SA</Pill>}
                {FLAGS.filter((f) => f.key !== 'saSigner' && c[f.key]).map((f) => (
                  <Pill key={f.key} tone={FLAG_PILL[f.key]} icon={f.Icon}>{f.label}</Pill>
                ))}
              </div>
              <ContactLines email={c.email} phone={c.phone} region={c.phoneRegion} />
              {(c.addressIds ?? []).length > 0 && (
                <p className="mt-1 flex items-start gap-1.5 text-xs text-gray-600">
                  <MapPin className="w-3.5 h-3.5 mt-px shrink-0 text-gray-400" aria-hidden />
                  {(c.addressIds ?? []).map((id) => locations.find((l) => l.id === id)?.label).filter(Boolean).join(', ') || 'An address no longer on the record'}
                </p>
              )}
            </div>
          ))}

          {contacts.length === 0 && (
            <p className="text-sm text-gray-500"><Bi>Nobody else yet. Add the people you deal with — billing, the warehouse, whoever signs.</Bi></p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {rows.map((r) => (
            <div key={r.key} className="rounded-xl border border-gray-200 p-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label data-es className="block text-xs font-medium text-gray-600 mb-1">Name</label>
                  <input value={r.name} onChange={(e) => update(r.key, { name: e.target.value })} className={INPUT} />
                </div>
                <div>
                  <label data-es className="block text-xs font-medium text-gray-600 mb-1">Title or position</label>
                  <input value={r.role} list="contact-positions" onChange={(e) => update(r.key, { role: e.target.value })}
                    placeholder="Finance, Warehouse manager…" className={INPUT} />
                </div>
                <div>
                  <label data-es className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                  <input type="email" value={r.email} onChange={(e) => update(r.key, { email: e.target.value })} className={INPUT} />
                </div>
                <PhoneField label="Phone" value={r.phone} region={r.phoneRegion ?? DEFAULT_RECORD_REGION}
                  onChange={(phone, phoneRegion) => update(r.key, { phone, phoneRegion })} />
              </div>

              {locations.length > 0 && (
                <div>
                  <p data-es className="text-xs font-medium text-gray-600 mb-1.5">Works at</p>
                  <div className="flex flex-wrap gap-2">
                    {locations.map((l) => {
                      const on = (r.addressIds ?? []).includes(l.id);
                      return (
                        <button key={l.id} type="button" aria-pressed={on} title={addressLine(l.address)}
                          onClick={() => update(r.key, { addressIds: on ? (r.addressIds ?? []).filter((x) => x !== l.id) : [...(r.addressIds ?? []), l.id] })}
                          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition ${on ? 'border-brand-300 bg-brand-50 text-brand-800' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                          <MapPin className="w-3 h-3" aria-hidden /> {l.label}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-gray-400 mt-1"><Bi>None ticked means every address, or not said.</Bi></p>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {FLAGS.map((f) => (
                  <label key={f.key} className="flex items-start gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50">
                    <input type="checkbox" className="mt-0.5" checked={!!r[f.key]}
                      onChange={(e) => update(r.key, { [f.key]: e.target.checked } as Partial<Row>)} />
                    <span>
                      <span data-es className="block font-medium text-gray-800">{f.label}</span>
                      <span className="block text-xs text-gray-500"><Bi>{f.hint}</Bi></span>
                    </span>
                  </label>
                ))}
              </div>

              <div className="flex justify-end">
                <button type="button" onClick={() => setRows((rs) => (rs ?? []).filter((x) => x.key !== r.key))}
                  className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-red-600">
                  <Trash2 className="w-3.5 h-3.5" /> <span data-es>Remove</span>
                </button>
              </div>
            </div>
          ))}

          <datalist id="contact-positions">
            {CONTACT_POSITIONS.map((p) => <option key={p} value={p} />)}
          </datalist>

          {rows.length < MAX_CONTACTS && (
            <button type="button"
              onClick={() => setRows((rs) => [...(rs ?? []), { key: keyOf(), isNew: true, name: '', email: '', phone: '', role: '' }])}
              className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700">
              <Plus className="w-4 h-4" /> <span data-es>Add a contact</span>
            </button>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={save} disabled={saving}
              className="px-4 py-2 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 disabled:opacity-50">
              {saving ? 'Saving…' : 'Save contacts'}
            </button>
            <button type="button" data-es onClick={() => setRows(null)} disabled={saving}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
              Cancel
            </button>
          </div>
        </div>
      )}
    </OrderSection>
  );
}

function ContactLines({ email, phone, region }: { email?: string; phone?: string; region?: Contact['phoneRegion'] }) {
  if (!email && !phone) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1 text-sm text-gray-700">
      {phone && (
        <span className="inline-flex items-center gap-1.5">
          <Phone className="w-3.5 h-3.5 text-gray-400" aria-hidden />
          <PhoneValue value={phone} region={region} label="phone number" />
        </span>
      )}
      {email && (
        <span className="group inline-flex items-center gap-1.5 min-w-0">
          <Mail className="w-3.5 h-3.5 text-gray-400" aria-hidden />
          <CopyValue value={email} label="email address">
            <a href={`mailto:${email}`} className="truncate hover:text-brand-700 hover:underline">{email}</a>
          </CopyValue>
        </span>
      )}
    </div>
  );
}
