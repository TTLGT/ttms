'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { searchParties, findParty, lookupPartiesByPhone, requestPartyAccess } from '@/lib/parties';
import { partyDisplayName, toNameKey, toPhoneKey, looksLikePhone, ROLE_LABEL } from '@/types/party';
import type { Party, PartyRole } from '@/types/party';
import PartyQuickCreate from './PartyQuickCreate';

export interface PartySelection {
  id: string;
  name: string;
}

interface Props {
  role: PartyRole;
  label?: string;
  parties: Party[];
  value: PartySelection;
  onChange: (selection: PartySelection, party: Party | null) => void;
  /** Called after a brand-new party is created, so the caller can cache it. */
  onPartyCreated?: (party: Party) => void;
  required?: boolean;
  placeholder?: string;
}

const MAX_VISIBLE = 8;

/**
 * Type-ahead picker over the shared party list — by name, or by phone number.
 *
 * The phone path is the BATS habit brokers came from: a customer calls, you
 * type the number that rang in, and either the record comes back or you get a
 * new one with the number already filled. Seven digits with no letters is read
 * as a number rather than a name; see looksLikePhone(). It goes to the server
 * because the number may sit on a record this user cannot see, and "not found"
 * would then be a lie that ends in a duplicate.
 *
 * What this deliberately no longer does is create a party by itself. Typing a
 * name here used to mint a record from that one string on blur, leaving a
 * client with no phone, no email and no address — a gap nobody noticed until
 * an agreement had to be sent. A free name now opens PartyQuickCreate, which
 * asks for the whole record.
 */
