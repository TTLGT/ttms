'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, LayoutList, Network, Pencil, Plus, Trash2, X } from 'lucide-react';
import { listTeams, createTeam, updateTeam, deleteTeam } from '@/lib/teams';
import { listUserProfiles } from '@/lib/userProfiles';
import { listAllowedUsers } from '@/lib/allowedUsers';
import { findTeamLead } from '@/types/team';
import { accessStatus, fullName } from '@/types/allowedUser';
import type { Team } from '@/types/team';
import type { UserProfile } from '@/types/userProfile';
import type { AllowedUser } from '@/types/allowedUser';
import { Bi } from '@/components/spanish/Es';
import { ConfirmDialog, EmptyState, Loading, Notice, SettingsCard } from './kit/ui';
import TeamOrgChart from './TeamOrgChart';

/**
 * Admin management of teams — the reporting structure.
 *
 * A team says who its members report to. For everybody but a Sales Manager it
 * is not an access boundary: putting someone on a team changes nothing about
 * what they can see. The exception is the team a Sales Manager leads, which is
 * that manager's scope — see src/lib/teamScope.ts. Work Groups are what share
 * records between people, and the copy here says so, because "team" is the
 * word people reach for when they mean either one.
 *
 * Two views: the list, for naming teams and their leads, and the org chart,
 * for moving people between them by dragging.
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
  const [view, setView] = useState<'list' | 'chart'>('list');
  const [deleting, setDeleting] = useState<Team | null>(null);

  const load = useCallback(async () => {
    setError('');
    try {
      // The allowlist is everyone; profiles are only those who have signed in.
      // The allowlist drives both the member count and the lead picker, because
      // a new hire who has been put on a team — or put in charge of one — before
      // their first sign-in is already on it. Profiles are still loaded for the
      // name Google reported, which is all there is to show for somebody an
      // admin never typed a name for.
      const [rows, signedIn, allowed] = await Promise.all([
        listTeams(), listUserProfiles(), listAllowedUsers(),
      ]);
      setTeams(rows);
      setProfiles(signedIn);
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

  /**
   * What to call someone. An admin-entered name wins over the one Google
   * reported, the same way it does at sign-in; the address is the last resort,
   * and the only thing there is for a pending invite nobody has named yet.
   */
  const personName = (p: AllowedUser) =>
    fullName(p) || profiles.find((x) => x.uid === p.uid)?.displayName || p.email;

  /** Everyone who can be picked as a lead, by name rather than by email. */
  const pickable = [...people].sort((a, b) => personName(a).localeCompare(personName(b)));

  const lead = (team: Team) => findTeamLead(team, people);

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
      await updateTeam(teamId, { name: draftName.trim(), lead: draftLead || null });
      setEditing(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save the team');
    } finally {
      setBusy('');
    }
  }

  async function handleDelete(team: Team) {
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

  /**
   * The lead picker, shared by the create row and the edit row.
   *
   * Keyed on email rather than uid because a pending invite has no uid yet, and
   * a team's lead is often exactly that person — the manager being hired to run
   * it. The API stores whichever of the two it can; see `src/types/team.ts`.
   * Who has signed in is still shown, so naming a lead who cannot open TTMS yet
   * is a choice rather than a surprise.
   */
  function LeadSelect({
    value, onChange: onPick, className,
  }: {
    value: string;
    onChange: (email: string) => void;
    className: string;
  }) {
    return (
      <select value={value} onChange={(e) => onPick(e.target.value)} className={className}>
        <option data-es value="">No lead yet</option>
        {pickable.map((p) => {
          const status = accessStatus(p);
          return (
            <option key={p.email} value={p.email}>
              {personName(p)}
              {status === 'pending' ? ' — has not signed in yet' : ''}
              {status === 'suspended' ? ' — suspended' : ''}
            </option>
          );
        })}
      </select>
    );
  }

  return (
    <SettingsCard
      aside={
        <div className="flex rounded-lg border border-gray-200 p-0.5" role="group" aria-label="View">
          {([['list', 'List', LayoutList], ['chart', 'Org chart', Network]] as const).map(([id, label, Icon]) => (
            <button key={id} type="button" onClick={() => setView(id)} aria-pressed={view === id}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition ${
                view === id ? 'bg-brand-50 text-brand-700' : 'text-gray-500 hover:bg-gray-50'
              }`}>
              <Icon size={13} /> <span data-es>{label}</span>
            </button>
          ))}
        </div>
      }
      description="Everyone on a team reports to its lead. A team often lines up with one office, but it does not have to. For anybody but a Sales Manager, a team changes nothing about what people can see — sharing records is what Work groups are for."
    >
      {view === 'chart' ? (
        loading ? <Loading /> : (
          <TeamOrgChart teams={teams} people={people} personName={personName} onMoved={load} />
        )
      ) : (
      <div className="space-y-4">
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

        {error && <Notice tone="amber">{error}</Notice>}

        {loading ? (
          <Loading />
        ) : teams.length === 0 ? (
          <EmptyState art="people" title="No teams yet" body="Add the first team above. People are put on a team from their page, or by dragging them in the org chart." />
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
                          {(() => {
                            const person = lead(team);
                            if (!person) return 'No lead yet';
                            // Worth saying out loud: a lead who has not signed
                            // in cannot yet see the team they are named on, and
                            // an admin who set this up weeks ago will want to
                            // know that is still true.
                            const waiting = accessStatus(person) === 'pending';
                            return `Reports to ${personName(person)}${
                              waiting ? ' (has not signed in yet)' : ''
                            }`;
                          })()}
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
                            setDraftLead(lead(team)?.email ?? '');
                          }}
                          title="Edit team"
                          className="p-2 rounded-lg border border-gray-200 text-gray-400 hover:bg-white hover:text-gray-600 transition"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => setDeleting(team)}
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
      )}
      <ConfirmDialog
        open={deleting !== null}
        title={`Delete “${deleting?.name ?? ''}”?`}
        body="Anyone on this team will be left without one. If a Sales Manager leads it, they stop managing those people."
        confirmLabel="Delete the team"
        tone="red"
        onCancel={() => setDeleting(null)}
        onConfirm={() => { const t = deleting!; setDeleting(null); void handleDelete(t); }}
      />
    </SettingsCard>
  );
}
