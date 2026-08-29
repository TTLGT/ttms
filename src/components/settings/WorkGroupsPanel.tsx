'use client';

import { useEffect, useState } from 'react';
import { Check, Pencil, X } from 'lucide-react';
import { listWorkGroups, createWorkGroup, updateWorkGroup, deleteWorkGroup } from '@/lib/workGroups';
import { listAllowedUsers } from '@/lib/allowedUsers';
import { accessStatus } from '@/types/allowedUser';
import type { WorkGroup } from '@/types/workGroup';
import type { AllowedUser } from '@/types/allowedUser';

/**
 * Admin management of work groups.
 *
 * A group owns clients, shippers, consignees and orders on behalf of several
 * people — which is how the BATS records assigned to a team rather than a
 * person ("TTL Gabe's Team") end up visible to exactly the right people.
 *
 * The member list is drawn from the allowlist, not from `users`, so that
 * somebody can be put in a group before they have ever signed in. A group
 * holds those people by email and the membership converts to a uid on their
 * first sign-in — otherwise a new hire could not be set up until their first
 * day, which is exactly when nobody has time to do it.
 */
export default function WorkGroupsPanel() {
  const [groups, setGroups]   = useState<WorkGroup[]>([]);
  const [people, setPeople]   = useState<AllowedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [busy, setBusy]       = useState('');

  const [newName, setNewName]    = useState('');
  const [editing, setEditing]    = useState<string | null>(null);
  /** Renaming is its own mode, separate from editing membership: the two rows
      would fight for the same space, and an admin fixing a typo in a name has
      no business being shown a member list. */
  const [renaming, setRenaming]  = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  /** Draft membership is keyed by email — the one id a person has before they sign in. */
  const [draftMembers, setDraft] = useState<string[]>([]);

  async function load() {
    setError('');
    try {
      const [g, p] = await Promise.all([listWorkGroups(), listAllowedUsers()]);
      setGroups(g);
      setPeople(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load work groups');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const personLabel = (p: AllowedUser) => p.displayName || p.email;

  /** A group stores signed-in members by uid and everyone else by email. */
  const emailForUid = (uid: string) => people.find((p) => p.uid === uid)?.email ?? uid;
  const membersOf = (g: WorkGroup) => [
    ...(g.memberUids ?? []).map(emailForUid),
    ...(g.memberEmails ?? []),
  ];

  const summaryFor = (g: WorkGroup) => {
    const emails = membersOf(g);
    if (emails.length === 0) return 'No members yet — nobody can see this group’s records.';
    return emails
      .map((email) => {
        const person = people.find((p) => p.email === email);
        if (!person) return email;
        return accessStatus(person) === 'pending'
          ? `${personLabel(person)} (not signed in yet)`
          : personLabel(person);
      })
      .join(', ');
  };

  async function handleCreate() {
    if (!newName.trim()) return;
    setBusy('create');
    setError('');
    try {
      await createWorkGroup(newName.trim(), []);
      setNewName('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create the group');
    } finally {
      setBusy('');
    }
  }

  /**
   * Renames a group. Only the label changes — the group's id is what every
   * party, order and profile points at, so records stay exactly where they
   * were and nobody's access moves.
   */
  async function handleRename(groupId: string) {
    if (!draftName.trim()) return;
    setBusy(groupId);
    setError('');
    try {
      await updateWorkGroup(groupId, { name: draftName.trim() });
      setRenaming(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to rename the group');
    } finally {
      setBusy('');
    }
  }

  async function handleSaveMembers(groupId: string) {
    setBusy(groupId);
    setError('');
    try {
      // Split by whether the person has a uid yet. Someone who has never
      // signed in is stored under their email and moves across on first login.
      const chosen = people.filter((p) => draftMembers.includes(p.email));
      await updateWorkGroup(groupId, {
        memberUids:   chosen.map((p) => p.uid).filter((u): u is string => !!u),
        memberEmails: chosen.filter((p) => !p.uid).map((p) => p.email),
      });
      setEditing(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save members');
    } finally {
      setBusy('');
    }
  }

  async function handleDelete(group: WorkGroup) {
    const ok = window.confirm(
      `Delete "${group.name}"?\n\nAny client, shipper, consignee or order owned by this group ` +
      `will be detached from it. Orders left without an owner are visible only to admin, ` +
      `dispatch and finance.`,
    );
    if (!ok) return;
    setBusy(group.id);
    setError('');
    try {
      const res = await deleteWorkGroup(group.id);
      const detached = res.detachedParties + (res.detachedOrders ?? 0);
      if (detached > 0) {
        setError(`Deleted. ${detached} record(s) were detached from that group.`);
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete the group');
    } finally {
      setBusy('');
    }
  }

  return (
    <section className="bg-white rounded-xl border border-gray-200">
      <div className="px-6 py-4 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-900">Work Groups</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Assign a client, shipper, consignee or order to a group and everyone in that group can
          see and use it. People who have not signed in yet can be added now — they will see the
          group’s records the first time they log in.
        </p>
      </div>

      <div className="p-6 space-y-4">
        <div className="flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New group name, e.g. Gabe's Team"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
          <button
            onClick={handleCreate}
            disabled={busy === 'create' || !newName.trim()}
            className="px-4 py-2 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 transition disabled:opacity-50"
          >
            {busy === 'create' ? 'Adding…' : 'Add group'}
          </button>
        </div>

        {error && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : groups.length === 0 ? (
          <p className="text-sm text-gray-400">No work groups yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg overflow-hidden">
            {groups.map((g) => (
              <li key={g.id} className="px-4 py-3 bg-gray-50">
                {renaming === g.id ? (
                  <div className="flex gap-2 items-center">
                    <input
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void handleRename(g.id);
                        if (e.key === 'Escape') setRenaming(null);
                      }}
                      autoFocus
                      className="flex-1 min-w-40 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                    />
                    <button
                      onClick={() => handleRename(g.id)}
                      disabled={busy === g.id || !draftName.trim()}
                      title="Save name"
                      className="p-2 rounded-lg border border-green-200 text-green-600 hover:bg-green-50 transition disabled:opacity-50"
                    >
                      <Check size={14} />
                    </button>
                    <button
                      onClick={() => setRenaming(null)}
                      title="Cancel"
                      className="p-2 rounded-lg border border-gray-200 text-gray-400 hover:bg-white transition"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{g.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{summaryFor(g)}</p>
                  </div>
                  <div className="flex gap-2 shrink-0 items-center">
                    <button
                      onClick={() => {
                        setRenaming(g.id);
                        setDraftName(g.name);
                        setEditing(null);
                      }}
                      title="Rename group"
                      className="p-2 rounded-lg border border-gray-300 text-gray-400 hover:bg-white hover:text-gray-600 transition"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => {
                        setEditing(editing === g.id ? null : g.id);
                        setDraft(membersOf(g));
                      }}
                      className="px-3 py-1.5 border border-gray-300 text-gray-700 text-xs font-medium rounded-lg hover:bg-white transition"
                    >
                      {editing === g.id ? 'Cancel' : 'Members'}
                    </button>
                    <button
                      onClick={() => handleDelete(g)}
                      disabled={busy === g.id}
                      className="px-3 py-1.5 border border-red-200 text-red-600 text-xs font-medium rounded-lg hover:bg-red-50 transition disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                )}

                {editing === g.id && (
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <div className="flex flex-wrap gap-3">
                      {people.map((p) => (
                        <label key={p.email} className="flex items-center gap-2 text-sm text-gray-700">
                          <input
                            type="checkbox"
                            checked={draftMembers.includes(p.email)}
                            onChange={(e) => setDraft((prev) =>
                              e.target.checked ? [...prev, p.email] : prev.filter((x) => x !== p.email)
                            )}
                          />
                          {personLabel(p)}
                          {accessStatus(p) === 'pending' && (
                            <span className="text-xs text-gray-400">(not signed in yet)</span>
                          )}
                        </label>
                      ))}
                    </div>
                    <button
                      onClick={() => handleSaveMembers(g.id)}
                      disabled={busy === g.id}
                      className="mt-3 px-3 py-1.5 bg-brand-600 text-white text-xs font-semibold rounded-lg hover:bg-brand-700 transition disabled:opacity-50"
                    >
                      {busy === g.id ? 'Saving…' : 'Save members'}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
