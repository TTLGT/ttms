'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { listTeams, createTeam, updateTeam, deleteTeam } from '@/lib/teams';
import { listUserProfiles } from '@/lib/userProfiles';
import { listAllowedUsers } from '@/lib/allowedUsers';
import type { Team } from '@/types/team';
import type { UserProfile } from '@/types/userProfile';
import type { AllowedUser } from '@/types/allowedUser';

/**
 * Admin management of teams — the reporting structure.
 *
 * A team says who its members report to. It is NOT an access boundary: putting
 * someone on a team changes nothing about what they can see. Work Groups below
 * are the thing that shares records, and the two are kept apart on purpose so
 * that recording the org chart can never hand somebody another team's clients.
 * The copy in this panel says so out loud, because "team" is the word people
 * reach for when they mean either one.
 *
 * People are assigned to a team in the People With Access list above, which
 * reads the same collection.
 */
export default function TeamsPanel({ onChange }: { onChange?: (teams: Team[]) => void }) {
  const [teams, setTeams]       = useState<Team[]>([]);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [people, setPeople]     = useState<AllowedUser[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [busy, setBusy]         = useState('');

  const [newName, setNewName] = useState('');
  const [newLead, setNewLead] = useState('');

  const [editing, setEditing]     = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftLead, setDraftLead] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      // Profiles are needed for the lead picker, and only people who have
      // actually signed in have one — which is the right constraint here: a
      // team cannot report to an invite nobody has accepted yet.
      // The allowlist is everyone; profiles are only those who have signed in.
      // Both are needed: the member count has to include a new hire who has
      // been put on a team but has not logged in yet, while the lead picker
      // deliberately offers only signed-in people.
      const [rows, signedIn, allowed] = await Promise.all([
        listTeams(), listUserProfiles(), listAllowedUsers(),
      ]);
      setTeams(rows);
      setProfiles(
        signedIn.sort((a, b) =>
          (a.displayName || a.email).localeCompare(b.displayName || b.email)),
      );
      setPeople(allowed);
      // The people list needs the same rows to render its team picker, so it
      // is handed them here rather than fetching the collection a second time.
      onChange?.(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load teams');
    } finally {
      setLoading(false);
    }
  }, [onChange]);

  useEffect(() => { void load(); }, [load]);

  const leadName = (uid: string | null | undefined) => {
    if (!uid) return null;
    const p = profiles.find((x) => x.uid === uid);
    return p ? (p.displayName || p.email) : null;
  };

  /**
   * How many people report through this team, counted off the allowlist rather
   * than off profiles — somebody assigned to a team before their first sign-in
   * is already a member of it, and counting profiles would show the team as
   * empty right when it is being set up.
   */
  const memberCount = (teamId: string) => people.filter((p) => p.teamId === teamId).length;

  async function handleCreate() {
    if (!newName.trim()) return;
    setBusy('create');
    setError('');
    try {
      await createTeam(newName.trim(), newLead || null);
      setNewName('');
      setNewLead('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create the team');
    } finally {
      setBusy('');
    }
  }

  async function handleSave(teamId: string) {
    if (!draftName.trim()) return;
    setBusy(teamId);
    setError('');
    try {
      await updateTeam(teamId, { name: draftName.trim(), leadUid: draftLead || null });
      setEditing(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save the team');
    } finally {
      setBusy('');
    }
  }

  async function handleDelete(team: Team) {
    const ok = window.confirm(
      `Delete "${team.name}"?\n\nAnyone on this team will be left without one. ` +
      `Their access does not change.`,
    );
    if (!ok) return;
    setBusy(team.id);
    setError('');
    try {
      const res = await deleteTeam(team.id);
      if (res.detachedUsers > 0) {
        setError(`Deleted. ${res.detachedUsers} person(s) no longer have a team.`);
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete the team');
    } finally {
      setBusy('');
    }
  }

  /** The lead picker, shared by the create row and the edit row. */
  function LeadSelect({
    value, onChange: onPick, className,
  }: {
    value: string;
    onChange: (uid: string) => void;
    className: string;
  }) {
    return (
      <select value={value} onChange={(e) => onPick(e.target.value)} className={className}>
        <option value="">No lead yet</option>
        {profiles.map((p) => (
          <option key={p.uid} value={p.uid}>{p.displayName || p.email}</option>
        ))}
      </select>
    );
  }

  return (
    <section className="bg-white rounded-xl border border-gray-200 mt-6">
      <div className="px-6 py-4 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-900">Teams</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Who reports to whom. Everyone on a team reports to that team&rsquo;s lead. A team often
          lines up with one office, but it does not have to — where someone sits is set separately
          under Sites. Putting someone on a team records their place in the org chart; it does not
          change what they can see. Sharing records between people is what Work Groups below are
          for.
        </p>
      </div>

      <div className="p-6 space-y-4">
        <div className="flex gap-2 flex-wrap">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Team name, e.g. Top Brokers"
            className="flex-1 min-w-48 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
          <LeadSelect
            value={newLead}
            onChange={setNewLead}
            className="flex-1 min-w-48 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
          <button
            onClick={handleCreate}
            disabled={busy === 'create' || !newName.trim()}
            className="flex items-center gap-1.5 px-4 py-2 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 transition disabled:opacity-50"
          >
            <Plus size={15} />
            {busy === 'create' ? 'Adding…' : 'Add team'}
          </button>
        </div>

        {error && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : teams.length === 0 ? (
          <p className="text-sm text-gray-400">
            No teams yet. Add one and it becomes assignable in the list above.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg overflow-hidden">
            {teams.map((team) => {
              const members = memberCount(team.id);
              return (
                <li key={team.id} className="px-4 py-3 bg-gray-50">
                  {editing === team.id ? (
                    <div className="flex gap-2 flex-wrap items-center">
                      <input
                        value={draftName}
                        onChange={(e) => setDraftName(e.target.value)}
                        className="flex-1 min-w-40 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                      />
                      <LeadSelect
                        value={draftLead}
                        onChange={setDraftLead}
                        className="flex-1 min-w-40 border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
                      />
                      <button
                        onClick={() => handleSave(team.id)}
                        disabled={busy === team.id || !draftName.trim()}
                        title="Save"
                        className="p-2 rounded-lg border border-green-200 text-green-600 hover:bg-green-50 transition disabled:opacity-50"
                      >
                        <Check size={14} />
                      </button>
                      <button
                        onClick={() => setEditing(null)}
                        title="Cancel"
                        className="p-2 rounded-lg border border-gray-200 text-gray-400 hover:bg-white transition"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900">{team.name}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {leadName(team.leadUid)
                            ? `Reports to ${leadName(team.leadUid)}`
                            : 'No lead yet'}
                          {' · '}
                          {members === 0
                            ? 'nobody on it yet'
                            : `${members} ${members === 1 ? 'person' : 'people'}`}
                        </p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button
                          onClick={() => {
                            setEditing(team.id);
                            setDraftName(team.name);
                            setDraftLead(team.leadUid ?? '');
                          }}
                          title="Edit team"
                          className="p-2 rounded-lg border border-gray-200 text-gray-400 hover:bg-white hover:text-gray-600 transition"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(team)}
                          disabled={busy === team.id}
                          title="Delete team"
                          className="p-2 rounded-lg border border-gray-200 text-gray-400 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition disabled:opacity-50"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
