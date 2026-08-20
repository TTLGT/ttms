'use client';

import { useEffect, useState } from 'react';
import { listWorkGroups, createWorkGroup, updateWorkGroup, deleteWorkGroup } from '@/lib/workGroups';
import { listUserProfiles } from '@/lib/userProfiles';
import type { WorkGroup } from '@/types/workGroup';
import type { UserProfile } from '@/types/userProfile';

/**
 * Admin management of work groups.
 *
 * A group owns clients, shippers and consignees on behalf of several people —
 * which is how the BATS records assigned to a team rather than a person ("TTL
 * Gabe's Team") end up visible to exactly the right people.
 */
export default function WorkGroupsPanel() {
  const [groups, setGroups]     = useState<WorkGroup[]>([]);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [busy, setBusy]         = useState('');

  const [newName, setNewName]   = useState('');
  const [editing, setEditing]   = useState<string | null>(null);
  const [draftMembers, setDraft] = useState<string[]>([]);

  async function load() {
    setError('');
    try {
      const [g, p] = await Promise.all([listWorkGroups(), listUserProfiles()]);
      setGroups(g);
      setProfiles(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load work groups');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const nameFor = (uid: string) => {
    const p = profiles.find((x) => x.uid === uid);
    return p ? (p.displayName || p.email) : uid;
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

  async function handleSaveMembers(groupId: string) {
    setBusy(groupId);
    setError('');
    try {
      await updateWorkGroup(groupId, { memberUids: draftMembers });
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
      `Delete "${group.name}"?\n\nAny client, shipper or consignee owned by this group ` +
      `will be detached from it. Records owned by nobody else become visible to everyone.`,
    );
    if (!ok) return;
    setBusy(group.id);
    setError('');
    try {
      const res = await deleteWorkGroup(group.id);
      if (res.detachedParties > 0) {
        setError(`Deleted. ${res.detachedParties} record(s) were detached from that group.`);
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete the group');
    } finally {
      setBusy('');
    }
  }

  return (
    <section className="bg-white rounded-xl border border-gray-200 mt-6">
      <div className="px-6 py-4 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-900">Work Groups</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Assign a client, shipper or consignee to a group and everyone in that group can see and
          use it. Useful for shared books of business and team accounts.
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
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{g.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {(g.memberUids ?? []).length === 0
                        ? 'No members yet — nobody can see this group’s records.'
                        : (g.memberUids ?? []).map(nameFor).join(', ')}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => {
                        setEditing(editing === g.id ? null : g.id);
                        setDraft(g.memberUids ?? []);
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

                {editing === g.id && (
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <div className="flex flex-wrap gap-3">
                      {profiles.map((p) => (
                        <label key={p.uid} className="flex items-center gap-2 text-sm text-gray-700">
                          <input
                            type="checkbox"
                            checked={draftMembers.includes(p.uid)}
                            onChange={(e) => setDraft((prev) =>
                              e.target.checked ? [...prev, p.uid] : prev.filter((u) => u !== p.uid)
                            )}
                          />
                          {p.displayName || p.email}
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
