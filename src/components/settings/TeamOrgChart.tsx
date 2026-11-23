'use client';

import { useState } from 'react';
import { GripVertical, Crown } from 'lucide-react';
import { setAllowedUserDetails } from '@/lib/allowedUsers';
import { detailsOf } from '@/lib/personDetails';
import { accessStatus, type AllowedUser } from '@/types/allowedUser';
import { findTeamLead, type Team } from '@/types/team';
import { Bi } from '@/components/spanish/Es';
import { ConfirmDialog, Notice } from './kit/ui';

/**
 * The teams as an org chart: one column per team, its lead on top, the people
 * on it underneath, and a column for everybody on no team.
 *
 * Moving somebody is a drag onto another column, or the "Move to" menu on
 * their card (a phone cannot drag, and neither can a keyboard). Either way it
 * asks first — "Move Luis to Vivian's team?" — because a team led by a Sales
 * Manager is that manager's scope: moving a person hands them to a different
 * manager. Confirming is one ordinary details save, which re-syncs every
 * manager's scope on the server like any other team change.
 */
export default function TeamOrgChart({
  teams, people, personName, onMoved,
}: {
  teams: Team[];
  people: AllowedUser[];
  personName: (p: AllowedUser) => string;
  onMoved: () => Promise<void> | void;
}) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [pending, setPending] = useState<{ person: AllowedUser; teamId: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const columns: { id: string | null; name: string; lead: AllowedUser | null }[] = [
    ...teams.map((t) => ({ id: t.id, name: t.name, lead: findTeamLead(t, people) ?? null })),
    { id: null, name: 'No team', lead: null },
  ];
  const membersOf = (teamId: string | null) =>
    people
      .filter((p) => (p.teamId ?? null) === teamId)
      .sort((a, b) => personName(a).localeCompare(personName(b)));

  function ask(email: string, teamId: string | null) {
    const person = people.find((p) => p.email === email);
    if (!person || (person.teamId ?? null) === teamId) return;
    setPending({ person, teamId });
  }

  async function move() {
    if (!pending) return;
    setBusy(true);
    setError('');
    try {
      await setAllowedUserDetails(pending.person.email, { ...detailsOf(pending.person), teamId: pending.teamId });
      setPending(null);
      await onMoved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not move them');
    } finally {
      setBusy(false);
    }
  }

  const target = pending ? columns.find((c) => c.id === pending.teamId) : null;

  return (
    <div>
      <p className="mb-3 text-sm text-gray-500">
        <Bi>Drag a person onto another team, or use Move to on their card. You are asked before anything changes.</Bi>
      </p>
      {error && <Notice tone="red" className="mb-3">{error}</Notice>}
      <div className="flex gap-3 overflow-x-auto pb-2">
        {columns.map((col) => {
          const members = membersOf(col.id);
          const key = col.id ?? 'none';
          return (
            <section
              key={key}
              aria-label={col.name}
              onDragOver={(e) => { if (dragging) { e.preventDefault(); setOver(key); } }}
              onDragLeave={() => setOver((o) => (o === key ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                const email = e.dataTransfer.getData('text/plain');
                if (email) ask(email, col.id);
              }}
              className={`flex w-60 flex-shrink-0 flex-col rounded-xl border p-3 transition ${
                over === key ? 'border-brand-400 bg-brand-50 ring-2 ring-brand-300' : col.id ? 'border-gray-200 bg-gray-50' : 'border-dashed border-gray-300 bg-white'
              }`}
            >
              <header className="mb-2">
                <p className="text-sm font-semibold text-gray-900">{col.id ? col.name : <span data-es>No team</span>}</p>
                {col.id && (
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-500">
                    <Crown size={12} className="text-amber-500" />
                    {col.lead ? personName(col.lead) : <span data-es>No lead yet</span>}
                    {col.lead?.isSalesManager && <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] font-semibold text-amber-700">Sales Manager</span>}
                  </p>
                )}
                <p className="mt-0.5 text-[11px] text-gray-400">{members.length} {members.length === 1 ? 'person' : 'people'}</p>
              </header>
              <ul className="flex min-h-[3rem] flex-col gap-1.5">
                {members.map((p) => (
                  <li
                    key={p.email}
                    draggable
                    onDragStart={(e) => { e.dataTransfer.setData('text/plain', p.email); e.dataTransfer.effectAllowed = 'move'; setDragging(p.email); }}
                    onDragEnd={() => { setDragging(null); setOver(null); }}
                    className={`group flex cursor-grab items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm shadow-sm active:cursor-grabbing ${
                      dragging === p.email ? 'opacity-50' : ''
                    }`}
                  >
                    <GripVertical size={13} className="flex-shrink-0 text-gray-300" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-gray-900">{personName(p)}</span>
                      {accessStatus(p) !== 'active' && (
                        <span className="block text-[10px] text-gray-400">{accessStatus(p) === 'pending' ? 'Not signed in yet' : 'Suspended'}</span>
                      )}
                    </span>
                    <select
                      aria-label={`Move ${personName(p)} to another team`}
                      value=""
                      onChange={(e) => ask(p.email, e.target.value === '__none' ? null : e.target.value)}
                      className="max-w-[5.5rem] flex-shrink-0 cursor-pointer rounded border border-gray-200 bg-white py-0.5 pl-1 pr-5 text-[11px] text-gray-500 opacity-70 transition group-hover:opacity-100 focus:opacity-100"
                      title="Move to another team"
                    >
                      <option value="" disabled>Move to…</option>
                      {columns.filter((c) => c.id !== (p.teamId ?? null)).map((c) => (
                        <option key={c.id ?? '__none'} value={c.id ?? '__none'}>{c.name}</option>
                      ))}
                    </select>
                  </li>
                ))}
                {members.length === 0 && (
                  <li data-es className="rounded-lg border border-dashed border-gray-200 px-2 py-3 text-center text-xs text-gray-400">Drop someone here</li>
                )}
              </ul>
            </section>
          );
        })}
      </div>

      <ConfirmDialog
        open={pending !== null}
        title={pending ? `Move ${personName(pending.person)} to ${target?.id ? `${target.name}` : 'no team'}?` : ''}
        body={
          pending && target?.id
            ? target.lead
              ? `They will report to ${personName(target.lead)}.${target.lead.isSalesManager ? ` ${personName(target.lead)} is a Sales Manager, so from now on they can manage ${personName(pending.person)}’s details and permissions.` : ''}`
              : 'This team has no lead yet.'
            : 'They will report to nobody until they are put on a team.'
        }
        confirmLabel="Move them"
        busy={busy}
        onCancel={() => setPending(null)}
        onConfirm={() => void move()}
      />
    </div>
  );
}
