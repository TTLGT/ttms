'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Check, GitCompare, Grid3x3, Lock, Search, User, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { canManagePerson } from '@/lib/accessControl';
import { listManageableUsers, setAllowedUserPermissions } from '@/lib/allowedUsers';
import { accessStatus, fullName, roleLabels } from '@/types/allowedUser';
import type { AllowedUser } from '@/types/allowedUser';
import {
  PERMISSION_GROUPS,
  effectivePermissions,
  isPermission,
  roleGivenPermissions,
  type Permission,
} from '@/types/permission';
import AbilityList from '@/components/settings/AbilityList';
import { useSaveBarEntry } from '@/components/settings/kit/SaveBar';
import { EmptyState, Loading, Notice, SettingsCard } from '@/components/settings/kit/ui';
import { personHref } from '@/components/settings/settingsSections';
import { Bi } from '@/components/spanish/Es';

/**
 * Who can do what — three ways to ask the same question.
 *
 * - **Grid**: every permission against every person. A padlock is a
 *   permission their role gives (change the role, on their page); a tick is
 *   one given to them individually; an empty cell can be ticked. Ticks are a
 *   draft for the Save bar now, so a row of them is one considered change
 *   rather than a dozen separate saves.
 * - **One person**: what somebody can do, in plain sentences.
 * - **Compare two**: "why can Ana see this load and Luis can't?" — what one
 *   can do and the other cannot, and whether it comes from a role or was
 *   given to them.
 *
 * People run down the side and permissions across the top, because the list
 * of people is the one that grows: forty rows scroll comfortably, forty
 * columns do not.
 */

type View = 'grid' | 'person' | 'compare';
const NON_DELEGABLE: Permission[] = ['people.manage', 'settings.manage'];

