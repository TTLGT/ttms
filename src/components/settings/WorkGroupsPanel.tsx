'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, CircleDot, LayoutList, Pencil, Search, Trash2, UserMinus, UserPlus, X } from 'lucide-react';
import { listWorkGroups, createWorkGroup, updateWorkGroup, deleteWorkGroup } from '@/lib/workGroups';
import { listAllowedUsers } from '@/lib/allowedUsers';
import { workGroupReach } from '@/lib/settingsChanges';
import { accessStatus, fullName } from '@/types/allowedUser';
import type { WorkGroup } from '@/types/workGroup';
import type { AllowedUser } from '@/types/allowedUser';
import { Bi } from '@/components/spanish/Es';
import { useSaveBarEntry } from './kit/SaveBar';
import { ConfirmDialog, EmptyState, Loading, Notice, PreviewBox, SettingsCard } from './kit/ui';

/**
 * Admin management of work groups.
 *
 * A group owns clients, shippers, consignees and orders on behalf of several
 * people — which is how the BATS records assigned to a team rather than a
 * person ("TTL Gabe's Team") end up visible to exactly the right people.
 *
 * The member list is drawn from the allowlist, not from `users`, so somebody
 * can be put in a group before they have ever signed in: a group holds those
 * people by email and the membership converts to a uid on their first sign-in.
 *
 * **Membership is a setting, so it goes through the Save bar** — and before it
 * is saved, the preview says what it hands over: "Marta will now see the 14
 * clients and up to 32 loads this group owns". That count is three aggregation
 * queries, run only when a group is opened for editing. Renaming, adding and
 * deleting a group stay one-press actions.
 */
