'use client';

import { useEffect, useRef, useState } from 'react';
import { listCarriersPage } from '@/lib/carriers';
import { carrierNameKey, getInsuranceStatus } from '@/types/carrier';
import type { Carrier } from '@/types/carrier';
import QuickAddCarrierModal from './QuickAddCarrierModal';

export interface CarrierSelection {
  id: string;
  name: string;
}

interface Props {
  label?: string;
  value: CarrierSelection;
  onChange: (selection: CarrierSelection, carrier: Carrier | null) => void;
  /** Called after a brand-new carrier is created, so the caller can cache it. */
  onCarrierCreated?: (carrier: Carrier) => void;
  placeholder?: string;
}

const MAX_VISIBLE = 8;

/**
 * Type-ahead picker over the carrier list, with a way to add one that is not
 * on file yet.
 *
 * Deliberately *not* the `<select>` the order page uses. That one is fed by
 * `listCarriers()`, which reads the whole collection — eleven thousand
 * documents before the BATS clear-down — and a dropdown that long is unusable
 * anyway. This asks the database one page at a time through `listCarriersPage`,
 * so a search costs about nine reads however many carriers exist. See the note
 * at the top of `src/lib/carriers.ts`.
 *
 * Like PartyCombobox, a name typed here is trusted only once it is bound to a
 * real record: picking one binds it, and "+ New carrier" opens the quick-add
 * form. A carrier held as loose text would have no email for the agreement to
 * be sent to and no insurance date to check.
 */