export default function PermissionsPage() {
  const { profile, can } = useAuth();
  const [people, setPeople]   = useState<AllowedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [view, setView]       = useState<View>('grid');

  const load = useCallback(async () => {
    try {
      setPeople(await listManageableUsers(profile));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the access list.');
    } finally {
      setLoading(false);
    }
  }, [profile]);
  useEffect(() => { void load(); }, [load]);

  const sorted = useMemo(
    () => [...people].sort((a, b) => (fullName(a) || a.email).localeCompare(fullName(b) || b.email)),
    [people],
  );

  /** May this reader change this cell — this person, this permission? The server checks both again. */
  const editable = useCallback((person: AllowedUser, permission: Permission) => {
    if (!canManagePerson(profile, { uid: person.uid, email: person.email })) return false;
    if (can('people.manage')) return true;
    return !NON_DELEGABLE.includes(permission) && can(permission);
  }, [profile, can]);

  const VIEWS: { id: View; label: string; Icon: typeof Grid3x3 }[] = [
    { id: 'grid', label: 'Grid', Icon: Grid3x3 },
    { id: 'person', label: 'One person', Icon: User },
    { id: 'compare', label: 'Compare two', Icon: GitCompare },
  ];

  return (
    <div className="space-y-4">
      <div className="flex w-fit rounded-lg border border-gray-200 bg-white p-0.5" role="group" aria-label="View">
        {VIEWS.map(({ id, label, Icon }) => (
          <button key={id} type="button" onClick={() => setView(id)} aria-pressed={view === id}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition ${
              view === id ? 'bg-brand-50 text-brand-700' : 'text-gray-500 hover:bg-gray-50'
            }`}>
            <Icon size={14} /> <span data-es>{label}</span>
          </button>
        ))}
      </div>

      {error && <Notice tone="red">{error}</Notice>}
      {loading ? <SettingsCard><Loading /></SettingsCard>
        : sorted.length === 0 ? <SettingsCard><EmptyState art="people" title="Nobody to show" /></SettingsCard>
        : (
          <>
            <div hidden={view !== 'grid'}><Grid people={sorted} editable={editable} onSaved={load} /></div>
            {view === 'person' && <OnePerson people={sorted} />}
            {view === 'compare' && <Compare people={sorted} />}
          </>
        )}
    </div>
  );
}

// ── Grid ────────────────────────────────────────────────────────────────────

function Grid({
  people, editable, onSaved,
}: {
  people: AllowedUser[];
  editable: (p: AllowedUser, k: Permission) => boolean;
  onSaved: () => Promise<void>;
}) {
  const { profile, can } = useAuth();
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState(PERMISSION_GROUPS[0].title);
  /** email → the granted list being drafted, only for people whose ticks changed. */
  const [draft, setDraft] = useState<Record<string, Permission[]>>({});

  const columns = useMemo(
    () => (PERMISSION_GROUPS.find((g) => g.title === group)?.permissions ?? []).filter((p) => p.key !== 'intern.section'),
    [group],
  );
  const grantedOf = (p: AllowedUser) => (p.grantedPermissions ?? []).filter(isPermission);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return people.filter((p) => !q || `${fullName(p)} ${p.email}`.toLowerCase().includes(q));
  }, [people, query]);

  const changed = Object.entries(draft).filter(([email, list]) => {
    const p = people.find((x) => x.email === email);
    return p && JSON.stringify([...list].sort()) !== JSON.stringify([...grantedOf(p)].sort());
  });

  useSaveBarEntry({
    dirty: changed.length > 0,
    save: async () => {
      const before: [string, Permission[]][] = changed.map(([email]) => [email, grantedOf(people.find((x) => x.email === email)!)]);
      for (const [email, list] of changed) await setAllowedUserPermissions(email, list);
      setDraft({});
      await onSaved();
      return async () => {
        for (const [email, list] of before) await setAllowedUserPermissions(email, list);
        await onSaved();
      };
    },
    discard: () => setDraft({}),
  });

  function toggle(person: AllowedUser, key: Permission) {
    setDraft((d) => {
      const current = d[person.email] ?? grantedOf(person);
      const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
      return { ...d, [person.email]: next };
    });
  }

  return (
    <SettingsCard
      description="A padlock comes with their role — change the role on their page to take it away. A tick was given to them individually. Ticks you change are marked, and nothing is saved until you press Save. Permissions only ever add."
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1">
          {PERMISSION_GROUPS.map((g) => (
            <button key={g.title} type="button" onClick={() => setGroup(g.title)} aria-pressed={group === g.title}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                group === g.title ? 'bg-brand-50 text-brand-700' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
              }`}>
              {g.title}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-auto">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input id="grid-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search a name or address"
            className="w-full rounded-lg border border-gray-200 bg-white py-1.5 pl-9 pr-8 text-sm sm:w-64" />
          {query && (
            <button type="button" onClick={() => setQuery('')} title="Clear" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:bg-gray-100">
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th data-es className="sticky left-0 z-10 bg-gray-50 px-4 py-3 text-left text-xs font-medium text-gray-500">Person</th>
              {columns.map(({ key, label, detail }) => (
                <th key={key} title={detail} className="px-3 py-3 text-center text-xs font-medium text-gray-500">{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((person) => {
              const fromRole = roleGivenPermissions(person);
              const saved = new Set(grantedOf(person));
              const granted = new Set(draft[person.email] ?? grantedOf(person));
              const status = accessStatus(person);
              return (
                <tr key={person.email} className="border-b border-gray-100 last:border-0">
                  <td className="sticky left-0 z-10 bg-white px-4 py-2">
                    <Link href={personHref(person.email)} className="block truncate text-sm text-gray-900 hover:text-brand-700 hover:underline">
                      {fullName(person) || person.email}
                    </Link>
                    <p className="truncate text-[11px] text-gray-400">
                      {roleLabels(person).join(', ')}{status !== 'active' && ` · ${status}`}
                    </p>
                  </td>
                  {columns.map(({ key }) => {
                    const byRole = fromRole.has(key);
                    const held = byRole || granted.has(key);
                    const locked = byRole || !editable(person, key);
                    const moved = !byRole && granted.has(key) !== saved.has(key);
                    return (
                      <td key={key} className="px-3 py-2 text-center">
                        <button type="button" onClick={() => toggle(person, key)} disabled={locked}
                          title={byRole ? 'Comes with their role — change the role to remove it'
                            : locked ? 'You cannot change this one'
                            : held ? 'Given individually — click to take it back' : 'Click to give it'}
                          className={`inline-flex h-6 w-6 items-center justify-center rounded-md border transition ${
                            moved ? 'border-brand-500 ring-2 ring-brand-300' : ''
                          } ${
                            byRole ? 'border-gray-200 bg-gray-50 text-gray-400'
                              : held ? 'border-brand-200 bg-brand-50 text-brand-700'
                              : locked ? 'border-gray-100 text-gray-200'
                              : 'border-gray-200 text-gray-300 hover:border-brand-200 hover:bg-brand-50'
                          }`}>
                          {byRole ? <Lock size={11} /> : held ? <Check size={13} /> : null}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <p data-es className="py-12 text-center text-sm text-gray-400">Nobody matches that.</p>}
      </div>

      <p className="mt-3 text-xs text-gray-400">
        <Bi>Changes take effect on that person’s next request — they do not have to sign in again.</Bi>
        {profile?.isSalesManager && !can('people.manage') && (
          <> <Bi>You can only change the people on your team, and only permissions you hold yourself.</Bi></>
        )}
      </p>
    </SettingsCard>
  );
}

// ── One person ──────────────────────────────────────────────────────────────

function PersonPicker({ people, value, onChange, label, id }: {
  people: AllowedUser[];
  value: string;
  onChange: (email: string) => void;
  label: string;
  id: string;
}) {
  return (
    <label htmlFor={id} className="block text-sm">
      <span data-es className="font-medium text-gray-700">{label}</span>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm">
        <option value="">Choose someone…</option>
        {people.map((p) => <option key={p.email} value={p.email}>{fullName(p) || p.email} — {roleLabels(p).join(', ')}</option>)}
      </select>
    </label>
  );
}

function OnePerson({ people }: { people: AllowedUser[] }) {
  const [email, setEmail] = useState('');
  const person = people.find((p) => p.email === email) ?? null;
  return (
    <SettingsCard description="Everything one person can do, in plain words — and what they cannot.">
      <div className="max-w-md">
        <PersonPicker id="one-person" people={people} value={email} onChange={setEmail} label="Person" />
      </div>
      {person && (
        <div className="mt-5">
          <AbilityList
            held={new Set(effectivePermissions(person, (person.grantedPermissions ?? []).filter(isPermission)))}
            fromRole={roleGivenPermissions(person)}
            who={fullName(person) || person.email}
          />
          <Link href={personHref(person.email)} className="mt-4 inline-block text-sm font-medium text-brand-700 hover:underline">
            <Bi>Change what they can do on their page</Bi>
          </Link>
        </div>
      )}
    </SettingsCard>
  );
}

// ── Compare two ─────────────────────────────────────────────────────────────

function Compare({ people }: { people: AllowedUser[] }) {
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const pa = people.find((p) => p.email === a) ?? null;
  const pb = people.find((p) => p.email === b) ?? null;

  const facts = (p: AllowedUser) => {
    const granted = (p.grantedPermissions ?? []).filter(isPermission);
    return { held: new Set(effectivePermissions(p, granted)), fromRole: roleGivenPermissions(p) };
  };

  const all = PERMISSION_GROUPS.flatMap((g) => g.permissions).filter((p) => p.key !== 'intern.section');
  const fa = pa ? facts(pa) : null;
  const fb = pb ? facts(pb) : null;
  const onlyA = fa && fb ? all.filter((p) => fa.held.has(p.key) && !fb.held.has(p.key)) : [];
  const onlyB = fa && fb ? all.filter((p) => fb.held.has(p.key) && !fa.held.has(p.key)) : [];
  const both = fa && fb ? all.filter((p) => fa.held.has(p.key) && fb.held.has(p.key)) : [];
  const nameA = pa ? fullName(pa) || pa.email : '';
  const nameB = pb ? fullName(pb) || pb.email : '';
  const why = (p: AllowedUser, f: { fromRole: Set<Permission> }, key: Permission) =>
    f.fromRole.has(key) ? `from their role (${roleLabels(p).join(', ')})` : 'given to them individually';

  return (
    <SettingsCard description="Pick two people to see what one can do and the other cannot — the answer to “why can Ana see this load and Luis can’t?”. Whether somebody can open one particular load also depends on who owns it; this compares what they are allowed, not whose records they hold.">
      <div className="grid gap-4 sm:grid-cols-2">
        <PersonPicker id="compare-a" people={people} value={a} onChange={setA} label="First person" />
        <PersonPicker id="compare-b" people={people.filter((p) => p.email !== a)} value={b} onChange={setB} label="Second person" />
      </div>

      {pa && pb && fa && fb && (
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {[
            { title: `Only ${nameA}`, items: onlyA, who: pa, f: fa, tone: 'border-blue-200 bg-blue-50/50' },
            { title: `Only ${nameB}`, items: onlyB, who: pb, f: fb, tone: 'border-violet-200 bg-violet-50/50' },
          ].map((col) => (
            <div key={col.title} className={`rounded-xl border p-4 ${col.tone}`}>
              <p className="text-sm font-semibold text-gray-900">{col.title}</p>
              {col.items.length === 0 ? (
                <p className="mt-2 text-sm text-gray-500"><Bi>Nothing the other cannot do.</Bi></p>
              ) : (
                <ul className="mt-2 space-y-1.5 text-sm">
                  {col.items.map((p) => (
                    <li key={p.key}>
                      <span className="text-gray-900">{p.label}</span>
                      <span className="block text-xs text-gray-500">{why(col.who, col.f, p.key)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
          <div className="rounded-xl border border-gray-200 p-4">
            <p className="text-sm font-semibold text-gray-900"><Bi vars={{ n: both.length }}>{'Both ({n})'}</Bi></p>
            <ul className="mt-2 max-h-80 space-y-0.5 overflow-y-auto text-xs text-gray-600">
              {both.map((p) => <li key={p.key}>{p.label}</li>)}
            </ul>
          </div>
        </div>
      )}
    </SettingsCard>
  );
}
