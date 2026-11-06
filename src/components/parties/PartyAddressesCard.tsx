'use client';

import { useState } from 'react';
import { MapPin, Pencil, Plus, Trash2 } from 'lucide-react';
import AddressFields from '@/components/orders/AddressFields';
import { Bi } from '@/components/spanish/Es';
import { addPartyAddress, savePartyAddresses } from '@/lib/parties';
import type { Party } from '@/types/party';
import type { Address } from '@/types/order';
import {
  MAX_LOCATION_LABEL, MAX_PARTY_ADDRESSES, addressIsBlank, addressLine, blankAddress, savedLocations,
  type PartyLocation,
} from '@/types/partyAddress';

const INPUT = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400';

/**
 * Every address a party ships from or receives at, on its own page — the
 * same list the order form offers under Shipper and Consignee. The main
 * address is edited with the party's details; the rest are added, relabelled
 * and removed here.
 *
 * Adding is open to anybody who can open the record (the same as adding one
 * from an order); changing or removing one is an edit of the party, so it
 * needs `canEdit`. Orders keep their own copy of the address they used, so
 * nothing here rewrites a load's paperwork.
 */
export default function PartyAddressesCard({ party, canEdit, onChange }: {
  party: Party;
  canEdit: boolean;
  onChange: (addresses: PartyLocation[]) => void;
}) {
  const saved = savedLocations(party);
  const [adding, setAdding]   = useState(false);
  const [draft, setDraft]     = useState<Address>(blankAddress());
  const [label, setLabel]     = useState('');
  const [editId, setEditId]   = useState<string | null>(null);
  const [edit, setEdit]       = useState<PartyLocation | null>(null);
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState('');

  async function run(fn: () => Promise<PartyLocation[]>) {
    setBusy(true);
    setError('');
    try {
      onChange(await fn());
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the address');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    const ok = await run(async () => (await addPartyAddress(party.id, draft, label)).addresses);
    if (ok) { setAdding(false); setDraft(blankAddress()); setLabel(''); }
  }

  async function saveEdit() {
    if (!edit) return;
    const ok = await run(() => savePartyAddresses(party.id, saved.map((l) => (l.id === edit.id ? edit : l))));
    if (ok) { setEditId(null); setEdit(null); }
  }

  async function remove(id: string) {
    const l = saved.find((x) => x.id === id);
    if (!l || !window.confirm(`Remove ${addressLine(l)} from this record? Loads that already used it keep their own copy.`)) return;
    await run(() => savePartyAddresses(party.id, saved.filter((x) => x.id !== id)));
  }

  return (
    <section className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-900"><Bi>Addresses</Bi></h2>
          <p className="text-xs text-gray-500 mt-0.5">
            <Bi>Where this record ships from or receives at. The order form offers every one of them under Shipper and
            Consignee, and an address typed on an order is added here.</Bi>
          </p>
        </div>
        {!adding && saved.length < MAX_PARTY_ADDRESSES && (
          <button type="button" onClick={() => setAdding(true)}
            className="shrink-0 inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700">
            <Plus className="w-4 h-4" aria-hidden /> <span data-es>Add address</span>
          </button>
        )}
      </div>

      <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
        {!addressIsBlank(party.address) && (
          <li className="flex items-start gap-3 px-4 py-3 text-sm">
            <MapPin className="w-4 h-4 mt-0.5 text-gray-400 shrink-0" aria-hidden />
            <div className="min-w-0 flex-1">
              <p data-es className="text-xs font-semibold text-gray-500">Main address</p>
              <p className="text-gray-800">{addressLine(party.address)}</p>
            </div>
            <span data-es className="text-xs text-gray-400">Edited with the details</span>
          </li>
        )}
        {saved.map((l, i) => (
          <li key={l.id} className="px-4 py-3 text-sm">
            {editId === l.id && edit ? (
              <div className="space-y-3">
                <input value={edit.label} maxLength={MAX_LOCATION_LABEL} placeholder="Label, e.g. Plant 2"
                  onChange={(e) => setEdit({ ...edit, label: e.target.value })} className={INPUT} aria-label="Label" />
                <AddressFields label="Address" value={edit} onChange={(a) => setEdit({ ...edit, ...a })} />
                <div className="flex gap-2">
                  <button type="button" disabled={busy} onClick={saveEdit} data-es
                    className="px-3 py-1.5 bg-brand-600 text-white text-xs font-semibold rounded-lg hover:bg-brand-700 disabled:opacity-50">
                    {busy ? 'Saving…' : 'Save'}
                  </button>
                  <button type="button" onClick={() => { setEditId(null); setEdit(null); }} data-es
                    className="px-3 py-1.5 border border-gray-300 text-xs font-medium rounded-lg hover:bg-gray-50">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3">
                <MapPin className="w-4 h-4 mt-0.5 text-brand-500 shrink-0" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-gray-500">{l.label || `Address ${i + 2}`}</p>
                  <p className="text-gray-800">{addressLine(l)}</p>
                </div>
                {canEdit && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button type="button" title="Edit" aria-label="Edit address"
                      onClick={() => { setEditId(l.id); setEdit({ ...l }); }}
                      className="p-1.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button type="button" title="Remove" aria-label="Remove address" disabled={busy}
                      onClick={() => remove(l.id)}
                      className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </li>
        ))}
        {addressIsBlank(party.address) && saved.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-gray-400"><Bi>No addresses yet.</Bi></li>
        )}
      </ul>

      {adding && (
        <div className="mt-4 rounded-lg border border-gray-200 p-4 space-y-3">
          <input value={label} maxLength={MAX_LOCATION_LABEL} placeholder="Label, e.g. Plant 2 (optional)"
            onChange={(e) => setLabel(e.target.value)} className={INPUT} aria-label="Label" />
          <AddressFields label="New address" value={draft} onChange={setDraft} />
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={add} data-es
              className="px-3 py-1.5 bg-brand-600 text-white text-xs font-semibold rounded-lg hover:bg-brand-700 disabled:opacity-50">
              {busy ? 'Saving…' : 'Add address'}
            </button>
            <button type="button" onClick={() => { setAdding(false); setError(''); }} data-es
              className="px-3 py-1.5 border border-gray-300 text-xs font-medium rounded-lg hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </div>
      )}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </section>
  );
}