export default function WorkGroupsPanel() {
  const [groups, setGroups]   = useState<WorkGroup[]>([]);
  const [people, setPeople]   = useState<AllowedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [busy, setBusy]       = useState('');
  const [view, setView]       = useState<'list' | 'circles'>('list');

  const [newName, setNewName]     = useState('');
  const [editing, setEditing]     = useState<string | null>(null);
  const [renaming, setRenaming]   = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [deleting, setDeleting]   = useState<WorkGroup | null>(null);

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

  const label = (p: AllowedUser) => fullName(p) || p.displayName || p.email;
  /** A group stores signed-in members by uid and everyone else by email. */
  const emailForUid = (uid: string) => people.find((p) => p.uid === uid)?.email ?? uid;
  const membersOf = (g: WorkGroup) => [
    ...(g.memberUids ?? []).map(emailForUid),
    ...(g.memberEmails ?? []),
  ];

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    setError('');
    try { await fn(); await load(); } catch (e) { setError(e instanceof Error ? e.message : 'That did not work'); } finally { setBusy(''); }
  }

  async function saveMembers(groupId: string, emails: string[]) {
    const chosen = people.filter((p) => emails.includes(p.email));
    await updateWorkGroup(groupId, {
      memberUids:   chosen.map((p) => p.uid).filter((u): u is string => !!u),
      memberEmails: chosen.filter((p) => !p.uid).map((p) => p.email),
    });
    await load();
  }

  const editingGroup = groups.find((g) => g.id === editing) ?? null;

  return (
    <SettingsCard
      description="Give a client, shipper, consignee or load to a group and everyone in it can see and use it. People who have not signed in yet can be added now — they see the group’s records the first time they sign in."
      aside={
        <div className="flex rounded-lg border border-gray-200 p-0.5" role="group" aria-label="View">
          {([['list', 'List', LayoutList], ['circles', 'Circles', CircleDot]] as const).map(([id, text, Icon]) => (
            <button key={id} type="button" onClick={() => setView(id)} aria-pressed={view === id}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition ${
                view === id ? 'bg-brand-50 text-brand-700' : 'text-gray-500 hover:bg-gray-50'
              }`}>
              <Icon size={13} /> <span data-es>{text}</span>
            </button>
          ))}
        </div>
      }
    >
      <form className="flex flex-wrap gap-2" onSubmit={(e) => {
        e.preventDefault();
        if (newName.trim()) void run('create', async () => { await createWorkGroup(newName.trim(), []); setNewName(''); });
      }}>
        <input id="new-work-group" value={newName} onChange={(e) => setNewName(e.target.value)}
          placeholder="New group name, e.g. Gabe's Team"
          className="min-w-48 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
        <button type="submit" disabled={busy === 'create' || !newName.trim()}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50">
          <span data-es>{busy === 'create' ? 'Adding…' : 'Add group'}</span>
        </button>
      </form>

      {error && <Notice tone="amber" className="mt-4">{error}</Notice>}

      <div className="mt-5">
        {loading ? <Loading /> : groups.length === 0 ? (
          <EmptyState art="people" title="No work groups yet" body="A group lets several people share the same clients and loads." />
        ) : view === 'circles' ? (
          <Circles groups={groups} people={people} membersOf={membersOf} label={label}
            onOpen={(id) => { setView('list'); setEditing(id); setRenaming(null); }} />
        ) : (
          <ul className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200">
            {groups.map((g) => {
              const members = membersOf(g);
              return (
                <li key={g.id} className={editing === g.id ? 'bg-white' : 'bg-gray-50/50'}>
                  <div className="px-4 py-3">
                    {renaming === g.id ? (
                      <div className="flex items-center gap-2">
                        <input value={draftName} onChange={(e) => setDraftName(e.target.value)} autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') void run(g.id, async () => { await updateWorkGroup(g.id, { name: draftName.trim() }); setRenaming(null); });
                            if (e.key === 'Escape') setRenaming(null);
                          }}
                          className="min-w-40 flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
                        <button type="button" title="Save the new name" disabled={busy === g.id || !draftName.trim()}
                          onClick={() => void run(g.id, async () => { await updateWorkGroup(g.id, { name: draftName.trim() }); setRenaming(null); })}
                          className="rounded-lg border border-green-200 p-2 text-green-600 transition hover:bg-green-50 disabled:opacity-50">
                          <Check size={14} />
                        </button>
                        <button type="button" title="Cancel" onClick={() => setRenaming(null)}
                          className="rounded-lg border border-gray-200 p-2 text-gray-400 transition hover:bg-white">
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-900">{g.name}</p>
                          <p className="mt-0.5 text-xs text-gray-500">
                            {members.length === 0
                              ? 'No members yet — nobody can see this group’s records.'
                              : members.map((email) => {
                                const p = people.find((x) => x.email === email);
                                return p ? `${label(p)}${accessStatus(p) === 'pending' ? ' (not signed in yet)' : ''}` : email;
                              }).join(', ')}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <button type="button" title="Rename" onClick={() => { setRenaming(g.id); setDraftName(g.name); setEditing(null); }}
                            className="rounded-lg border border-gray-200 p-2 text-gray-400 transition hover:bg-white hover:text-gray-600">
                            <Pencil size={14} />
                          </button>
                          <button type="button" data-es onClick={() => setEditing(editing === g.id ? null : g.id)}
                            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                              editing === g.id ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-gray-300 text-gray-700 hover:bg-white'
                            }`}>
                            {editing === g.id ? 'Close' : 'Members'}
                          </button>
                          <button type="button" title="Delete" onClick={() => setDeleting(g)} disabled={busy === g.id}
                            className="rounded-lg border border-gray-200 p-2 text-gray-400 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-50">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  {editing === g.id && editingGroup && (
                    <MembersEditor
                      key={g.id}
                      group={g}
                      people={people}
                      initial={members}
                      label={label}
                      onSave={(emails) => saveMembers(g.id, emails)}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={deleting !== null}
        title={`Delete “${deleting?.name ?? ''}”?`}
        body="Any client, shipper, consignee or load owned by this group is detached from it. A load left with no owner is visible only to admin, dispatch and finance."
        confirmLabel="Delete the group"
        tone="red"
        onCancel={() => setDeleting(null)}
        onConfirm={() => { const g = deleting!; setDeleting(null); void run(g.id, () => deleteWorkGroup(g.id)); }}
      />
    </SettingsCard>
  );
}

/**
 * One group's members, as a draft for the Save bar, with what the change
 * hands over worked out beside it before anybody presses Save.
 */
function MembersEditor({
  group, people, initial, label, onSave,
}: {
  group: WorkGroup;
  people: AllowedUser[];
  initial: string[];
  label: (p: AllowedUser) => string;
  onSave: (emails: string[]) => Promise<void>;
}) {
  const [saved, setSaved] = useState<string[]>(initial);
  const [draft, setDraft] = useState<string[]>(initial);
  const [filter, setFilter] = useState('');
  const [reach, setReach] = useState<{ parties: number; ordersUpTo: number } | null>(null);

  useEffect(() => {
    let live = true;
    workGroupReach(group.id).then((r) => { if (live) setReach(r); }).catch(() => {});
    return () => { live = false; };
  }, [group.id]);

  const sortedKey = (l: string[]) => [...l].sort().join('|');
  const dirty = sortedKey(draft) !== sortedKey(saved);
  const added = draft.filter((e) => !saved.includes(e));
  const removed = saved.filter((e) => !draft.includes(e));
  const nameOf = (email: string) => {
    const p = people.find((x) => x.email === email);
    return p ? label(p) : email;
  };

  const { active } = useSaveBarEntry({
    dirty,
    save: async () => {
      const previous = saved;
      await onSave(draft);
      setSaved(draft);
      return async () => { await onSave(previous); setSaved(previous); setDraft(previous); };
    },
    discard: () => setDraft(saved),
  });

  const q = filter.trim().toLowerCase();
  const shown = useMemo(
    () => people
      .filter((p) => !q || `${label(p)} ${p.email}`.toLowerCase().includes(q))
      .sort((a, b) => Number(draft.includes(b.email)) - Number(draft.includes(a.email)) || label(a).localeCompare(label(b))),
    [people, q, draft, label],
  );

  return (
    <div className="grid gap-4 border-t border-gray-100 px-4 pb-4 pt-3 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div>
        <div className="relative mb-2">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Find a person"
            className="w-full rounded-lg border border-gray-300 py-1.5 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
        </div>
        <ul className="grid max-h-72 gap-1 overflow-y-auto sm:grid-cols-2">
          {shown.map((p) => {
            const on = draft.includes(p.email);
            const changed = on !== saved.includes(p.email);
            return (
              <li key={p.email}>
                <label className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition hover:bg-gray-50 ${changed ? 'bg-brand-50/60' : ''}`}>
                  <input type="checkbox" checked={on}
                    onChange={(e) => setDraft((prev) => (e.target.checked ? [...prev, p.email] : prev.filter((x) => x !== p.email)))} />
                  <span className="min-w-0 truncate text-gray-800">{label(p)}</span>
                  {accessStatus(p) === 'pending' && <span className="text-[11px] text-gray-400">not signed in</span>}
                </label>
              </li>
            );
          })}
        </ul>
        {!active && dirty && (
          <button type="button" onClick={() => void onSave(draft).then(() => setSaved(draft))}
            className="mt-3 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white">Save members</button>
        )}
      </div>

      <PreviewBox title="What this changes">
        {!dirty ? (
          <p className="text-sm text-gray-500"><Bi>Tick or untick people to see what they would gain or lose.</Bi></p>
        ) : (
          <div className="space-y-3 text-sm">
            {added.length > 0 && (
              <div>
                <p className="flex items-center gap-1.5 font-semibold text-green-700"><UserPlus size={14} /> {added.map(nameOf).join(', ')}</p>
                <p className="mt-0.5 text-gray-700">
                  {reach
                    ? <Bi vars={{ clients: reach.parties, loads: reach.ordersUpTo }}>{'Will now see the {clients} clients, shippers and consignees and up to {loads} loads this group owns.'}</Bi>
                    : <Bi>Will now see everything this group owns.</Bi>}
                </p>
              </div>
            )}
            {removed.length > 0 && (
              <div>
                <p className="flex items-center gap-1.5 font-semibold text-red-700"><UserMinus size={14} /> {removed.map(nameOf).join(', ')}</p>
                <p className="mt-0.5 text-gray-700">
                  <Bi>Stop seeing this group’s records — unless they own them, or reach them another way.</Bi>
                </p>
              </div>
            )}
          </div>
        )}
      </PreviewBox>
    </div>
  );
}

/**
 * Every group as a circle with its members' initials inside — who shares
 * with whom, at a glance. Somebody in two groups is in both circles. Click a
 * circle to edit it.
 */
function Circles({
  groups, people, membersOf, label, onOpen,
}: {
  groups: WorkGroup[];
  people: AllowedUser[];
  membersOf: (g: WorkGroup) => string[];
  label: (p: AllowedUser) => string;
  onOpen: (groupId: string) => void;
}) {
  const initials = (email: string) => {
    const p = people.find((x) => x.email === email);
    const name = p ? label(p) : email;
    return name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  };
  const tint = ['bg-blue-100 text-blue-700', 'bg-emerald-100 text-emerald-700', 'bg-amber-100 text-amber-800', 'bg-violet-100 text-violet-700', 'bg-rose-100 text-rose-700', 'bg-cyan-100 text-cyan-700'];
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {groups.map((g, i) => {
        const members = membersOf(g);
        return (
          <button key={g.id} type="button" onClick={() => onOpen(g.id)}
            className="group flex flex-col items-center rounded-xl p-3 text-center transition hover:bg-gray-50">
            <span className="relative flex aspect-square w-40 max-w-full flex-wrap content-center items-center justify-center gap-1 rounded-full border-2 border-dashed border-gray-300 p-5 transition group-hover:border-brand-400">
              {members.slice(0, 12).map((email) => (
                <span key={email} title={email}
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold ${tint[i % tint.length]}`}>
                  {initials(email)}
                </span>
              ))}
              {members.length > 12 && <span className="text-[11px] font-semibold text-gray-500">+{members.length - 12}</span>}
              {members.length === 0 && <span data-es className="text-xs text-gray-400">Nobody yet</span>}
            </span>
            <span className="mt-2 text-sm font-semibold text-gray-900">{g.name}</span>
            <span className="text-xs text-gray-500">{members.length} {members.length === 1 ? 'member' : 'members'}</span>
          </button>
        );
      })}
    </div>
  );
}