export default function CarrierCombobox({
  label,
  value,
  onChange,
  onCarrierCreated,
  placeholder,
}: Props) {
  const [queryText, setQueryText] = useState(value.name);
  const [open, setOpen]           = useState(false);
  const [active, setActive]       = useState(0);
  const [matches, setMatches]     = useState<Carrier[]>([]);
  const [searching, setSearching] = useState(false);
  /** Non-null while the quick-add dialog is open, holding the typed name. */
  const [adding, setAdding]       = useState<string | null>(null);
  /** A name left in the box that matched nothing. The form refuses to save it. */
  const [unbound, setUnbound]     = useState('');
  /** The carrier behind the current selection, for the details line below. */
  const [picked, setPicked]       = useState<Carrier | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Keep the visible text in step when the parent sets a selection.
  useEffect(() => { setQueryText(value.name); }, [value.name]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const trimmed = queryText.trim();

  // Every search is a round trip, so it is debounced: a carrier name is a
  // dozen keystrokes and each one would otherwise be a query against
  // production. It runs only while the list is open, so tabbing past the field
  // costs nothing.
  useEffect(() => {
    if (!open) return;
    let live = true;
    setSearching(true);
    const timer = setTimeout(() => {
      listCarriersPage({ search: trimmed, activeOnly: true, limit: MAX_VISIBLE })
        .then((page) => { if (live) setMatches(page.carriers); })
        .catch(() => { if (live) setMatches([]); })
        .finally(() => { if (live) setSearching(false); });
    }, 300);
    return () => { live = false; clearTimeout(timer); setSearching(false); };
  }, [open, trimmed]);

  const typedKey    = carrierNameKey(trimmed);
  const exactExists = matches.some((c) => carrierNameKey(c.companyName) === typedKey);
  // Offered only once the lookup has come back, so nobody is invited to add a
  // duplicate of a carrier that is still in flight.
  const canCreate   = trimmed.length > 0 && !searching && !exactExists;
  const rowCount    = matches.length + (canCreate ? 1 : 0);

  function pick(carrier: Carrier) {
    setQueryText(carrier.companyName);
    setPicked(carrier);
    setOpen(false);
    setUnbound('');
    onChange({ id: carrier.id, name: carrier.companyName }, carrier);
  }

  function clear() {
    setQueryText('');
    setPicked(null);
    setUnbound('');
    setOpen(false);
    onChange({ id: '', name: '' }, null);
  }

  function handleCreated(carrier: Carrier) {
    onCarrierCreated?.(carrier);
    setAdding(null);
    pick(carrier);
  }

  function commitRow(index: number) {
    if (index < matches.length) pick(matches[index]);
    else if (canCreate)         { setOpen(false); setAdding(trimmed); }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) { setOpen(true); return; }
    if (e.key === 'ArrowDown')    { e.preventDefault(); setActive((i) => Math.min(i + 1, rowCount - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    // Enter picks a row rather than submitting the order form around it.
    else if (e.key === 'Enter')   { e.preventDefault(); commitRow(active); }
    else if (e.key === 'Escape')  { setOpen(false); setQueryText(value.name); }
  }

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const text = e.target.value;
    setQueryText(text);
    setOpen(true);
    setActive(0);
    setUnbound('');
    setPicked(null);
    // Typing past a selection clears it — the name counts only once it is
    // bound to a record again.
    onChange({ id: '', name: text }, null);
  }

  /**
   * A name left in the box is resolved against what came back, never invented.
   * An exact match is selected for the user; anything else is flagged, so the
   * order is not saved against a carrier that does not exist.
   */
  function handleBlur() {
    if (!trimmed || value.id || adding !== null) return;
    const exact = matches.find((c) => carrierNameKey(c.companyName) === typedKey);
    if (exact) { pick(exact); return; }
    if (!searching) setUnbound(trimmed);
  }

  const insurance = picked ? getInsuranceStatus(picked.insuranceExpiration) : 'unknown';

  return (
    <div ref={wrapRef} className="relative">
      {label && <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>}
      <input
        type="text"
        value={queryText}
        onChange={handleInput}
        onFocus={() => setOpen(true)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder ?? 'Search by name, DOT or MC…'}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
      />
      {value.id && (
        <span className="absolute right-3 top-[30px] text-xs text-green-600" title="Linked to a saved carrier">✓</span>
      )}

      {value.id && (
        <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
          <span>
            {[
              picked?.dot && `DOT ${picked.dot}`,
              picked?.mc  && `MC ${picked.mc}`,
              picked?.phone,
            ].filter(Boolean).join(' · ') || 'Saved carrier'}
          </span>
          <button type="button" onClick={clear} className="text-gray-400 hover:text-gray-600 underline">
            Change
          </button>
        </div>
      )}

      {/* Insurance is surfaced here rather than left to the order page, because
          this is the moment somebody decides who is hauling the freight. */}
      {value.id && insurance === 'expired' && (
        <p className="mt-1 text-xs text-red-600">This carrier&rsquo;s insurance has expired.</p>
      )}
      {value.id && insurance === 'expiring_soon' && (
        <p className="mt-1 text-xs text-amber-700">This carrier&rsquo;s insurance expires within 30 days.</p>
      )}

      {unbound && (
        <div className="mt-2 rounded-lg bg-blue-50 border border-blue-200 p-3 text-sm">
          <p className="text-blue-900"><strong>{unbound}</strong> is not on file yet.</p>
          <p className="text-blue-800 text-xs mt-1">
            Add it with its contact details, so the carrier agreement has somewhere to go.
          </p>
          <button type="button" onClick={() => setAdding(unbound)}
            className="mt-2 px-3 py-1.5 bg-brand-600 text-white text-xs font-semibold rounded-lg hover:bg-brand-700 transition">
            Add this carrier
          </button>
        </div>
      )}

      {open && (rowCount > 0 || searching) && (
        <ul className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-72 overflow-auto py-1">
          {searching && matches.length === 0 && (
            <li className="px-3 py-2 text-sm text-gray-400">Searching…</li>
          )}
          {matches.map((c, i) => {
            const status = getInsuranceStatus(c.insuranceExpiration);
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(c)}
                  onMouseEnter={() => setActive(i)}
                  className={`w-full text-left px-3 py-2 text-sm ${i === active ? 'bg-brand-50' : 'hover:bg-gray-50'}`}
                >
                  <span className="font-medium text-gray-900">{c.companyName}</span>
                  {status === 'expired' && (
                    <span className="ml-2 text-xs text-red-600">insurance expired</span>
                  )}
                  {status === 'expiring_soon' && (
                    <span className="ml-2 text-xs text-amber-600">insurance expiring</span>
                  )}
                  <span className="block text-xs text-gray-500">
                    {[
                      c.dot && `DOT ${c.dot}`,
                      c.mc  && `MC ${c.mc}`,
                      c.contactName,
                      c.phone,
                    ].filter(Boolean).join(' · ') || '—'}
                  </span>
                </button>
              </li>
            );
          })}
          {canCreate && (
            <li>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { setOpen(false); setAdding(trimmed); }}
                onMouseEnter={() => setActive(matches.length)}
                className={`w-full text-left px-3 py-2 text-sm border-t border-gray-100 ${
                  active === matches.length ? 'bg-brand-50' : 'hover:bg-gray-50'
                }`}
              >
                <span className="text-brand-600 font-medium">+ New carrier &ldquo;{trimmed}&rdquo;</span>
                <span className="block text-xs text-gray-500">
                  Saved to Carriers and assigned to this load.
                </span>
              </button>
            </li>
          )}
        </ul>
      )}

      {adding !== null && (
        <QuickAddCarrierModal
          prefillName={adding}
          onCreated={handleCreated}
          onCancel={() => setAdding(null)}
        />
      )}
    </div>
  );
}
