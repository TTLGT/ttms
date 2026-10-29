'use client';

import { useMemo, useState } from 'react';
import { Loader2, Plus, UserRound, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { addOrderOwners, removeOrderOwners, updateOrder } from '@/lib/orders';
import { listUserProfiles } from '@/lib/userProfiles';
import { listWorkGroups } from '@/lib/workGroups';
import type { Order } from '@/types/order';
import type { UserProfile } from '@/types/userProfile';
import type { WorkGroup } from '@/types/workGroup';

/**
 * Who created a load, who owns it, and which owner the client's SA and the
 * carrier's Dispatch Sheet name as the broker.
 *
 * Everybody who can open the load sees it. Adding and removing owners is
 * `ownership.change` — admin and dispatch by role — and goes through
 * /api/orders/{id}/owners, which records every change in the ownership
 * history; the server is the authority, this only hides what would 403.
 *
 * The broker choice is open to anyone who can edit the load and appears only
 * when more than one person owns it: with one owner there is nothing to pick.
 * The names come from `order.owners`, resolved by the API, so this costs no
 * profile reads until somebody opens the add-owner picker.
 *
 * `onChanged` re-reads the order, so the names, the broker default and the
 * history all come back as the server now has them.
 */
export default function OrderOwnersCard({ order, onChanged }: {
  order: Order;
  onChanged: () => Promise<void> | void;
}) {
  const { can } = useAuth();
  const canAssign = can('ownership.change');
  const owners = order.owners;

  const [adding, setAdding]     = useState(false);
  const [people, setPeople]     = useState<UserProfile[] | null>(null);
  const [groups, setGroups]     = useState<WorkGroup[]>([]);
  const [pick, setPick]         = useState('');
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState('');

  async function openPicker() {
    setAdding(true);
    setPick('');
    if (people) return;
    try {
      const [ps, gs] = await Promise.all([listUserProfiles(), listWorkGroups().catch(() => [])]);
      setPeople(ps);
      setGroups(gs);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the people list');
    }
  }

  // People and groups not already on the load. Suspended accounts are left
  // out: handing a load to somebody who cannot sign in hides it from no one
  // and helps no one.
  const choices = useMemo(() => {
    const ownedUids = new Set(owners?.people.map((p) => p.uid) ?? []);
    const ownedGroups = new Set(owners?.groups.map((g) => g.id) ?? []);
    return {
      people: (people ?? [])
        .filter((p) => !p.suspended && !ownedUids.has(p.uid))
        .sort((a, b) => (a.displayName || a.email).localeCompare(b.displayName || b.email)),
      groups: groups.filter((g) => !ownedGroups.has(g.id)),
    };
  }, [people, groups, owners]);

  async function run(work: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await work();
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  }

  function add() {
    if (!pick) return;
    const [kind, id] = pick.split(':');
    void run(async () => {
      await addOrderOwners(order.id, kind === 'group' ? { groupIds: [id] } : { uids: [id] });
      setAdding(false);
      setPick('');
    });
  }

  function remove(kind: 'uid' | 'group' | 'email', id: string, name: string) {
    const last = (owners?.people.length ?? 0) + (owners?.groups.length ?? 0) + (owners?.pending.length ?? 0) <= 1;
    // An order with no owner is not shared — it closes to admin, dispatch and
    // finance — so taking the last one off is worth a second look.
    const ask = last
      ? `Remove ${name}? Nobody will own this order, and only admin, dispatch and finance will be able to see it.`
      : `Remove ${name} from this order's owners?`;
    if (!window.confirm(ask)) return;
    void run(() => removeOrderOwners(order.id,
      kind === 'group' ? { groupIds: [id] } : kind === 'email' ? { emails: [id] } : { uids: [id] }));
  }

  function setBroker(uid: string) {
    // Picking the creator goes back to the default (null) rather than
    // storing their uid — the two mean the same thing, and one stored shape
    // for "the default" keeps the change log honest.
    const value = uid === order.createdBy ? null : uid;
    void run(() => updateOrder(order.id, { brokerUid: value }));
  }

  if (!owners) return null;

  const chip = 'inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-sm font-medium text-gray-900';
  const nobody = !owners.people.length && !owners.groups.length && !owners.pending.length;
  const createdBy = owners.createdBy?.name || (owners.batsName ? 'Imported from BATS' : null);

  // A compact strip under the status bar rather than a card in Details: who
  // owns a load is the first thing people need when they open it, on every
  // tab, so it sits above the tabs and takes as little height as it can.
  return (
    <div id="owners" className="bg-white rounded-xl border border-gray-200 px-4 py-3 mb-6 scroll-mt-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
          <UserRound className="w-3.5 h-3.5" /> {owners.people.length + owners.groups.length + owners.pending.length > 1 ? 'Owners' : 'Owner'}
        </span>
          {nobody ? (
            <span className="text-sm text-gray-900">
              {owners.batsName
                ? <>{owners.batsName} <span className="text-gray-500">(BATS name, no TTMS account linked)</span></>
                : <span className="text-amber-700">Nobody — only admin, dispatch and finance can see it</span>}
            </span>
          ) : (
            <>
              {owners.people.map((p) => (
                <span key={p.uid} className={chip} title={p.email}>
                  {p.name}
                  {p.uid === owners.brokerUid && owners.people.length > 1 && (
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-brand-700">Broker</span>
                  )}
                  {canAssign && (
                    <button type="button" onClick={() => remove('uid', p.uid, p.name)} disabled={busy}
                      aria-label={`Remove ${p.name}`} className="text-gray-400 hover:text-red-600 disabled:opacity-50">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </span>
              ))}
              {owners.groups.map((g) => (
                <span key={g.id} className={chip}>
                  {g.name}
                  <span className="text-[10px] uppercase tracking-wide text-gray-400">Group</span>
                  {canAssign && (
                    <button type="button" onClick={() => remove('group', g.id, g.name)} disabled={busy}
                      aria-label={`Remove ${g.name}`} className="text-gray-400 hover:text-red-600 disabled:opacity-50">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </span>
              ))}
              {owners.pending.map((email) => (
                <span key={email} className={chip}>
                  {email}
                  <span className="text-[10px] uppercase tracking-wide text-gray-400">Not signed in yet</span>
                  {canAssign && (
                    <button type="button" onClick={() => remove('email', email, email)} disabled={busy}
                      aria-label={`Remove ${email}`} className="text-gray-400 hover:text-red-600 disabled:opacity-50">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </span>
              ))}
            </>
          )}
        {canAssign && !adding && (
          <button type="button" onClick={openPicker} disabled={busy}
            className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline disabled:opacity-50">
            <Plus className="w-3.5 h-3.5" /> Add owner
          </button>
        )}
      </div>

      {(createdBy || owners.viaClient.length > 0) && (
        <p className="text-xs text-gray-500 mt-1.5">
          {createdBy && <>Created by {createdBy}</>}
          {createdBy && owners.viaClient.length > 0 && ' · '}
          {owners.viaClient.length > 0 && <>Also open to the client&apos;s owners: {owners.viaClient.join(', ')}</>}
        </p>
      )}

      {canAssign && adding && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {people === null && !error ? (
            <span className="inline-flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading people…
            </span>
          ) : (
            <select value={pick} onChange={(e) => setPick(e.target.value)} disabled={busy}
              className="min-w-[14rem] rounded-lg border border-gray-300 px-3 py-1.5 text-sm">
              <option value="">Choose a person or work group…</option>
              {choices.people.length > 0 && (
                <optgroup label="People">
                  {choices.people.map((p) => (
                    <option key={p.uid} value={`uid:${p.uid}`}>{p.displayName || p.email}</option>
                  ))}
                </optgroup>
              )}
              {choices.groups.length > 0 && (
                <optgroup label="Work groups">
                  {choices.groups.map((g) => <option key={g.id} value={`group:${g.id}`}>{g.name}</option>)}
                </optgroup>
              )}
            </select>
          )}
          <button type="button" onClick={add} disabled={!pick || busy}
            className="px-3 py-1.5 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 disabled:opacity-50">
            {busy ? 'Saving…' : 'Add'}
          </button>
          <button type="button" onClick={() => setAdding(false)} disabled={busy}
            className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800">
            Cancel
          </button>
        </div>
      )}

      {owners.people.length > 1 && (
        <div className="mt-2 pt-2 border-t border-gray-100 flex flex-wrap items-center gap-2">
          <label className="text-xs text-gray-500" htmlFor="order-broker">
            Broker on the SA and Dispatch Sheet
          </label>
          {/* The explanation is a tooltip so the strip stays one line high. */}
          <select id="order-broker" value={owners.brokerUid ?? ''} disabled={busy}
            onChange={(e) => setBroker(e.target.value)}
            title="Their name, work phone and email go on the agreements, and replies to those emails reach them. Applies to the next send; anything already sent keeps the name it went out with."
            className="rounded-md border border-gray-300 px-2 py-0.5 text-xs">
            {owners.people.map((p) => (
              <option key={p.uid} value={p.uid}>
                {p.name}{p.uid === order.createdBy ? ' (created the order)' : ''}
              </option>
            ))}
          </select>
          <span className="text-xs text-gray-400">Applies to the next send.</span>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  );
}