export default function PartyCombobox({
  role,
  label,
  parties,
  value,
  onChange,
  onPartyCreated,
  required,
  placeholder,
}: Props) {
  const [queryText, setQueryText] = useState(value.name);
  const [open, setOpen]           = useState(false);
  const [active, setActive]       = useState(0);
  /** Set when the typed name belongs to a record this user cannot see. */
  const [collision, setCollision] = useState<{ name: string; ownerName: string } | null>(null);
  const [requestState, setRequestState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [requestError, setRequestError] = useState('');
  const [reason, setReason]       = useState('');
  const [checking, setChecking]   = useState(false);
  /** Non-null while the full add-a-record dialog is open, holding its prefill. */
  const [adding, setAdding]       = useState<string | null>(null);
  /**
   * A name that is free but has not been filled in yet. The order must not be
   * saved against it — see the note in handleBlur.
   */
  const [unsaved, setUnsaved]     = useState('');
  const [phoneHits, setPhoneHits] = useState<{ matches: Party[]; owned: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Keep the visible text in step when the parent sets a selection (e.g. the
  // shipperId query param preselect on the new-order form).
  useEffect(() => { setQueryText(value.name); }, [value.name]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const trimmed   = queryText.trim();
  const phoneMode = looksLikePhone(trimmed);

  // A number is looked up on the server; a name is matched against the list the
  // caller already loaded. Debounced because ten digits is ten keystrokes and
  // each one would otherwise be a query against production.
  useEffect(() => {
    if (!phoneMode || !toPhoneKey(trimmed)) { setPhoneHits(null); return; }
    let live = true;
    setChecking(true);
    const timer = setTimeout(() => {
      lookupPartiesByPhone(trimmed)
        .then((r) => { if (live) setPhoneHits({ matches: r.matches, owned: r.owned.length }); })
        .catch(() => { if (live) setPhoneHits(null); })
        .finally(() => { if (live) setChecking(false); });
    }, 350);
    return () => { live = false; clearTimeout(timer); setChecking(false); };
  }, [phoneMode, trimmed]);

  const matches = useMemo(() => {
    if (phoneMode) return (phoneHits?.matches ?? []).slice(0, MAX_VISIBLE);
    return searchParties(parties, queryText).slice(0, MAX_VISIBLE);
  }, [phoneMode, phoneHits, parties, queryText]);

  const typedKey    = toNameKey(trimmed);
  const exactExists = !phoneMode && parties.some((p) => p.nameKey === typedKey);
  const canCreate   = trimmed.length > 0 && !exactExists;
  const rowCount    = matches.length + (canCreate ? 1 : 0);

  function pick(party: Party) {
    const name = partyDisplayName(party);
    setQueryText(name);
    setOpen(false);
    setUnsaved('');
    setCollision(null);
    onChange({ id: party.id, name }, party);
  }

  function openAdd() {
    setOpen(false);
    setAdding(trimmed);
  }

  function handleCreated(party: Party) {
    onPartyCreated?.(party);
    setAdding(null);
    pick(party);
  }

  async function sendAccessRequest() {
    if (!collision) return;
    setRequestState('sending');
    setRequestError('');
    try {
      await requestPartyAccess(collision.name, role, reason);
      setRequestState('sent');
    } catch (e) {
      setRequestState('error');
      setRequestError(e instanceof Error ? e.message : 'Could not send the request');
    }
  }

  function clearCollision() {
    setCollision(null);
    setRequestState('idle');
    setReason('');
    setQueryText('');
    onChange({ id: '', name: '' }, null);
  }

  function commitRow(index: number) {
    if (index < matches.length) pick(matches[index]);
    else if (canCreate)         openAdd();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) { setOpen(true); return; }
    if (e.key === 'ArrowDown')      { e.preventDefault(); setActive((i) => Math.min(i + 1, rowCount - 1)); }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter')     { e.preventDefault(); commitRow(active); }
    else if (e.key === 'Escape')    { setOpen(false); setQueryText(value.name); }
  }

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const text = e.target.value;
    setQueryText(text);
    setOpen(true);
    setActive(0);
    setUnsaved('');
    if (collision) { setCollision(null); setRequestState('idle'); }
    // Typing past a selection clears it. The name is only trusted once it is
    // bound to a real record, by picking one or by filling one in.
    onChange({ id: '', name: text }, null);
  }

  /**
   * A name left in the box is resolved, never created.
   *
   * An existing record the user may use is still selected for them — that
   * convenience was worth keeping. A free name is flagged as unsaved instead,
   * and the order form refuses to save against it, because the alternative is
   * the one-field record this whole change exists to stop.
   */
  async function handleBlur() {
    if (!trimmed || value.id || collision || adding !== null) return;

    if (phoneMode) {
      // A number is not a name: there is nothing to resolve and nothing to
      // create from it on its own. The dropdown has already said what it found.
      setUnsaved(trimmed);
      return;
    }

    const local = parties.find((p) => p.nameKey === typedKey);
    if (local) { pick(local); return; }

    setChecking(true);
    try {
      const result = await findParty(trimmed, role);
      if ('party' in result)   { pick(result.party); return; }
      if ('ownedBy' in result) { setCollision({ name: trimmed, ownerName: result.ownedBy }); return; }
      setUnsaved(trimmed);
    } catch {
      // A lookup that failed must not read as "free to create" — leaving it
      // unsaved keeps the order from being written against an unchecked name.
      setUnsaved(trimmed);
    } finally {
      setChecking(false);
    }
  }

  const roleLabel = ROLE_LABEL[role].toLowerCase();

  return (
    <div ref={wrapRef} className="relative">
      {label && <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>}
      <input
        type="text"
        required={required}
        value={queryText}
        onChange={handleInput}
        onFocus={() => setOpen(true)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder ?? `Search by name or phone…`}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
      />
      {value.id && (
        <span className="absolute right-3 top-[30px] text-xs text-green-600" title="Linked to a saved record">✓</span>
      )}

      {unsaved && !collision && (
        <div className="mt-2 rounded-lg bg-blue-50 border border-blue-200 p-3 text-sm">
          <p className="text-blue-900">
            <strong>{unsaved}</strong> is not on file yet.
          </p>
          <p className="text-blue-800 text-xs mt-1">
            Add it with its contact details — phone, email and address — so agreements and load
            confirmations have somewhere to go.
          </p>
          <button type="button" onClick={() => setAdding(unsaved)}
            className="mt-2 px-3 py-1.5 bg-brand-600 text-white text-xs font-semibold rounded-lg hover:bg-brand-700 transition">
            Add this {roleLabel}
          </button>
        </div>
      )}

      {collision && (
        <div className="mt-2 rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm">
          <p className="text-amber-900">
            <strong>{collision.name}</strong> is already on file and belongs to{' '}
            <strong>{collision.ownerName}</strong>.
          </p>
          <p className="text-amber-800 text-xs mt-1">
            Talk to {collision.ownerName} before using this {roleLabel}. They
            need to approve it on their side — an admin can also approve. Approval covers this one
            order.
          </p>

          {requestState === 'sent' ? (
            <p className="text-xs text-green-700 mt-2 font-medium">
              Request sent. You will see it under Approvals once it is decided.
            </p>
          ) : (
            <div className="mt-2 space-y-2">
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why do you need it? (optional, shown to the owner)"
                className="w-full border border-amber-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={sendAccessRequest}
                  disabled={requestState === 'sending'}
                  className="px-3 py-1.5 bg-amber-600 text-white text-xs font-semibold rounded-lg hover:bg-amber-700 transition disabled:opacity-50"
                >
                  {requestState === 'sending' ? 'Sending…' : 'Request approval'}
                </button>
                <button
                  type="button"
                  onClick={clearCollision}
                  className="px-3 py-1.5 border border-amber-300 text-amber-800 text-xs font-medium rounded-lg hover:bg-amber-100 transition"
                >
                  Use a different name
                </button>
              </div>
            </div>
          )}
          {requestError && <p className="text-xs text-red-600 mt-2">{requestError}</p>}
        </div>
      )}

      {open && (rowCount > 0 || checking) && (
        <ul className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-72 overflow-auto py-1">
          {checking && matches.length === 0 && (
            <li className="px-3 py-2 text-sm text-gray-400">Checking…</li>
          )}
          {matches.map((p, i) => {
            const name = partyDisplayName(p);
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(p)}
                  onMouseEnter={() => setActive(i)}
                  className={`w-full text-left px-3 py-2 text-sm ${i === active ? 'bg-brand-50' : 'hover:bg-gray-50'}`}
                >
                  <span className="font-medium text-gray-900">
                    {phoneMode ? name : highlight(name, queryText)}
                  </span>
                  <span className="block text-xs text-gray-500">
                    {[
                      p.companyName && p.contactName ? p.contactName : '',
                      // The number is what was searched on, so it is worth
                      // showing: two records under one switchboard are told
                      // apart by the contact, not the line.
                      phoneMode ? (p.phone || p.phone2) : '',
                      p.address?.city,
                      p.address?.state,
                    ].filter(Boolean).join(' · ') || '—'}
                  </span>
                </button>
              </li>
            );
          })}
          {phoneMode && (phoneHits?.owned ?? 0) > 0 && (
            <li className="px-3 py-2 text-xs text-amber-700 bg-amber-50 border-t border-amber-100">
              {phoneHits!.owned === 1 ? 'One record' : `${phoneHits!.owned} records`} with this
              number belong to colleagues. Search by name to request approval.
            </li>
          )}
          {canCreate && (
            <li>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={openAdd}
                onMouseEnter={() => setActive(matches.length)}
                className={`w-full text-left px-3 py-2 text-sm border-t border-gray-100 ${
                  active === matches.length ? 'bg-brand-50' : 'hover:bg-gray-50'
                }`}
              >
                <span className="text-brand-600 font-medium">
                  {phoneMode
                    ? `+ Add a new ${roleLabel} on ${trimmed}`
                    : `+ Add new ${roleLabel} "${trimmed}"`}
                </span>
                <span className="block text-xs text-gray-500">
                  Opens the full record — contact, phone, email and address.
                </span>
              </button>
            </li>
          )}
        </ul>
      )}

      {adding !== null && (
        <PartyQuickCreate
          role={role}
          prefill={adding}
          onCreated={handleCreated}
          onPicked={(p) => { setAdding(null); pick(p); }}
          onClose={() => setAdding(null)}
        />
      )}
    </div>
  );
}

/** Bolds the matched run so it is obvious why a result came back. */
function highlight(name: string, queryText: string) {
  const q = queryText.trim().toLowerCase();
  if (!q) return name;
  const at = name.toLowerCase().indexOf(q);
  if (at === -1) return name;
  return (
    <>
      {name.slice(0, at)}
      <mark className="bg-yellow-100 text-gray-900 rounded-sm">{name.slice(at, at + q.length)}</mark>
      {name.slice(at + q.length)}
    </>
  );
}
