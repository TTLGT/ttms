'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Check, Trash2, UserPlus } from 'lucide-react';
import {
  listAllowedUsers,
  inviteUsers,
  setAllowedUserRole,
  revokeUser,
} from '@/lib/allowedUsers';
import {
  ALLOWED_EMAIL_DOMAIN,
  isAllowedEmailDomain,
  isBootstrapAdmin,
  normalizeEmail,
  parseEmailList,
} from '@/lib/accessControl';
import { useAuth } from '@/context/AuthContext';
import type { AllowedUser, AllowedUserRole, InviteResult } from '@/types/allowedUser';
import BatsImportPanel from '@/components/settings/BatsImportPanel';
import WorkGroupsPanel from '@/components/settings/WorkGroupsPanel';

const ROLE_CHIPS: { field: AllowedUserRole; label: string }[] = [
  { field: 'isAdmin',      label: 'Admin' },
  { field: 'isDispatcher', label: 'Dispatcher' },
  { field: 'isFinance',    label: 'Finance' },
];

export default function SettingsPage() {
  const { user, isAdmin }       = useAuth();
  const router                  = useRouter();
  const [people, setPeople]     = useState<AllowedUser[]>([]);
  const [loading, setLoading]   = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [error, setError]       = useState('');
  const [busy, setBusy]         = useState<string | null>(null);

  const [newEmails, setNewEmails] = useState('');
  const [newRoles, setNewRoles]   = useState({ isAdmin: false, isDispatcher: false, isFinance: false });
  const [inviting, setInviting]   = useState(false);
  const [results, setResults]     = useState<InviteResult[]>([]);

  const myEmail = normalizeEmail(user?.email);

  // Parsed live so the admin sees the count and any off-domain address before
  // submitting. This runs the same parse the server does, so the preview and
  // the outcome cannot disagree.
  const parsed    = useMemo(() => parseEmailList(newEmails), [newEmails]);
  const offDomain = useMemo(() => parsed.filter((e) => !isAllowedEmailDomain(e)), [parsed]);

  const refresh = useCallback(async () => {
    const list = await listAllowedUsers();
    setPeople(list);
    setLoadFailed(false);
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    refresh()
      .catch((e) => {
        // Distinguish "the list is genuinely empty" from "we never got the
        // list" — otherwise a permissions error reads as missing data.
        setLoadFailed(true);
        setError(e.message);
      })
      .finally(() => setLoading(false));
  }, [refresh]);

  useEffect(() => {
    if (!isAdmin) {
      router.replace('/dashboard');
      return;
    }
    load();
  }, [isAdmin, router, load]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (parsed.length === 0) return;

    setError('');
    setResults([]);
    setInviting(true);
    try {
      const rows = await inviteUsers(parsed, newRoles);
      setResults(rows);

      // Leave the addresses that did not land in the box so a typo can be
      // fixed in place and resubmitted; clear the ones that succeeded.
      const leftover = rows.filter((r) => r.status !== 'added').map((r) => r.email);
      setNewEmails(leftover.join('\n'));
      if (leftover.length === 0) {
        setNewRoles({ isAdmin: false, isDispatcher: false, isFinance: false });
      }

      await refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not grant access');
    } finally {
      setInviting(false);
    }
  }

  async function handleToggle(person: AllowedUser, field: AllowedUserRole) {
    const key = `${person.email}:${field}`;
    setBusy(key);
    setError('');
    try {
      await setAllowedUserRole(person.email, field, !person[field]);
      setPeople((prev) =>
        prev.map((p) => (p.email === person.email ? { ...p, [field]: !person[field] } : p)),
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not update role');
    } finally {
      setBusy(null);
    }
  }

  async function handleRevoke(person: AllowedUser) {
    const ok = window.confirm(
      `Remove access for ${person.email}?\n\nThey will be signed out immediately and will not be able to sign in again unless you re-add them.`,
    );
    if (!ok) return;

    setBusy(`${person.email}:revoke`);
    setError('');
    try {
      await revokeUser(person.email);
      setPeople((prev) => prev.filter((p) => p.email !== person.email));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not remove access');
    } finally {
      setBusy(null);
    }
  }

  const addedCount = results.filter((r) => r.status === 'added').length;

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-0.5">Manage team access and permissions</p>
      </div>

      {error && (
        <div className="mb-6 rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-600">
          {error}
        </div>
      )}

      <section className="bg-white rounded-xl border border-gray-200 mb-6">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Grant Access</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Only people on this list can sign in. Paste one or more{' '}
            <span className="font-medium text-gray-600">@{ALLOWED_EMAIL_DOMAIN}</span> addresses,
            one per line. They can sign in as soon as you add them, and appear below as “Pending”
            until they do.
          </p>
        </div>

        <form onSubmit={handleInvite} className="px-6 py-4 flex flex-col gap-3">
          <textarea
            value={newEmails}
            onChange={(e) => setNewEmails(e.target.value)}
            rows={5}
            spellCheck={false}
            placeholder={`name@${ALLOWED_EMAIL_DOMAIN}\nanother@${ALLOWED_EMAIL_DOMAIN}`}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          />

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-xs text-gray-500">
              {parsed.length === 0
                ? 'No addresses yet'
                : `${parsed.length} address${parsed.length === 1 ? '' : 'es'}`}
              {offDomain.length > 0 && (
                <span className="ml-2 text-amber-600">
                  · {offDomain.length} outside @{ALLOWED_EMAIL_DOMAIN}
                </span>
              )}
            </p>

            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Roles:</span>
              {ROLE_CHIPS.map(({ field, label }) => (
                <button
                  key={field}
                  type="button"
                  onClick={() => setNewRoles((r) => ({ ...r, [field]: !r[field] }))}
                  className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition ${
                    newRoles[field]
                      ? 'border-brand-200 bg-brand-50 text-brand-700'
                      : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {offDomain.length > 0 && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
              <div className="flex items-start gap-2">
                <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="font-medium">
                    {offDomain.length === 1 ? 'This address' : 'These addresses'} will be skipped —
                    check for a mistyped domain:
                  </p>
                  <ul className="mt-1 font-mono break-all">
                    {offDomain.map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          <div>
            <button
              type="submit"
              disabled={inviting || parsed.length === 0}
              className="flex items-center gap-2 rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <UserPlus size={15} />
              {inviting
                ? 'Adding…'
                : parsed.length > 1
                ? `Add ${parsed.length} People`
                : 'Add Person'}
            </button>
          </div>

          {results.length > 0 && (
            <div className="rounded-lg border border-gray-200 divide-y divide-gray-100">
              <div className="px-3 py-2 text-xs font-medium text-gray-600 bg-gray-50 rounded-t-lg">
                Added {addedCount} of {results.length}
              </div>
              {results.map((r) => (
                <div key={r.email} className="flex items-start gap-2 px-3 py-2 text-xs">
                  {r.status === 'added' ? (
                    <Check size={13} className="mt-0.5 text-green-600 flex-shrink-0" />
                  ) : (
                    <AlertCircle
                      size={13}
                      className={`mt-0.5 flex-shrink-0 ${
                        r.status === 'exists' ? 'text-gray-400' : 'text-amber-600'
                      }`}
                    />
                  )}
                  <span className="font-mono text-gray-700 truncate">{r.email}</span>
                  <span
                    className={`ml-auto flex-shrink-0 ${
                      r.status === 'added'
                        ? 'text-green-600'
                        : r.status === 'exists'
                        ? 'text-gray-500'
                        : 'text-amber-700'
                    }`}
                  >
                    {r.message}
                  </span>
                </div>
              ))}
            </div>
          )}
        </form>
      </section>

      <section className="bg-white rounded-xl border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">People With Access</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Admins can see all records and manage access. Dispatchers can send carrier/shipper
            agreements. Finance can generate BOLs and invoices. Click a role to toggle it.
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-7 h-7 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : loadFailed ? (
          <div className="py-16 text-center">
            <p className="text-sm text-gray-500">Could not load the list.</p>
            <button
              onClick={load}
              className="mt-3 text-xs font-medium text-brand-700 hover:text-brand-800 underline"
            >
              Try again
            </button>
          </div>
        ) : people.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400">
            No one has been granted access yet.
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {people.map((p) => {
              const isSelf      = normalizeEmail(p.email) === myEmail;
              const isProtected = isBootstrapAdmin(p.email);
              const pending     = !p.uid;

              return (
                <li key={p.email} className="flex items-center justify-between px-6 py-4 gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-semibold text-sm flex-shrink-0">
                      {p.email.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {p.email}
                        {isSelf && <span className="ml-1.5 text-xs text-gray-400">(you)</span>}
                      </p>
                      <p className="text-xs text-gray-500">
                        {pending ? (
                          <span className="text-amber-600">Pending first sign-in</span>
                        ) : (
                          <span className="text-green-600">Active</span>
                        )}
                        {isProtected && (
                          <span className="ml-2 text-gray-400">· Protected account</span>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    {ROLE_CHIPS.map(({ field, label }) => {
                      const active   = !!p[field];
                      const locked   = field === 'isAdmin' && (isSelf || isProtected);
                      const working  = busy === `${p.email}:${field}`;
                      return (
                        <button
                          key={field}
                          onClick={() => handleToggle(p, field)}
                          disabled={locked || working}
                          title={locked ? 'This admin role cannot be removed' : undefined}
                          className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition ${
                            locked
                              ? 'border-gray-200 text-gray-300 cursor-not-allowed'
                              : active
                              ? 'border-brand-200 bg-brand-50 text-brand-700'
                              : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                          }`}
                        >
                          {working ? '…' : label}
                        </button>
                      );
                    })}

                    <button
                      onClick={() => handleRevoke(p)}
                      disabled={isSelf || isProtected || busy === `${p.email}:revoke`}
                      title={
                        isSelf
                          ? 'You cannot remove your own access'
                          : isProtected
                          ? 'Protected accounts cannot be removed here'
                          : 'Remove access'
                      }
                      className={`p-2 rounded-lg border transition ${
                        isSelf || isProtected
                          ? 'border-gray-200 text-gray-300 cursor-not-allowed'
                          : 'border-gray-200 text-gray-400 hover:bg-red-50 hover:text-red-600 hover:border-red-200'
                      }`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <WorkGroupsPanel />
      <BatsImportPanel />
    </div>
  );
}
