'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle, ArrowDown, ArrowUp, Ban, Check, Download, Pencil, RotateCcw, Trash2, UserPlus, X,
} from 'lucide-react';
import {
  listAllowedUsers,
  inviteUsers,
  setAllowedUserRole,
  setAllowedUserDetails,
  setAllowedUserPhoto,
  setAllowedUserSuspended,
  revokeUser,
} from '@/lib/allowedUsers';
import {
  ALLOWED_EMAIL_DOMAIN,
  isAllowedEmailDomain,
  isBootstrapAdmin,
  isBroker,
  normalizeEmail,
  parseEmailList,
} from '@/lib/accessControl';
import { useAuth } from '@/context/AuthContext';
import { accessStatus, fullName, splitName } from '@/types/allowedUser';
import type { AllowedUser, AllowedUserRole, InviteResult } from '@/types/allowedUser';
import { toCsv, csvDate, downloadCsv } from '@/lib/csv';
import type { Site } from '@/types/site';
import BatsImportPanel from '@/components/settings/BatsImportPanel';
import SitesPanel from '@/components/settings/SitesPanel';
import { AvatarUploader, UserAvatar } from '@/components/settings/UserAvatar';
import WorkGroupsPanel from '@/components/settings/WorkGroupsPanel';

/**
 * The elevated roles. Broker is not among them: it is the default everyone
 * has until one of these is granted, so it is shown as a chip but derived
 * rather than stored (see isBroker in accessControl).
 */
const ROLE_CHIPS: { field: AllowedUserRole; label: string }[] = [
  { field: 'isAdmin',      label: 'Admin' },
  { field: 'isDispatcher', label: 'Dispatcher' },
  { field: 'isFinance',    label: 'Finance' },
];

const NO_ROLES = { isAdmin: false, isDispatcher: false, isFinance: false };

type StatusFilter = 'all' | 'active' | 'pending' | 'suspended';
/** 'broker' means "no elevated role" — the default everyone starts with. */
type RoleFilter   = 'all' | AllowedUserRole | 'broker';
type SortField =
  | 'firstName' | 'lastName' | 'email' | 'phone' | 'phoneGt' | 'extension' | 'added';
type SortDir   = 'asc' | 'desc';

const SORT_FIELDS: { key: SortField; label: string }[] = [
  { key: 'firstName', label: 'First name' },
  { key: 'lastName',  label: 'Last name' },
  { key: 'email',     label: 'Email' },
  { key: 'phone',     label: 'Work phone (US)' },
  { key: 'phoneGt',   label: 'Guatemala phone' },
  { key: 'extension', label: 'Extension' },
  { key: 'added',     label: 'Date added' },
];

/** Direction reads differently depending on what is being ordered. */
function directionLabel(field: SortField, dir: SortDir): string {
  if (field === 'added') return dir === 'asc' ? 'Oldest first' : 'Newest first';
  if (field === 'phone' || field === 'phoneGt' || field === 'extension') {
    return dir === 'asc' ? 'Low → High' : 'High → Low';
  }
  return dir === 'asc' ? 'A → Z' : 'Z → A';
}

const digitsOnly = (value: string | null | undefined) => (value ?? '').replace(/\D/g, '');

/**
 * Phone numbers are typed however the admin types them — (555) 123-4567,
 * 555.123.4567, +1 555 123 4567 — so they are compared as digits alone. The
 * country code is dropped so a number entered with it files next to the same
 * number entered without, rather than in a separate block of its own: +1 for
 * the US line, +502 for the Guatemala one.
 */
function phoneKey(value: string | null | undefined, countryCode: '1' | '502'): string {
  const d = digitsOnly(value);
  const national = countryCode === '1' ? 10 : 8;
  return d.length === national + countryCode.length && d.startsWith(countryCode)
    ? d.slice(countryCode.length)
    : d;
}

/**
 * Extensions are numbers, so they have to sort like numbers: comparing them as
 * text would put 1050 ahead of 204. Zero-padding to a fixed width gets numeric
 * order out of the same string compare everything else uses. Anything not
 * purely numeric falls back to its own text.
 */
