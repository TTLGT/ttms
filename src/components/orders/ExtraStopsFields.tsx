'use client';

import { Plus, Trash2 } from 'lucide-react';
import PartyCombobox from '@/components/parties/PartyCombobox';
import type { PartySelection } from '@/components/parties/PartyCombobox';
import DateRangeField, { dateRangeProblem } from '@/components/DateRangeField';
import AddressFields, { BLANK_ADDRESS } from './AddressFields';
import { MAX_EXTRA_STOPS } from '@/types/order';
import type { Address, OrderStop, StopKind } from '@/types/order';
import type { Party } from '@/types/party';
import { toDate } from '@/lib/dateFormat';
import type { DateLike } from '@/lib/dateFormat';

/**
 * The extra pickups or extra deliveries on an order form — every stop after
 * the first, which keeps its own boxes above (see OrderStop for why).
 *
 * Each stop is the same three things the first one is: who, where, and when.
 * Picking a party fills the address from its saved default, as the first
 * shipper and consignee boxes do.
 */

/** One stop as the form holds it: dates as `YYYY-MM-DD`, like DateField. */
export interface StopDraft {
  /** React key only; never saved. */
  key: string;
  party: PartySelection;
  address: Address;
  date: string;
  dateEnd: string;
}

const KIND_WORD: Record<StopKind, string> = { pickup: 'Pickup', delivery: 'Delivery' };

let nextKey = 0;
function newKey() { nextKey += 1; return `stop-${nextKey}`; }

/** `YYYY-MM-DD` for a stored date, the same way the edit form reads the first stop's. */
function dayOf(value: unknown): string {
  const d = toDate(value as DateLike);
  return d ? d.toISOString().slice(0, 10) : '';
}

/** A saved order's stops, ready to edit. */
export function stopDraftsFrom(stops: readonly OrderStop[] | undefined): StopDraft[] {
  return (stops ?? []).map((s) => ({
    key: newKey(),
    party: { id: s.partyId ?? '', name: s.partyName ?? '' },
    address: { ...BLANK_ADDRESS, ...(s.address ?? {}) },
    date: dayOf(s.date),
    dateEnd: dayOf(s.dateEnd),
  }));
}

function isBlank(d: StopDraft): boolean {
  return !d.party.id && !d.party.name.trim()
    && !d.address.street.trim() && !d.address.city.trim() && !d.address.state && !d.address.zip.trim()
    && !d.date && !d.dateEnd;
}

/**
 * The stops as they are saved. A stop left completely empty is dropped — an
 * "Add pickup" clicked by mistake should not become a blank stop on the BOL.
 * Dates are noon local, as the edit form saves the first stop's, so the day
 * survives a trip through UTC.
 */
export function stopsForSave(drafts: readonly StopDraft[]): OrderStop[] {
  const at = (day: string) => (day ? new Date(`${day}T12:00:00`) : null);
  return drafts.filter((d) => !isBlank(d)).map((d) => ({
    partyId:   d.party.id,
    partyName: d.party.name.trim(),
    address:   d.address,
    // A Date, not a Timestamp: it travels to the save route through
    // encodeRecordPatch(), which turns either into the server's Timestamp.
    date:      at(d.date) as unknown as OrderStop['date'],
    dateEnd:   at(d.dateEnd) as unknown as OrderStop['dateEnd'],
  }));
}

/**
 * Why these stops cannot be saved, or '' when they can. Same two rules as the
 * first stop: a name typed with no record behind it, and a date window that
 * runs backwards.
 */
export function stopsProblem(kind: StopKind, drafts: readonly StopDraft[]): string {
  for (const [i, d] of drafts.entries()) {
    if (isBlank(d)) continue;
    const name = `${KIND_WORD[kind]} ${i + 2}`;
    if (!d.party.id && d.party.name.trim()) {
      return `${name}: "${d.party.name.trim()}" is not on file yet. `
        + 'Pick an existing record from the list, or add it with its full details.';
    }
    const range = dateRangeProblem(`${name} date`, d.date, d.dateEnd);
    if (range) return range;
  }
  return '';
}

/** The party ids at these stops, for the role tagging and approval stamps the first stop gets. */
export function stopPartyIdsIn(drafts: readonly StopDraft[]): string[] {
  return drafts.map((d) => d.party.id).filter(Boolean);
}

interface Props {
  kind: StopKind;
  value: StopDraft[];
  onChange: (value: StopDraft[]) => void;
  parties: Party[];
  onPartyCreated?: (party: Party) => void;
}

export default function ExtraStopsFields({ kind, value, onChange, parties, onPartyCreated }: Props) {
  const word = KIND_WORD[kind];
  const role = kind === 'pickup' ? 'shipper' : 'consignee';

  function update(key: string, change: Partial<StopDraft>) {
    onChange(value.map((d) => (d.key === key ? { ...d, ...change } : d)));
  }

  function picked(key: string, party: PartySelection, record: Party | null) {
    const saved = kind === 'pickup' ? record?.defaultOrigin : record?.defaultDest;
    update(key, saved ? { party, address: saved } : { party });
  }

  function add() {
    onChange([...value, { key: newKey(), party: { id: '', name: '' }, address: BLANK_ADDRESS, date: '', dateEnd: '' }]);
  }

  return (
    <div className="space-y-4">
      {value.map((d, i) => (
        <div key={d.key} className="rounded-lg border border-gray-200 p-4 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-gray-900">{word} {i + 2}</p>
            <button type="button" onClick={() => onChange(value.filter((x) => x.key !== d.key))}
              className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-red-600">
              <Trash2 className="w-3.5 h-3.5" /> Remove
            </button>
          </div>
          <PartyCombobox
            role={role}
            label={kind === 'pickup' ? 'Shipper' : 'Consignee'}
            parties={parties}
            value={d.party}
            onChange={(sel, record) => picked(d.key, sel, record)}
            onPartyCreated={onPartyCreated}
          />
          <AddressFields label="Address" value={d.address} onChange={(address) => update(d.key, { address })} />
          <DateRangeField label={`${word} date`}
            start={d.date} end={d.dateEnd}
            onStartChange={(date) => update(d.key, { date })}
            onEndChange={(dateEnd) => update(d.key, { dateEnd })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
        </div>
      ))}
      {value.length < MAX_EXTRA_STOPS ? (
        <button type="button" onClick={add}
          className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700">
          <Plus className="w-4 h-4" /> Add another {word.toLowerCase()}
        </button>
      ) : (
        <p className="text-xs text-gray-500">
          {MAX_EXTRA_STOPS + 1} {kind === 'pickup' ? 'pickups' : 'deliveries'} is the most one load can
          carry. Split the rest into a suborder.
        </p>
      )}
    </div>
  );
}
