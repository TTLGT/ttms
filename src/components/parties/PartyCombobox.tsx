'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { searchParties, findOrCreateParty, requestPartyAccess } from '@/lib/parties';
import { partyDisplayName, toNameKey, ROLE_LABEL } from '@/types/party';
import type { Party, PartyRole } from '@/types/party';

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
 * Type-ahead picker over the shared party list. Always lets the user pick an
 * existing party or create one inline — there is no empty state that degrades
 * into a plain text box, so a typed name always ends up as a real record.
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
  const [creating, setCreating]   = useState(false);
  /** Set when the typed name belongs to a record this user cannot see. */
  const [collision, setCollision] = useState<{ name: string; ownerName: string } | null>(null);
  const [requestState, setRequestState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [requestError, setRequestError] = useState('');
  const [reason, setReason]       = useState('');
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

  const matches = useMemo(
    () => searchParties(parties, queryText).slice(0, MAX_VISIBLE),
    [parties, queryText],
  );

  const trimmed    = queryText.trim();
  const typedKey   = toNameKey(trimmed);
  const exactExists = parties.some((p) => p.nameKey === typedKey);
  const canCreate   = trimmed.length > 0 && !exactExists;
  const rowCount    = matches.length + (canCreate ? 1 : 0);

  function pick(party: Party) {
    const name = partyDisplayName(party);
    setQueryText(name);
    setOpen(false);
    onChange({ id: party.id, name }, party);
  }

  async function createAndPick() {
    if (!trimmed || creating) return;
    setCreating(true);
    setRequestError('');
    try {
      const result = await findOrCreateParty(trimmed, role);
      if ('ownedBy' in result) {
        // Someone else's record. Surface who owns it; never select it.
        setCollision({ name: trimmed, ownerName: result.ownedBy });
        setRequestState('idle');
        setOpen(false);
        return;
      }
      setCollision(null);
      onPartyCreated?.(result.party);
      pick(result.party);
    } catch (e) {
      setRequestError(e instanceof Error ? e.message : 'Could not save that name');
    } finally {
      setCreating(false);
    }
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
    else if (canCreate)         void createAndPick();
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
    if (collision) { setCollision(null); setRequestState('idle'); }
    // Typing past a selection clears it — the name is only trusted once it is
    // bound to a party, either by picking one or by creating one on blur.
    if (value.id) onChange({ id: '', name: text }, null);
    else          onChange({ id: '', name: text }, null);
  }

  /** A name typed and left unselected still becomes a party rather than a loose string. */
  async function handleBlur() {
    if (!trimmed || value.id || collision) return;
    const match = parties.find((p) => p.nameKey === typedKey);
    if (match) { pick(match); return; }
    await createAndPick();
  }

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
        placeholder={placeholder ?? `Search or add a ${ROLE_LABEL[role].toLowerCase()}…`}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
      />
      {value.id && (
        <span className="absolute right-3 top-[30px] text-xs text-green-600" title="Linked to a saved record">✓</span>
      )}

      {collision && (
        <div className="mt-2 rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm">
          <p className="text-amber-900">
            <strong>{collision.name}</strong> is already on file and belongs to{' '}
            <strong>{collision.ownerName}</strong>.
          </p>
          <p className="text-amber-800 text-xs mt-1">
            Talk to {collision.ownerName} before using this {ROLE_LABEL[role].toLowerCase()}. They
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

      {open && rowCount > 0 && (
        <ul className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-72 overflow-auto py-1">
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
                  <span className="font-medium text-gray-900">{highlight(name, queryText)}</span>
                  <span className="block text-xs text-gray-500">
                    {[p.companyName && p.contactName ? p.contactName : '', p.address?.city, p.address?.state]
                      .filter(Boolean)
                      .join(' · ') || '—'}
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
                onClick={createAndPick}
                onMouseEnter={() => setActive(matches.length)}
                disabled={creating}
                className={`w-full text-left px-3 py-2 text-sm border-t border-gray-100 ${
                  active === matches.length ? 'bg-brand-50' : 'hover:bg-gray-50'
                }`}
              >
                <span className="text-brand-600 font-medium">
                  {creating ? 'Adding…' : `+ Add new ${ROLE_LABEL[role].toLowerCase()} "${trimmed}"`}
                </span>
              </button>
            </li>
          )}
        </ul>
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