function extensionKey(p: AllowedUser): string {
  const raw = (p.extension ?? '').trim().toLowerCase();
  const d = digitsOnly(raw);
  return d ? d.padStart(8, '0') : raw;
}

/**
 * The text a row sorts under. Empty for someone the field is blank on, which
 * the comparator treats as "unknown" and sends to the end — a block of blanks
 * at the top is just noise, and pending invites often have no details at all.
 */
function sortText(p: AllowedUser, field: SortField): string {
  if (field === 'email')     return p.email.toLowerCase();
  if (field === 'phone')     return phoneKey(p.phone, '1');
  if (field === 'phoneGt')   return phoneKey(p.phoneGt, '502');
  if (field === 'extension') return extensionKey(p);
  const value = field === 'lastName' ? p.lastName : p.firstName;
  return (value ?? '').trim().toLowerCase();
}

/**
 * Firestore hands back a Timestamp, but an entry created before `invitedAt`
 * existed has none. Those sort to the end either way rather than jumping to
 * the top as epoch zero.
 */
function millis(ts: { toDate?: () => Date } | null | undefined): number | null {
  return ts && typeof ts.toDate === 'function' ? ts.toDate().getTime() : null;
}

function formatWhen(ts: { toDate?: () => Date } | null | undefined): string {
  const ms = millis(ts);
  if (ms === null) return 'date unknown';
  return new Date(ms).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}
type TileTone     = 'gray' | 'green' | 'amber' | 'red';

const TILE_TONE: Record<TileTone, string> = {
  gray:  'text-gray-900',
  green: 'text-green-600',
  amber: 'text-amber-600',
  red:   'text-red-600',
};

