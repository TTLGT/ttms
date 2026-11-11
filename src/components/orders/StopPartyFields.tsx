'use client';

import { MapPin, Plus, UserCheck } from 'lucide-react';
import PartyCombobox from '@/components/parties/PartyCombobox';
import type { PartySelection } from '@/components/parties/PartyCombobox';
import AddressFields from './AddressFields';
import { Bi } from '@/components/spanish/Es';
import { addPartyAddress } from '@/lib/parties';
import { partyDisplayName, ROLE_LABEL } from '@/types/party';
import type { Party } from '@/types/party';
import type { Address } from '@/types/order';
import {
  addressIsBlank, addressLine, blankAddress, locationAt, partyLocations, suggestPartiesForAddress,
} from '@/types/partyAddress';

/**
 * One end of a stop on an order form: the shipper or consignee, and which of
 * its addresses the truck goes to (2026-11-06).
 *
 * The address is never on its own. Picking a party fills in its address —
 * the one it was last used at for that role first — and lists every other
 * address it has, one click each. An address the party does not have yet is
 * typed in below and added to the party when the order is saved
 * (linkStopAddresses()). Typing an address with no party picked suggests the
 * shipper or consignee already on file there, so somebody who knows where
 * the freight is finds who is there.
 */

export type StopRole = 'shipper' | 'consignee';

export interface StopValue {
  party: PartySelection;
  address: Address;
}

interface Props {
  role: StopRole;
  partyLabel: string;
  addressLabel: string;
  parties: Party[];
  value: StopValue;
  onChange: (value: StopValue) => void;
  onPartyCreated?: (party: Party) => void;
  /** Ids for the reviewer's "take me to this field" links on the edit form. */
  partyFieldId?: string;
  addressFieldId?: string;
  /**
   * The client picked in General, offered as a one-click answer while this
   * stop has nobody — see the button below.
   */
  client?: PartySelection;
  /** One plain line under the label saying what this box is for. */
  hint?: string;
}

