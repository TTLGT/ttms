'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Lock, Search, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { canManagePerson } from '@/lib/accessControl';
import { listManageableUsers, setAllowedUserPermissions } from '@/lib/allowedUsers';
import { accessStatus, fullName, roleLabels } from '@/types/allowedUser';
import type { AllowedUser } from '@/types/allowedUser';
import {
  PERMISSION_GROUPS,
  isPermission,
  roleGivenPermissions,
  type Permission,
} from '@/types/permission';
import CollapsibleSection from '@/components/settings/CollapsibleSection';

/**
 * Every permission against every person, in one grid.
 *
 * The per-person block on the People tab answers "what can Maria do". This
 * answers the other question, the one that block cannot: "who can send
 * agreements?" — which, before permissions were divisible, was the same as
 * asking who was a dispatcher, and is now something you have to be able to
 * look up.
 *
 * A cell is one of three things, and the difference is the whole point of the
 * screen:
 *
 * - a **padlock** — they have it because of their role. Not clickable: taking
 *   it away means changing the role, on the People tab.
 * - a **tick** — granted to them individually. Click to take it back.
 * - **empty** — click to grant.
 *
 * People run down the side and permissions across the top rather than the
 * other way round, because the list of people is the one that grows: forty
 * rows scroll comfortably, forty columns do not.
 */
export default function PermissionsPage() {
  const { profile, can } = useAuth();

  const [people, setPeople]   = useState<AllowedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [busy, setBusy]       = useState('');
  const [query, setQuery]     = useState('');
  /** Which group of columns is on screen. All of them at once is unreadable. */
  const [group, setGroup]     = useState(PERMISSION_GROUPS[0].title);

  const load = useCallback(() => {
    setLoading(true);
    listManageableUsers(profile)
      .then((list) => { setPeople(list); setError(''); })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : 'Could not load the access list.'))
      .finally(() => setLoading(false));
  }, [profile]);

  useEffect(load, [load]);

  const columns = useMemo(
    () => PERMISSION_GROUPS.find((g) => g.title === group)?.permissions ?? [],
    [group],
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return people
      .filter((p) => {
        if (!q) return true;
        return `${fullName(p)} ${p.email}`.toLowerCase().includes(q);
      })
      .sort((a, b) => (fullName(a) || a.email).localeCompare(fullName(b) || b.email));
  }, [people, query]);

  /**
   * Whether this reader may change this cell.
   *
   * Two independent tests, and both have to pass: may they act on this person
   * at all — an admin may, a Sales Manager only within their team — and may
   * they hand over this particular permission. The server checks both again;
   * this is what keeps a cell from being clickable when the answer is no.
   */
  const editable = useCallback(
    (person: AllowedUser, permission: Permission) => {
      if (!canManagePerson(profile, { uid: person.uid, email: person.email })) return false;
      if (can('people.manage')) return true;
      return permission !== 'people.manage'
        && permission !== 'settings.manage'
        && can(permission);
    },
    [profile, can],
  );

  async function toggle(person: AllowedUser, permission: Permission) {
    const granted = new Set(
      (person.grantedPermissions ?? []).filter(isPermission),
    );
    if (granted.has(permission)) granted.delete(permission);
    else granted.add(permission);

    const key = `${person.email}:${permission}`;
    setBusy(key);
    setError('');
    try {
      const saved = await setAllowedUserPermissions(person.email, [...granted]);
      setPeople((prev) =>
        prev.map((p) => (p.email === person.email ? { ...p, grantedPermissions: saved } : p)),
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not save that change.');
    } finally {
      setBusy('');
    }
  }

  return (
    <CollapsibleSection
      id="permission-grid"
      title="Who Can Do What"
      defaultOpen
      description={
        <>
          A padlock means the permission comes with their role and can only be changed by
          changing the role, on the People tab. A tick means it was given to them
          individually — click it to take it back. An empty cell can be clicked to grant.
          Permissions only ever add: nothing here can take away what a role provides.
        </>
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1">
          {PERMISSION_GROUPS.map((g) => (
            <button
              key={g.title}
              onClick={() => setGroup(g.title)}
              aria-pressed={group === g.title}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                group === g.title
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
              }`}
            >
              {g.title}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-auto">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search a name or address"
            className="w-full sm:w-64 rounded-lg border border-gray-200 bg-white py-1.5 pl-9 pr-8 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              title="Clear"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:bg-gray-100"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
        </div>
      ) : (
        /* The grid scrolls inside its own box rather than widening the page —
           six columns of permissions is wider than the tab it sits on. */
        <div className="mt-4 overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                {/* Sticky so a name stays readable while the columns scroll. */}
                <th className="sticky left-0 z-10 bg-gray-50 px-4 py-3 text-left text-xs font-medium text-gray-500">
                  Person
                </th>
                {columns.map(({ key, label, detail }) => (
                  <th
                    key={key}
                    title={detail}
                    className="px-3 py-3 text-center text-xs font-medium text-gray-500"
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((person) => {
                const fromRole = roleGivenPermissions(person);
                const granted  = new Set(
                  (person.grantedPermissions ?? []).filter(isPermission),
                );
                const status = accessStatus(person);

                return (
                  <tr key={person.email} className="border-b border-gray-100 last:border-0">
                    <td className="sticky left-0 z-10 bg-white px-4 py-2">
                      <p className="truncate text-sm text-gray-900">
                        {fullName(person) || person.email}
                      </p>
                      <p className="truncate text-[11px] text-gray-400">
                        {roleLabels(person).join(', ')}
                        {status !== 'active' && ` · ${status}`}
                      </p>
                    </td>

                    {columns.map(({ key }) => {
                      const byRole = fromRole.has(key);
                      const held   = byRole || granted.has(key);
                      const locked = byRole || !editable(person, key);
                      const saving = busy === `${person.email}:${key}`;

                      return (
                        <td key={key} className="px-3 py-2 text-center">
                          <button
                            onClick={() => toggle(person, key)}
                            disabled={locked || saving}
                            title={
                              byRole
                                ? 'Comes with their role — change the role to remove it'
                                : locked
                                ? 'You cannot change this one'
                                : held
                                ? 'Granted individually — click to take it back'
                                : 'Click to grant'
                            }
                            className={`inline-flex h-6 w-6 items-center justify-center rounded-md border transition ${
                              byRole
                                ? 'border-gray-200 bg-gray-50 text-gray-400'
                                : held
                                ? 'border-brand-200 bg-brand-50 text-brand-700'
                                : locked
                                ? 'border-gray-100 text-gray-200'
                                : 'border-gray-200 text-gray-300 hover:border-brand-200 hover:bg-brand-50'
                            }`}
                          >
                            {saving
                              ? <span className="text-[10px]">…</span>
                              : byRole
                              ? <Lock size={11} />
                              : held
                              ? <Check size={13} />
                              : null}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>

          {rows.length === 0 && (
            <p className="py-12 text-center text-sm text-gray-400">Nobody matches that.</p>
          )}
        </div>
      )}

      <p className="mt-3 text-xs text-gray-400">
        Changes take effect on that person&rsquo;s next request — they do not have to sign in
        again. Your own row is here too: you cannot remove a permission your role gives you.
        {profile?.isSalesManager && !can('people.manage') && (
          <> You can only change the people on your team, and only permissions you hold yourself.</>
        )}
      </p>
    </CollapsibleSection>
  );
}