/** A count that doubles as the control for the filter it counts. */
function CountTile({
  label,
  count,
  tone = 'gray',
  active,
  onClick,
}: {
  label: string;
  count: number;
  tone?: TileTone;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex items-baseline gap-1.5 rounded-lg border px-3 py-1.5 transition ${
        active
          ? 'border-brand-300 bg-brand-50'
          : 'border-gray-200 bg-white hover:bg-gray-50'
      }`}
    >
      <span
        className={`text-sm font-semibold tabular-nums ${
          active ? 'text-brand-800' : TILE_TONE[tone]
        }`}
      >
        {count}
      </span>
      <span className={`text-xs font-medium ${active ? 'text-brand-700' : 'text-gray-500'}`}>
        {label}
      </span>
    </button>
  );
}

export default function SettingsPage() {
  const { user, isAdmin }       = useAuth();
  const router                  = useRouter();
  const [people, setPeople]     = useState<AllowedUser[]>([]);
  const [loading, setLoading]   = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [error, setError]       = useState('');
  const [busy, setBusy]         = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [roleFilter, setRoleFilter]     = useState<RoleFilter>('all');
  const [sortField, setSortField]       = useState<SortField>('firstName');
  const [sortDir, setSortDir]           = useState<SortDir>('asc');

  // Loaded by SitesPanel below and handed up, so the collection is read once
  // for both the picker here and the list there.
  const [sites, setSites] = useState<Site[]>([]);
  const siteName = (id: string | null | undefined) =>
    sites.find((x) => x.id === id)?.name ?? null;

  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft]     = useState({
    firstName: '', lastName: '', phone: '', phoneGt: '', extension: '', siteId: '',
  });

  const [newEmails, setNewEmails] = useState('');
  const [newRoles, setNewRoles]   = useState(NO_ROLES);
  const [newSiteId, setNewSiteId] = useState('');
  const [inviting, setInviting]   = useState(false);
  const [results, setResults]     = useState<InviteResult[]>([]);

  const myEmail = normalizeEmail(user?.email);

  // Parsed live so the admin sees the count and any off-domain address before
  // submitting. This runs the same parse the server does, so the preview and
  // the outcome cannot disagree.
  const parsed    = useMemo(() => parseEmailList(newEmails), [newEmails]);
  const offDomain = useMemo(() => parsed.filter((e) => !isAllowedEmailDomain(e)), [parsed]);

  const handleSitesLoaded = useCallback((rows: Site[]) => {
    setSites(rows);
    // Deleting a site clears it from everyone assigned to it server-side.
    // Mirror that here so a row does not keep pointing at a site that is gone;
    // the guard keeps this from re-rendering on the ordinary first load.
    const live = new Set(rows.map((r) => r.id));
    setPeople((prev) =>
      prev.some((p) => p.siteId && !live.has(p.siteId))
        ? prev.map((p) => (p.siteId && !live.has(p.siteId) ? { ...p, siteId: null } : p))
        : prev,
    );
  }, []);

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
      const rows = await inviteUsers(parsed, newRoles, newSiteId || null);
      setResults(rows);

      // Leave the addresses that did not land in the box so a typo can be
      // fixed in place and resubmitted; clear the ones that succeeded.
      const leftover = rows.filter((r) => r.status !== 'added').map((r) => r.email);
      setNewEmails(leftover.join('\n'));
      if (leftover.length === 0) {
        setNewRoles(NO_ROLES);
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

  /**
   * Exports exactly what is on screen — same filters, same order — because the
   * list an admin has narrowed down is the one they are asking for. The header
   * says how many rows that is, so an unexpected filter cannot go unnoticed.
   */
  function handleExport() {
    const header = [
      'First name', 'Last name', 'Email', 'Work phone (US)', 'Guatemala phone',
      'Extension', 'Site', 'Roles', 'Status', 'Added', 'Added by', 'Last sign-in',
    ];

    const rows = visiblePeople.map((p) => {
      const roles = ROLE_CHIPS.filter(({ field }) => p[field]).map(({ label }) => label);
      return [
        p.firstName ?? '',
        p.lastName ?? '',
        p.email,
        p.phone ?? '',
        p.phoneGt ?? '',
        p.extension ?? '',
        siteName(p.siteId) ?? '',
        // Broker is the absence of the others, so it is spelled out here rather
        // than leaving the cell blank and making the reader infer it.
        roles.length > 0 ? roles.join(', ') : 'Broker',
        accessStatus(p),
        csvDate(p.invitedAt),
        p.invitedBy ?? '',
        csvDate(p.lastLoginAt),
      ];
    });

    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`people-with-access-${stamp}.csv`, toCsv([header, ...rows]));
  }

  function startEditing(person: AllowedUser) {
    // An entry saved before the name was split has only displayName; seed the
    // two fields from it so editing anything else does not wipe the name.
    const name = person.firstName || person.lastName
      ? { firstName: person.firstName ?? '', lastName: person.lastName ?? '' }
      : splitName(person.displayName);

    setEditing(person.email);
    setDraft({
      ...name,
      phone:     person.phone ?? '',
      phoneGt:   person.phoneGt ?? '',
      extension: person.extension ?? '',
      siteId:    person.siteId ?? '',
    });
  }

  async function handlePhoto(person: AllowedUser, photoPath: string | null) {
    await setAllowedUserPhoto(person.email, photoPath);
    setPeople((prev) =>
      prev.map((p) => (p.email === person.email ? { ...p, photoPath } : p)),
    );
  }

  async function handleSaveDetails(person: AllowedUser) {
    setBusy(`${person.email}:details`);
    setError('');
    try {
      const details = { ...draft, siteId: draft.siteId || null };
      await setAllowedUserDetails(person.email, details);
      // The server composes displayName from the two parts; mirror that here so
      // the row does not keep showing the name it had before the edit.
      const displayName = [details.firstName, details.lastName].filter(Boolean).join(' ');
      setPeople((prev) =>
        prev.map((p) => (p.email === person.email ? { ...p, ...details, displayName } : p)),
      );
      setEditing(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not save the details');
    } finally {
      setBusy(null);
    }
  }

  /**
   * Demote back to the default. There is no broker flag to set — being a broker
   * is the absence of the others — so this clears whichever ones are on.
   */
  async function handleMakeBroker(person: AllowedUser) {
    const held = ROLE_CHIPS.filter(({ field }) => person[field]);
    if (held.length === 0) return;

    setBusy(`${person.email}:broker`);
    setError('');
    try {
      for (const { field } of held) {
        await setAllowedUserRole(person.email, field, false);
      }
      setPeople((prev) =>
        prev.map((p) => (p.email === person.email ? { ...p, ...NO_ROLES } : p)),
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not update roles');
      // A role may have been cleared before the failure — resync rather than
      // leave the row showing a state the server never reached.
      await refresh().catch(() => {});
    } finally {
      setBusy(null);
    }
  }

  async function handleSuspend(person: AllowedUser) {
    const suspending = !person.suspended;
    if (suspending) {
      const ok = window.confirm(
        `Suspend access for ${person.email}?

They will be signed out immediately and cannot sign in until you restore them. Their roles are kept, so restoring puts everything back.`,
      );
      if (!ok) return;
    }

    setBusy(`${person.email}:suspend`);
    setError('');
    try {
      await setAllowedUserSuspended(person.email, suspending);
      setPeople((prev) =>
        prev.map((p) => (p.email === person.email ? { ...p, suspended: suspending } : p)),
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not update access');
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

  // Counted off the full list, not the filtered one, so the tiles keep showing
  // the whole picture while a filter is applied. Role counts overlap — one
  // person can hold several roles — so they do not sum to the total.
  const counts = useMemo(() => {
    const roleCount = (p: AllowedUser) =>
      Number(p.isAdmin) + Number(p.isDispatcher) + Number(p.isFinance);
    return {
      all:          people.length,
      active:       people.filter((p) => accessStatus(p) === 'active').length,
      pending:      people.filter((p) => accessStatus(p) === 'pending').length,
      suspended:    people.filter((p) => accessStatus(p) === 'suspended').length,
      isAdmin:      people.filter((p) => p.isAdmin).length,
      isDispatcher: people.filter((p) => p.isDispatcher).length,
      isFinance:    people.filter((p) => p.isFinance).length,
      broker:       people.filter(isBroker).length,
      multiRole:    people.filter((p) => roleCount(p) > 1).length,
    };
  }, [people]);

  const visiblePeople = useMemo(() => {
    const rows = people.filter((p) => {
      if (statusFilter !== 'all' && accessStatus(p) !== statusFilter) return false;
      if (roleFilter === 'broker') return isBroker(p);
      if (roleFilter !== 'all')    return !!p[roleFilter];
      return true;
    });
    const flip = sortDir === 'asc' ? 1 : -1;

    return rows.sort((a, b) => {
      if (sortField === 'added') {
        const at = millis(a.invitedAt);
        const bt = millis(b.invitedAt);
        // Undated entries go last in both directions — they say nothing about
        // when they were added, so neither end of the list is right for them.
        if (at === null || bt === null) return at === bt ? 0 : at === null ? 1 : -1;
        // 'asc' reads as oldest first here, which is what the label promises.
        return (at - bt) * flip;
      }

      const at = sortText(a, sortField);
      const bt = sortText(b, sortField);
      if (!at || !bt) {
        // Same rule as undated: a blank field is unknown, not empty-string-first.
        if (at !== bt) return at ? -1 : 1;
        return a.email.localeCompare(b.email) * flip;
      }

      // Email breaks ties so two people sharing a first name — or an extension
      // — keep a stable order rather than whatever the filter pass produced.
      return (at.localeCompare(bt) || a.email.localeCompare(b.email)) * flip;
    });
  }, [people, statusFilter, roleFilter, sortField, sortDir]);

  const filtered = statusFilter !== 'all' || roleFilter !== 'all';

  function clearFilters() {
    setStatusFilter('all');
    setRoleFilter('all');
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
            until they do. The roles and site you pick apply to everyone in the batch; names,
            phone numbers and extensions are per-person, so add those below once they are on
            the list.
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

            <div className="flex items-center gap-2 flex-wrap">
              <label className="flex items-center gap-1.5 text-xs text-gray-500">
                Site:
                <select
                  value={newSiteId}
                  onChange={(e) => setNewSiteId(e.target.value)}
                  className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs font-medium text-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-400"
                >
                  <option value="">No site</option>
                  {sites.map((site) => (
                    <option key={site.id} value={site.id}>{site.name}</option>
                  ))}
                </select>
              </label>

              <span className="text-xs text-gray-500 ml-1">Roles:</span>
              <button
                type="button"
                onClick={() => setNewRoles(NO_ROLES)}
                title="The default — their own clients and loads, nothing else"
                className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition ${
                  isBroker(newRoles)
                    ? 'border-brand-200 bg-brand-50 text-brand-700'
                    : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                }`}
              >
                Broker
              </button>
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
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-gray-900">People With Access</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Everyone is a Broker by default — their own clients and loads, and nothing they
                do not own. Admins can see all records and manage access, dispatchers can send
                carrier/shipper agreements, and finance can generate BOLs and invoices. Click a
                role to toggle it, or Broker to take the others away. Suspending blocks sign-in
                but keeps the roles, so access can be restored; removing deletes the entry
                outright.
              </p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-2xl font-bold text-gray-900 leading-none tabular-nums">
                {counts.all}
              </p>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mt-1">
                {counts.all === 1 ? 'Person' : 'People'}
              </p>
            </div>
          </div>
        </div>

        {!loading && !loadFailed && people.length > 0 && (
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex flex-col gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 w-24 flex-shrink-0">
                Status
              </span>
              <CountTile
                label="Everyone"
                count={counts.all}
                active={statusFilter === 'all'}
                onClick={() => setStatusFilter('all')}
              />
              <CountTile
                label="Active"
                count={counts.active}
                tone="green"
                active={statusFilter === 'active'}
                onClick={() => setStatusFilter('active')}
              />
              <CountTile
                label="Pending"
                count={counts.pending}
                tone="amber"
                active={statusFilter === 'pending'}
                onClick={() => setStatusFilter('pending')}
              />
              <CountTile
                label="Suspended"
                count={counts.suspended}
                tone="red"
                active={statusFilter === 'suspended'}
                onClick={() => setStatusFilter('suspended')}
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 w-24 flex-shrink-0">
                Permissions
              </span>
              <CountTile
                label="Everyone"
                count={counts.all}
                active={roleFilter === 'all'}
                onClick={() => setRoleFilter('all')}
              />
              <CountTile
                label="Broker"
                count={counts.broker}
                active={roleFilter === 'broker'}
                onClick={() => setRoleFilter('broker')}
              />
              {ROLE_CHIPS.map(({ field, label }) => (
                <CountTile
                  key={field}
                  label={label}
                  count={counts[field]}
                  active={roleFilter === field}
                  onClick={() => setRoleFilter(field)}
                />
              ))}
            </div>

            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-xs text-gray-500">
                Showing {visiblePeople.length} of {counts.all}
                {/* Roles are not exclusive, so the permission tiles can total
                    more than the headcount — say so rather than let it read
                    as a miscount. */}
                {counts.multiRole > 0 && (
                  <span className="ml-2 text-gray-400">
                    · {counts.multiRole} hold more than one role
                  </span>
                )}
              </p>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleExport}
                  disabled={visiblePeople.length === 0}
                  title="Download the list as shown, as a CSV that opens in Excel"
                  className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Download size={13} />
                  Export CSV
                </button>
                {filtered && (
                  <button
                    onClick={clearFilters}
                    className="text-xs font-medium text-brand-700 hover:text-brand-800 underline"
                  >
                    Clear filters
                  </button>
                )}
                <label className="flex items-center gap-1.5 text-xs text-gray-500">
                  Sort by
                  <select
                    value={sortField}
                    onChange={(e) => setSortField(e.target.value as SortField)}
                    className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs font-medium text-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-400"
                  >
                    {SORT_FIELDS.map(({ key, label }) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </label>
                <button
                  onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
                  title="Reverse the order"
                  className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition"
                >
                  {sortDir === 'asc' ? <ArrowDown size={13} /> : <ArrowUp size={13} />}
                  {directionLabel(sortField, sortDir)}
                </button>
              </div>
            </div>
          </div>
        )}

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
        ) : visiblePeople.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm text-gray-400">No one matches these filters.</p>
            <button
              onClick={clearFilters}
              className="mt-3 text-xs font-medium text-brand-700 hover:text-brand-800 underline"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {visiblePeople.map((p) => {
              const isSelf      = normalizeEmail(p.email) === myEmail;
              const isProtected = isBootstrapAdmin(p.email);
              const status      = accessStatus(p);
              const suspended   = status === 'suspended';

              return (
                <li key={p.email} className={suspended ? 'bg-red-50/40' : ''}>
                  <div className="flex items-center justify-between px-6 py-4 gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                    <UserAvatar
                      photoPath={p.photoPath}
                      fallback={(fullName(p) || p.email).charAt(0).toUpperCase()}
                      muted={suspended}
                    />
                    <div className="min-w-0">
                      <p
                        className={`text-sm font-medium truncate ${
                          suspended ? 'text-gray-500' : 'text-gray-900'
                        }`}
                      >
                        {fullName(p) || p.email}
                        {isSelf && <span className="ml-1.5 text-xs text-gray-400">(you)</span>}
                      </p>

                      {/* Only worth a line of its own once a name is displacing
                          it from the line above. */}
                      {fullName(p) && (
                        <p className="text-xs text-gray-500 truncate">{p.email}</p>
                      )}

                      {/* The US number carries the extension and site with it;
                          crowding the GT number onto the same line pushed those
                          two past the truncation point. */}
                      {(p.phone || p.extension || p.siteId) && (
                        <p className="text-xs text-gray-500 truncate">
                          {[
                            // Labelled, because two bare numbers on adjacent
                            // lines give no clue which to dial from where.
                            p.phone ? `US ${p.phone}` : null,
                            p.extension ? `ext. ${p.extension}` : null,
                            siteName(p.siteId),
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      )}

                      {p.phoneGt && (
                        <p className="text-xs text-gray-500 truncate">GT {p.phoneGt}</p>
                      )}

                      <p className="text-xs text-gray-500">
                        {status === 'suspended' ? (
                          <span className="text-red-600 font-medium">Suspended</span>
                        ) : status === 'pending' ? (
                          <span className="text-amber-600">Pending first sign-in</span>
                        ) : (
                          <span className="text-green-600">Active</span>
                        )}
                        {isProtected && (
                          <span className="ml-2 text-gray-400">· Protected account</span>
                        )}
                      </p>

                      <p className="text-[11px] text-gray-400 mt-0.5">
                        Added {formatWhen(p.invitedAt)}
                        {p.invitedBy ? ` by ${p.invitedBy}` : ''}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    {(() => {
                      const active = isBroker(p);
                      // Demoting means dropping admin, which these two accounts
                      // are never allowed to do.
                      const locked = (isSelf && p.isAdmin) || (isProtected && p.isAdmin);
                      const working = busy === `${p.email}:broker`;
                      return (
                        <button
                          onClick={() => handleMakeBroker(p)}
                          disabled={active || locked || working}
                          title={
                            locked
                              ? 'This admin role cannot be removed'
                              : active
                              ? 'The default role — their own clients and loads'
                              : 'Remove the other roles and leave them a broker'
                          }
                          className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition ${
                            locked
                              ? 'border-gray-200 text-gray-300 cursor-not-allowed'
                              : active && suspended
                              ? 'border-gray-200 bg-gray-100 text-gray-500'
                              : active
                              ? 'border-brand-200 bg-brand-50 text-brand-700 cursor-default'
                              : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                          }`}
                        >
                          {working ? '…' : 'Broker'}
                        </button>
                      );
                    })()}

                    {ROLE_CHIPS.map(({ field, label }) => {
                      const active   = !!p[field];
                      // Roles stay editable while suspended — they are what the
                      // person comes back to — but read as inactive.
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
                              : active && suspended
                              ? 'border-gray-200 bg-gray-100 text-gray-500'
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
                      onClick={() => (editing === p.email ? setEditing(null) : startEditing(p))}
                      title="Edit name, phone, extension and site"
                      className={`p-2 rounded-lg border transition ${
                        editing === p.email
                          ? 'border-brand-300 bg-brand-50 text-brand-700'
                          : 'border-gray-200 text-gray-400 hover:bg-gray-50 hover:text-gray-600'
                      }`}
                    >
                      {editing === p.email ? <X size={14} /> : <Pencil size={14} />}
                    </button>

                    <button
                      onClick={() => handleSuspend(p)}
                      disabled={isSelf || isProtected || busy === `${p.email}:suspend`}
                      title={
                        isSelf
                          ? 'You cannot suspend your own access'
                          : isProtected
                          ? 'Protected accounts cannot be suspended'
                          : suspended
                          ? 'Restore access'
                          : 'Suspend access temporarily'
                      }
                      className={`p-2 rounded-lg border transition ${
                        isSelf || isProtected
                          ? 'border-gray-200 text-gray-300 cursor-not-allowed'
                          : suspended
                          ? 'border-green-200 text-green-600 hover:bg-green-50'
                          : 'border-gray-200 text-gray-400 hover:bg-amber-50 hover:text-amber-600 hover:border-amber-200'
                      }`}
                    >
                      {suspended ? <RotateCcw size={14} /> : <Ban size={14} />}
                    </button>

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
                  </div>

                  {editing === p.email && (
                    <div className="px-6 pb-4 pt-1">
                      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                        <div className="pb-4 mb-4 border-b border-gray-200">
                          <AvatarUploader
                            email={p.email}
                            photoPath={p.photoPath}
                            onChange={(path) => handlePhoto(p, path)}
                          />
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="text-xs text-gray-500">
                            First name
                            <input
                              value={draft.firstName}
                              onChange={(e) => setDraft((d) => ({ ...d, firstName: e.target.value }))}
                              placeholder="First"
                              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-400"
                            />
                          </label>
                          <label className="text-xs text-gray-500">
                            Last name
                            <input
                              value={draft.lastName}
                              onChange={(e) => setDraft((d) => ({ ...d, lastName: e.target.value }))}
                              placeholder="Last"
                              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-400"
                            />
                          </label>
                          <label className="text-xs text-gray-500">
                            Site
                            <select
                              value={draft.siteId}
                              onChange={(e) => setDraft((d) => ({ ...d, siteId: e.target.value }))}
                              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-400"
                            >
                              <option value="">No site</option>
                              {sites.map((site) => (
                                <option key={site.id} value={site.id}>{site.name}</option>
                              ))}
                            </select>
                          </label>
                          <label className="text-xs text-gray-500">
                            Work phone (US)
                            <input
                              value={draft.phone}
                              onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))}
                              placeholder="(555) 123-4567"
                              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-400"
                            />
                          </label>
                          <label className="text-xs text-gray-500">
                            Guatemala phone
                            <input
                              value={draft.phoneGt}
                              onChange={(e) => setDraft((d) => ({ ...d, phoneGt: e.target.value }))}
                              placeholder="+502 5555 5555"
                              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-400"
                            />
                          </label>
                          <label className="text-xs text-gray-500">
                            Extension
                            <input
                              value={draft.extension}
                              onChange={(e) => setDraft((d) => ({ ...d, extension: e.target.value }))}
                              placeholder="e.g. 204"
                              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-400"
                            />
                          </label>
                        </div>

                        <div className="flex items-center gap-2 mt-3">
                          <button
                            onClick={() => handleSaveDetails(p)}
                            disabled={busy === `${p.email}:details`}
                            className="flex items-center gap-1.5 rounded-lg bg-brand-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-800 transition disabled:opacity-50"
                          >
                            <Check size={13} />
                            {busy === `${p.email}:details` ? 'Saving…' : 'Save details'}
                          </button>
                          <button
                            onClick={() => setEditing(null)}
                            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition"
                          >
                            Cancel
                          </button>
                          {sites.length === 0 && (
                            <span className="text-xs text-gray-400">
                              No sites yet — add one under Sites below.
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <SitesPanel onChange={handleSitesLoaded} />
      <WorkGroupsPanel />
      <BatsImportPanel />
    </div>
  );
}