export default function StopPartyFields({
  role, partyLabel, addressLabel, parties, value, onChange, onPartyCreated, partyFieldId, addressFieldId, client, hint,
}: Props) {
  const record = value.party.id ? parties.find((p) => p.id === value.party.id) ?? null : null;
  const locations = record ? partyLocations(record, role) : [];
  const current = record ? locationAt(record, value.address) : null;
  const typedNew = !!record && !current && !addressIsBlank(value.address);
  const suggestions = !value.party.id ? suggestPartiesForAddress(parties, value.address, role) : [];
  const word = ROLE_LABEL[role].toLowerCase();

  function picked(sel: PartySelection, party: Party | null) {
    const before = record;
    // Fill the address in when there is nothing there yet, or when what is
    // there was the previous party's — a switched shipper must not keep the
    // old one's dock. An address somebody typed themselves is kept: it is
    // where they said the truck goes, and it is added to the new party.
    const wasTheirs = !!before && !!locationAt(before, value.address);
    if (party && (addressIsBlank(value.address) || wasTheirs) && !locationAt(party, value.address)) {
      const first = partyLocations(party, role)[0];
      onChange({ party: sel, address: first ? { ...first.address } : blankAddress() });
      return;
    }
    onChange({ party: sel, address: value.address });
  }

  /*
   * "The client is also the shipper" (2026-11-11). The commonest answer to
   * who loads or unloads is the client themselves — a dealer shipping its own
   * car, a plant receiving its own machine — and brokers were typing the same
   * company twice, or leaving the stop blank because they were unsure it was
   * allowed. Offered only while the stop is empty and only for a client that
   * is a real record; picking it is exactly a pick from the list, so the
   * address is filled the same way and the role is tagged on save as usual.
   */
  const clientRecord = client?.id ? parties.find((p) => p.id === client.id) ?? null : null;
  const offerClient = !!client?.id && !value.party.id && !value.party.name.trim();

  return (
    <div className="space-y-4">
      <div id={partyFieldId}>
        <PartyCombobox role={role} label={partyLabel} parties={parties}
          value={value.party} onChange={picked} onPartyCreated={onPartyCreated} />
        {hint && <p className="text-xs text-gray-500 mt-1"><Bi>{hint}</Bi></p>}
        {offerClient && client && (
          <button type="button" onClick={() => picked(client, clientRecord)}
            className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700 hover:bg-brand-100">
            <UserCheck className="w-3.5 h-3.5" aria-hidden />
            {/* Built from the name, so it has no dictionary entry. */}
            The client is the {word}: use {client.name}
          </button>
        )}
      </div>

      <div id={addressFieldId} className="space-y-3">
        {record && locations.length > 0 && (
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-2">{addressLabel}</p>
            <div role="radiogroup" aria-label={addressLabel} className="space-y-1.5">
              {locations.map((l) => {
                const on = !!current && current.id === l.id;
                return (
                  <button key={l.id} type="button" role="radio" aria-checked={on}
                    onClick={() => onChange({ party: value.party, address: { ...l.address } })}
                    className={`w-full text-left flex items-start gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                      on ? 'border-brand-300 bg-brand-50' : 'border-gray-200 bg-white hover:bg-gray-50'}`}>
                    <MapPin className={`w-4 h-4 mt-0.5 shrink-0 ${on ? 'text-brand-600' : 'text-gray-400'}`} aria-hidden />
                    <span className="min-w-0">
                      <span className={`block text-xs font-semibold ${on ? 'text-brand-800' : 'text-gray-600'}`}>{l.label}</span>
                      <span className="block text-gray-800">{addressLine(l.address)}</span>
                    </span>
                  </button>
                );
              })}
              <button type="button" role="radio" aria-checked={typedNew || (!current && addressIsBlank(value.address))}
                onClick={() => onChange({ party: value.party, address: blankAddress() })}
                className={`w-full text-left flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm transition ${
                  typedNew ? 'border-brand-300 bg-brand-50 text-brand-800' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
                <Plus className="w-4 h-4" aria-hidden /> <span data-es>A different address</span>
              </button>
            </div>
          </div>
        )}

        {(!record || locations.length === 0 || !current) && (
          <AddressFields
            label={record && locations.length > 0 ? `New address for ${partyDisplayName(record)}` : addressLabel}
            value={value.address}
            onChange={(address) => onChange({ party: value.party, address })} />
        )}

        {typedNew && record && value.address.street.trim() && (
          <p className="text-xs text-brand-700">
            {/* Built from the name, so it has no dictionary entry. */}
            This address is added to {partyDisplayName(record)} when you save, so it can be picked next time.
          </p>
        )}
        {record && locations.length === 0 && addressIsBlank(value.address) && (
          <p className="text-xs text-gray-500">
            <Bi>No address on file yet. Type it in and it is saved to the record with the order.</Bi>
          </p>
        )}

        {!value.party.id && suggestions.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs font-semibold text-amber-900 mb-2">
              <Bi>On file at this address</Bi>
            </p>
            <ul className="space-y-1.5">
              {suggestions.map((s) => (
                <li key={s.party.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0">
                    <span className="font-medium text-gray-900">{partyDisplayName(s.party)}</span>
                    <span className="block text-xs text-gray-600 truncate">{addressLine(s.location.address)}</span>
                  </span>
                  <button type="button" data-es
                    onClick={() => onChange({ party: { id: s.party.id, name: partyDisplayName(s.party) }, address: { ...s.location.address } })}
                    className="shrink-0 px-2.5 py-1 rounded-md border border-amber-300 bg-white text-xs font-semibold text-amber-900 hover:bg-amber-100">
                    Use this {word}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {!value.party.id && !addressIsBlank(value.address) && (
          <p className="text-xs text-amber-700">
            {role === 'shipper'
              ? <Bi>A pickup address must belong to a shipper. Pick the shipper at this address, or add them above.</Bi>
              : <Bi>A delivery address must belong to a consignee. Pick the consignee at this address, or add them above.</Bi>}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Why a stop cannot be saved as it is, or '' when it can: an address with no
 * shipper or consignee behind it. `name` is how the form calls the stop.
 */
export function stopLinkProblem(name: string, role: StopRole, v: StopValue): string {
  if (addressIsBlank(v.address) || v.party.id) return '';
  return `${name}: the address has no ${ROLE_LABEL[role].toLowerCase()}. `
    + `Pick the ${ROLE_LABEL[role].toLowerCase()} at this address, or add them, so the address is saved to a record.`;
}

/**
 * Adds every stop's address its party does not hold yet to that party, so
 * the order never carries an address that belongs to nobody. Called just
 * before the order is saved; a failure stops the save, because "it has to be
 * linked" is the rule. Answers with the parties as they now stand, for the
 * form's cache.
 */
export async function linkStopAddresses(stops: readonly StopValue[], parties: Party[]): Promise<Party[]> {
  let next = parties;
  for (const s of stops) {
    if (!s.party.id || addressIsBlank(s.address)) continue;
    const record = next.find((p) => p.id === s.party.id);
    // A party this person cannot open — a load they edit whose shipper is a
    // colleague's — is not in their list. The server would refuse the add,
    // and refusing their whole save over a record they cannot see helps
    // nobody, so the stop keeps its own copy and is linked by whoever can.
    if (!record) continue;
    if (locationAt(record, s.address)) continue;
    // A city with no street — common on a quote, before anybody knows the
    // dock — is not an address yet, and saving it would fill the record with
    // "Dallas, TX". It is linked the first time the street is typed in.
    if (!s.address.street.trim()) continue;
    if (!s.address.city.trim() || !s.address.state.trim()) {
      throw new Error(`The address for ${s.party.name || 'a stop'} needs a city and a state before it can be saved to the record.`);
    }
    try {
      const { addresses } = await addPartyAddress(s.party.id, s.address);
      next = next.map((p) => (p.id === record.id
        ? { ...p, addresses, defaultOrigin: null, defaultDest: null }
        : p));
    } catch (e) {
      throw new Error(`Could not save the address to ${s.party.name || 'the record'}: ${e instanceof Error ? e.message : 'unknown error'}`);
    }
  }
  return next;
}
