'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AtSign, Ban, ChevronLeft, Lock, RotateCcw, ShieldAlert, Trash2, Users2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import {
  changeAllowedUserEmail,
  listManageableUsers,
  revokeUser,
  setAllowedUserDetails,
  setAllowedUserPermissions,
  setAllowedUserPhoto,
  setAllowedUserRole,
  setAllowedUserSuspended,
} from '@/lib/allowedUsers';
import { canManagePerson, isBootstrapAdmin, normalizeEmail } from '@/lib/accessControl';
import {
  OTHER_PHONE_LABEL, OTHER_PHONE_REGIONS, PHONE_EXAMPLE, PHONE_LABEL, PHONE_REGION_NAME,
  normalizePhone, phoneHint, type OtherPhoneRegion, type PhoneRegion,
} from '@/lib/phone';
import { detailsOf } from '@/lib/personDetails';
import { listSites } from '@/lib/sites';
import { listTeams } from '@/lib/teams';
import { listWorkGroups } from '@/lib/workGroups';
import { useDateFormatters } from '@/lib/useDateFormatters';
import { accessStatus, fullName, type AllowedUser, type AllowedUserDetails, type AllowedUserRole } from '@/types/allowedUser';
import {
  PERMISSION_GROUPS, ROLE_DETAILS, ROLE_LABELS, ROLE_ORDER,
  effectivePermissions, isPermission, roleGivenPermissions,
  type Permission, type RoleKey,
} from '@/types/permission';
import { findTeamLead, type Team } from '@/types/team';
import type { Site } from '@/types/site';
import type { WorkGroup } from '@/types/workGroup';
import DateField from '@/components/DateField';
import { Bi } from '@/components/spanish/Es';
import AbilityList, { SENSITIVE } from './AbilityList';
import AccessHistoryPanel from './AccessHistoryPanel';
import StatusChip from './StatusChip';
import { AvatarUploader, UserAvatar } from './UserAvatar';
import { useSaveBarEntry } from './kit/SaveBar';
import { Chip, ConfirmDialog, EmptyState, Loading, Notice, SettingsCard } from './kit/ui';
import { pageHref, personHref } from './settingsSections';

/**
 * One person, on a page of their own: their details, what they may do, the
 * team they are on, and the history of their access.
 *
 * This used to be an editor that opened under a card in the People list, with
 * role chips that saved on a click and permissions that saved on a tick. Now
 * everything here is a draft for the Save bar — a role change shows exactly
 * what it adds and takes away (`AbilityList`) before anybody presses Save,
 * which is the moment access is most often handed over by mistake.
 *
 * The three authorities are unchanged, and each is enforced again by
 * `/api/admin/users`:
 *
 * - `people.manage` — everything, for anybody but a protected account.
 * - a Sales Manager — details and permissions for their own team, and only
 *   permissions they hold themselves; never a role, never removing someone.
 * - HR (`people.view`) — reads.
 */

/** Never delegable by a Sales Manager. Kept in step with NON_DELEGABLE in /api/admin/users. */
const NON_DELEGABLE: Permission[] = ['people.manage', 'settings.manage'];

type Tab = 'details' | 'access' | 'team' | 'history';

const INPUT = 'mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-400 disabled:bg-gray-50 disabled:text-gray-500';

function rolesOf(p: AllowedUser): Record<RoleKey, boolean> {
  return Object.fromEntries(ROLE_ORDER.map((r) => [r, p[r] === true])) as Record<RoleKey, boolean>;
}

function grantedOf(p: AllowedUser): Permission[] {
  return (p.grantedPermissions ?? []).filter(isPermission).sort();
}

export default function PersonPage({ email: rawEmail }: { email: string }) {
  const { user, profile, can } = useAuth();
  const router = useRouter();
  const email = normalizeEmail(decodeURIComponent(rawEmail));
  const { formatDateTime } = useDateFormatters();

  const [person, setPerson] = useState<AllowedUser | null>(null);
  const [everyone, setEveryone] = useState<AllowedUser[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [groups, setGroups] = useState<WorkGroup[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [tab, setTab] = useState<Tab>('details');

  const load = useCallback(async () => {
    try {
      const list = await listManageableUsers(profile);
      setEveryone(list);
      const found = list.find((p) => p.email.toLowerCase() === email) ?? null;
      setPerson(found);
      setMissing(!found);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load this person');
    } finally {
      setLoading(false);
    }
  }, [profile, email]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    void listSites().then(setSites).catch(() => {});
    void listTeams().then(setTeams).catch(() => {});
    // Work groups are read under settings.manage; anybody else simply does
    // not get the list on the Team tab.
    void listWorkGroups().then(setGroups).catch(() => setGroups(null));
  }, []);

  const canManageAll = can('people.manage');
  const editable = person ? canManagePerson(profile, { uid: person.uid, email: person.email }) : false;
  const myEmail = normalizeEmail(user?.email);
  const isSelf = person?.email.toLowerCase() === myEmail;
  const isProtected = person ? isBootstrapAdmin(person.email) : false;

  if (loading) return <SettingsCard><Loading /></SettingsCard>;
  if (missing || !person) {
    return (
      <SettingsCard>
        <EmptyState art="people" title="Nobody here"
          body={error || 'This address is not on the access list — they may have been removed, or moved to a new address.'}
          action={<Link href={pageHref('people')} className="text-sm font-semibold text-brand-700 hover:underline"><Bi>Back to People</Bi></Link>} />
      </SettingsCard>
    );
  }

  const name = fullName(person) || person.email;
  const status = accessStatus(person);

  const TABS: { id: Tab; label: string; show: boolean }[] = [
    { id: 'details', label: 'Details', show: true },
    { id: 'access', label: 'Roles & permissions', show: true },
    { id: 'team', label: 'Team & groups', show: true },
    { id: 'history', label: 'History', show: canManageAll },
  ];

  return (
    <div className="space-y-6">
      <Link href={pageHref('people')} className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline">
        <ChevronLeft size={15} /> <span data-es>All people</span>
      </Link>

      {/* Who this is, at a glance. */}
      <section className="flex flex-wrap items-center gap-5 rounded-xl border border-gray-200 bg-white p-5">
        <UserAvatar photoPath={person.photoPath} fallback={name.charAt(0).toUpperCase()} muted={status === 'suspended'}
          size={88} shape="circle" expandable name={name} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-xl font-semibold text-gray-900">{name}</h3>
            <StatusChip status={status} />
            {isSelf && <Chip tone="gray">You</Chip>}
            {isProtected && <Chip tone="gray">Protected account</Chip>}
          </div>
          <p className="break-all text-sm text-gray-500">{person.email}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {ROLE_ORDER.filter((r) => person[r]).map((r) => <Chip key={r} tone="brand">{ROLE_LABELS[r]}</Chip>)}
            {ROLE_ORDER.every((r) => !person[r]) && <Chip tone="brand">Broker</Chip>}
          </div>
          <p className="mt-2 text-xs text-gray-400">
            Added {formatDateTime(person.invitedAt, 'date unknown')}{person.invitedBy ? ` by ${person.invitedBy}` : ''}
            {person.lastLoginAt ? ` · Last signed in ${formatDateTime(person.lastLoginAt)}` : ' · Has not signed in yet'}
          </p>
        </div>
        {!editable && <Chip tone="gray">View only</Chip>}
      </section>

      {notice && <Notice tone="amber">{notice}</Notice>}
      {error && <Notice tone="red">{error}</Notice>}

      <div className="flex gap-1 overflow-x-auto border-b border-gray-200">
        {TABS.filter((t) => t.show).map((t) => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)} aria-current={tab === t.id ? 'page' : undefined}
            className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition ${
              tab === t.id ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            <span data-es>{t.label}</span>
          </button>
        ))}
      </div>

      {/* Every tab stays mounted and the others are only hidden, so a draft on
          one survives a look at another and the one Save bar saves them all. */}
      <div hidden={tab !== 'details'}>
        <DetailsTab person={person} editable={editable} canManageAll={canManageAll} isSelf={isSelf} isProtected={isProtected}
          onSaved={load} onNotice={setNotice}
          onEmailChanged={(next) => router.replace(personHref(next))} />
      </div>
      <div hidden={tab !== 'access'}>
        <AccessTab person={person} editable={editable} canManageAll={canManageAll} isSelf={isSelf} isProtected={isProtected}
          onSaved={load} onRemoved={() => router.push(pageHref('people'))} />
      </div>
      <div hidden={tab !== 'team'}>
        <TeamTab person={person} everyone={everyone} sites={sites} teams={teams} groups={groups} editable={editable}
          onSaved={load} onNotice={setNotice} />
      </div>
      {canManageAll && (
        <div hidden={tab !== 'history'}>
          {tab === 'history' && <AccessHistoryPanel email={person.email} />}
        </div>
      )}
    </div>
  );
}

// ── Details ─────────────────────────────────────────────────────────────────

/** The details fields this tab owns; site and team are on the Team tab. */
type DetailFields = Omit<AllowedUserDetails, 'siteId' | 'teamId'>;

function detailFieldsOf(p: AllowedUser): DetailFields {
  const { siteId: _s, teamId: _t, ...rest } = detailsOf(p);
  return rest;
}

function DetailsTab({
  person, editable, canManageAll, isSelf, isProtected, onSaved, onNotice, onEmailChanged,
}: {
  person: AllowedUser;
  editable: boolean;
  canManageAll: boolean;
  isSelf: boolean;
  isProtected: boolean;
  onSaved: () => Promise<void>;
  onNotice: (text: string) => void;
  onEmailChanged: (email: string) => void;
}) {
  const [draft, setDraft] = useState<DetailFields>(() => detailFieldsOf(person));
  const [base, setBase] = useState<DetailFields>(() => detailFieldsOf(person));
  const [emailDraft, setEmailDraft] = useState(person.email);
  const [askEmail, setAskEmail] = useState(false);
  const [busy, setBusy] = useState(false);

  // A fresh read of the person (after any save) becomes the new starting
  // point — but never over what is being typed.
  const personKey = JSON.stringify(detailFieldsOf(person));
  useEffect(() => {
    const fresh = JSON.parse(personKey) as DetailFields;
    setBase(fresh);
    setDraft((d) => (JSON.stringify(d) === JSON.stringify(base) ? fresh : d));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personKey]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(base);
  const set = (key: keyof DetailFields) => (value: string) => setDraft((d) => ({ ...d, [key]: value }));
  const tidyPhone = (key: 'phone' | 'phoneOther', region: PhoneRegion) => () =>
    setDraft((d) => {
      const { value, rejected } = normalizePhone(d[key], region);
      return rejected ? d : { ...d, [key]: value };
    });

  useSaveBarEntry({
    dirty: editable && dirty,
    problem: !draft.firstName.trim() && !draft.lastName.trim() ? 'Give them at least a first or a last name.' : undefined,
    save: async () => {
      const previous = detailsOf(person);
      const { skippedPhones } = await setAllowedUserDetails(person.email, { ...previous, ...draft });
      if (skippedPhones.length) onNotice(`Saved, but ${skippedPhones.join(' and ')} was not the right length, so it was left blank.`);
      await onSaved();
      return async () => { await setAllowedUserDetails(person.email, previous); await onSaved(); };
    },
    discard: () => setDraft(base),
  });

  async function changeEmail() {
    const next = normalizeEmail(emailDraft);
    setBusy(true);
    try {
      const res = await changeAllowedUserEmail(person.email, next);
      setAskEmail(false);
      onNotice(res.signedOut
        ? `Work email changed to ${res.email}. They have been signed out and sign in again with the new address.`
        : `Work email changed to ${res.email}.`);
      onEmailChanged(res.email);
    } catch (e) {
      onNotice(e instanceof Error ? e.message : 'Could not change the work email');
      setAskEmail(false);
    } finally {
      setBusy(false);
    }
  }

  const field = (label: string, key: keyof DetailFields, opts: { placeholder?: string; type?: 'email' } = {}) => (
    <label className="text-sm text-gray-700">
      <span data-es className="font-medium">{label}</span>
      <input type={opts.type ?? 'text'} value={draft[key] as string} onChange={(e) => set(key)(e.target.value)}
        placeholder={opts.placeholder} disabled={!editable} className={INPUT} />
    </label>
  );

  return (
    <div className="space-y-6">
      <SettingsCard title="Their details" description="Full legal name, date of birth and personal email are seen by admins and HR only — they are never copied onto the profile the rest of the company reads.">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {field('First name', 'firstName', { placeholder: 'First' })}
          {field('Last name', 'lastName', { placeholder: 'Last' })}
          {field('Full legal name', 'legalName', { placeholder: 'As it appears on payroll' })}
          <label className="text-sm text-gray-700">
            <span className="font-medium">{PHONE_LABEL.US}</span>
            <input value={draft.phone} onChange={(e) => set('phone')(e.target.value)} onBlur={tidyPhone('phone', 'US')}
              placeholder={PHONE_EXAMPLE.US} disabled={!editable} className={INPUT} />
            {phoneHint(draft.phone, 'US') && <span className="mt-1 block text-[11px] text-amber-700">{phoneHint(draft.phone, 'US')}</span>}
          </label>
          <label className="text-sm text-gray-700">
            <span className="font-medium">{OTHER_PHONE_LABEL}</span>
            <div className="mt-1 flex gap-2">
              <select value={draft.phoneOtherRegion} disabled={!editable}
                onChange={(e) => setDraft((d) => {
                  const region = e.target.value as OtherPhoneRegion;
                  const { value, rejected } = normalizePhone(d.phoneOther, region);
                  return { ...d, phoneOtherRegion: region, phoneOther: rejected ? d.phoneOther : value };
                })}
                className="w-28 shrink-0 rounded-lg border border-gray-300 px-2 py-2 text-sm">
                {OTHER_PHONE_REGIONS.map((r) => <option key={r} value={r}>{PHONE_REGION_NAME[r]}</option>)}
              </select>
              <input value={draft.phoneOther} onChange={(e) => set('phoneOther')(e.target.value)}
                onBlur={tidyPhone('phoneOther', draft.phoneOtherRegion)} placeholder={PHONE_EXAMPLE[draft.phoneOtherRegion]}
                disabled={!editable} className="w-full min-w-0 rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50" />
            </div>
            {phoneHint(draft.phoneOther, draft.phoneOtherRegion) && (
              <span className="mt-1 block text-[11px] text-amber-700">{phoneHint(draft.phoneOther, draft.phoneOtherRegion)}</span>
            )}
          </label>
          {field('Extension', 'extension', { placeholder: 'e.g. 204' })}
          {field('Personal email', 'personalEmail', { placeholder: 'name@example.com', type: 'email' })}
          <label className="text-sm text-gray-700">
            <span data-es className="font-medium">Start date</span>
            <DateField value={draft.startDate} onChange={set('startDate')} disabled={!editable} className={INPUT} />
          </label>
          <label className="text-sm text-gray-700">
            <span data-es className="font-medium">Date of birth</span>
            <DateField value={draft.dateOfBirth} onChange={set('dateOfBirth')} disabled={!editable} className={INPUT} />
          </label>
        </div>
      </SettingsCard>

      {editable && (
        <SettingsCard title="Photo" description="Saved as soon as it is chosen — it is a picture, not a setting.">
          <AvatarUploader email={person.email} photoPath={person.photoPath}
            onChange={async (path) => { await setAllowedUserPhoto(person.email, path); await onSaved(); }} />
        </SettingsCard>
      )}

      {/* Admins only, and never for a protected account or your own — the same
          three refusals the server makes. */}
      {canManageAll && !isProtected && !isSelf && (
        <SettingsCard title="Work email" description="The address they sign in with. Their attendance, schedule, team and anything assigned to them move with it. Someone already signed in is signed out and signs in again with the new address — rename them in Google Workspace first.">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input id="work-email" type="email" value={emailDraft} onChange={(e) => setEmailDraft(e.target.value)}
              placeholder="name@totaltransportlogistics.us"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm sm:max-w-md" />
            <button type="button" onClick={() => setAskEmail(true)}
              disabled={!normalizeEmail(emailDraft) || normalizeEmail(emailDraft) === person.email}
              className="flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
              <AtSign size={14} /> <span data-es>Change email</span>
            </button>
          </div>
        </SettingsCard>
      )}

      <ConfirmDialog
        open={askEmail}
        title={`Change the work email for ${fullName(person) || person.email}?`}
        body={`From ${person.email} to ${normalizeEmail(emailDraft)}. ${accessStatus(person) !== 'pending'
          ? 'They will be signed out and must sign in again with the new address. Rename them in the Google Workspace admin console first, or they will not be able to sign in.'
          : 'They have not signed in yet, so they will simply sign in with the new address.'}`}
        confirmLabel="Change it"
        busy={busy}
        onCancel={() => setAskEmail(false)}
        onConfirm={() => void changeEmail()}
      />
    </div>
  );
}

// ── Roles & permissions ─────────────────────────────────────────────────────

function AccessTab({
  person, editable, canManageAll, isSelf, isProtected, onSaved, onRemoved,
}: {
  person: AllowedUser;
  editable: boolean;
  canManageAll: boolean;
  isSelf: boolean;
  isProtected: boolean;
  onSaved: () => Promise<void>;
  onRemoved: () => void;
}) {
  const { can } = useAuth();
  const [roles, setRoles] = useState(() => rolesOf(person));
  const [granted, setGranted] = useState<Permission[]>(() => grantedOf(person));
  const [ask, setAsk] = useState<'suspend' | 'remove' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const savedRoles = useMemo(() => rolesOf(person), [person]);
  const savedGranted = useMemo(() => grantedOf(person), [person]);
  const savedKey = JSON.stringify({ r: savedRoles, g: savedGranted });
  useEffect(() => {
    // After a save the stored values are the new starting point.
    const s = JSON.parse(savedKey) as { r: Record<RoleKey, boolean>; g: Permission[] };
    setRoles(s.r);
    setGranted(s.g);
  }, [savedKey]);

  const rolesDirty = ROLE_ORDER.some((r) => roles[r] !== savedRoles[r]);
  const grantsDirty = JSON.stringify([...granted].sort()) !== JSON.stringify(savedGranted);

  /** What this reader may hand over — the same rule the server applies. */
  const grantable = (p: Permission) => canManageAll || (!NON_DELEGABLE.includes(p) && can(p));
  const roleLocked = (r: RoleKey) => !canManageAll || (r === 'isAdmin' && (isSelf || isProtected) && savedRoles.isAdmin);

  useSaveBarEntry({
    dirty: editable && (rolesDirty || grantsDirty),
    save: async () => {
      const before = { roles: savedRoles, granted: savedGranted };
      const apply = async (r: Record<RoleKey, boolean>, g: Permission[], rFrom: Record<RoleKey, boolean>) => {
        for (const role of ROLE_ORDER) {
          if (r[role] !== rFrom[role]) await setAllowedUserRole(person.email, role as AllowedUserRole, r[role]);
        }
        if (JSON.stringify([...g].sort()) !== JSON.stringify(before.granted)) await setAllowedUserPermissions(person.email, g);
      };
      await apply(roles, granted, before.roles);
      await onSaved();
      const after = { roles, granted };
      return async () => {
        for (const role of ROLE_ORDER) {
          if (before.roles[role] !== after.roles[role]) await setAllowedUserRole(person.email, role as AllowedUserRole, before.roles[role]);
        }
        await setAllowedUserPermissions(person.email, before.granted);
        await onSaved();
      };
    },
    discard: () => { setRoles(savedRoles); setGranted(savedGranted); },
  });

  const held = useMemo(() => new Set(effectivePermissions(roles, granted)), [roles, granted]);
  const heldBefore = useMemo(() => new Set(effectivePermissions(savedRoles, savedGranted)), [savedRoles, savedGranted]);
  const fromRole = useMemo(() => roleGivenPermissions(roles), [roles]);
  const isBrokerDraft = ROLE_ORDER.every((r) => !roles[r]);

  async function act(kind: 'suspend' | 'remove') {
    setBusy(true);
    setError('');
    try {
      if (kind === 'suspend') {
        await setAllowedUserSuspended(person.email, !person.suspended);
        await onSaved();
      } else {
        await revokeUser(person.email);
        onRemoved();
      }
      setAsk(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work');
      setAsk(null);
    } finally {
      setBusy(false);
    }
  }

  const chip = (active: boolean, locked: boolean) =>
    `rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
      locked ? 'cursor-not-allowed border-gray-200 text-gray-300'
        : active ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
    }`;

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-6">
        <SettingsCard title="Roles" description={canManageAll
          ? 'A role is a bundle of abilities. Everyone is a Broker unless they are given one. Nothing changes until you press Save.'
          : 'Only an admin can change a role.'}>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={!canManageAll || isBrokerDraft || roleLocked('isAdmin')}
              onClick={() => setRoles(Object.fromEntries(ROLE_ORDER.map((r) => [r, false])) as Record<RoleKey, boolean>)}
              title="The default — their own clients and loads" className={chip(isBrokerDraft, !canManageAll)}>
              <span data-es>Broker</span>
            </button>
            {ROLE_ORDER.map((r) => (
              <button key={r} type="button" disabled={roleLocked(r)} title={ROLE_DETAILS[r]}
                onClick={() => setRoles((x) => ({ ...x, [r]: !x[r] }))} className={chip(roles[r], roleLocked(r))}>
                <span data-es>{ROLE_LABELS[r]}</span>
                {roles[r] !== savedRoles[r] && <span className="ml-1.5 text-[10px] font-semibold uppercase text-brand-600">{roles[r] ? 'adding' : 'removing'}</span>}
              </button>
            ))}
          </div>
          {(isSelf || isProtected) && savedRoles.isAdmin && (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-gray-500"><Lock size={12} />
              <Bi>{isProtected ? 'This account is the lockout escape hatch and always stays an admin.' : 'You cannot take away your own admin role.'}</Bi>
            </p>
          )}
        </SettingsCard>

        <SettingsCard title="Extra permissions" description="Smaller than a role: one ability, on top of what their roles give. A padlock means a role already gives it — change the role to take it away.">
          <div className="space-y-4">
            {PERMISSION_GROUPS.map((group) => (
              <div key={group.title}>
                <p className="text-xs font-semibold text-gray-500">{group.title}</p>
                <div className="mt-1 grid gap-1 md:grid-cols-2">
                  {group.permissions.filter((p) => p.key !== 'intern.section').map(({ key, label, detail }) => {
                    const byRole = fromRole.has(key);
                    const on = byRole || granted.includes(key);
                    const locked = !editable || byRole || !grantable(key);
                    const changed = !byRole && granted.includes(key) !== savedGranted.includes(key);
                    return (
                      <label key={key} title={byRole ? `${detail} Comes with their role.` : detail}
                        className={`flex items-start gap-2 rounded-lg px-2 py-1.5 ${locked ? 'opacity-70' : 'cursor-pointer hover:bg-gray-50'} ${changed ? 'bg-brand-50/70' : ''}`}>
                        <input type="checkbox" checked={on} disabled={locked}
                          onChange={() => setGranted((g) => (g.includes(key) ? g.filter((x) => x !== key) : [...g, key]))}
                          className="mt-0.5 h-3.5 w-3.5 rounded border-gray-300 text-brand-600" />
                        <span className="min-w-0">
                          <span className="flex items-center gap-1 text-sm text-gray-800">
                            {label}
                            {byRole && <Lock size={10} className="text-gray-400" />}
                            {SENSITIVE.has(key) && <ShieldAlert size={11} className="text-amber-500" aria-label="Sensitive" />}
                          </span>
                          <span className="block text-[11px] leading-snug text-gray-400">{detail}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </SettingsCard>

        {editable && (
          <SettingsCard title="Access" description="Suspending blocks sign-in but keeps everything, so it can be undone. Removing takes them off the list; the removal log keeps their details and can put them back.">
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setAsk('suspend')} disabled={isSelf || isProtected}
                title={isSelf ? 'You cannot suspend yourself' : isProtected ? 'This account cannot be suspended' : undefined}
                className="flex items-center gap-1.5 rounded-lg border border-amber-200 px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-40">
                {person.suspended ? <RotateCcw size={14} /> : <Ban size={14} />}
                <span data-es>{person.suspended ? 'Restore access' : 'Suspend'}</span>
              </button>
              {canManageAll && (
                <button type="button" onClick={() => setAsk('remove')} disabled={isSelf || isProtected}
                  className="flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40">
                  <Trash2 size={14} /> <span data-es>Remove from TTMS</span>
                </button>
              )}
            </div>
            {error && <Notice tone="red" className="mt-3">{error}</Notice>}
          </SettingsCard>
        )}
      </div>

      <div className="xl:sticky xl:top-0">
        <SettingsCard title="What they will be able to do">
          <AbilityList held={held} before={heldBefore} fromRole={fromRole} who={fullName(person) || 'They'} />
        </SettingsCard>
      </div>

      <ConfirmDialog
        open={ask === 'suspend'}
        title={person.suspended ? `Restore access for ${fullName(person) || person.email}?` : `Suspend ${fullName(person) || person.email}?`}
        body={person.suspended
          ? 'They can sign in again straight away, with the roles they had.'
          : 'They are signed out immediately and cannot sign in until you restore them. Their roles are kept, so restoring puts everything back.'}
        confirmLabel={person.suspended ? 'Restore access' : 'Suspend'}
        tone={person.suspended ? 'brand' : 'red'}
        busy={busy}
        onCancel={() => setAsk(null)}
        onConfirm={() => void act('suspend')}
      />
      <ConfirmDialog
        open={ask === 'remove'}
        title={`Remove ${fullName(person) || person.email} from TTMS?`}
        body="They are signed out immediately and cannot sign in again unless they are put back from Removed people, which keeps their details, roles and photo."
        confirmLabel="Remove them"
        tone="red"
        busy={busy}
        onCancel={() => setAsk(null)}
        onConfirm={() => void act('remove')}
      />
    </div>
  );
}

// ── Team & groups ───────────────────────────────────────────────────────────

function TeamTab({
  person, everyone, sites, teams, groups, editable, onSaved, onNotice,
}: {
  person: AllowedUser;
  everyone: AllowedUser[];
  sites: Site[];
  teams: Team[];
  groups: WorkGroup[] | null;
  editable: boolean;
  onSaved: () => Promise<void>;
  onNotice: (text: string) => void;
}) {
  const [teamId, setTeamId] = useState(person.teamId ?? '');
  const [siteId, setSiteId] = useState(person.siteId ?? '');
  useEffect(() => { setTeamId(person.teamId ?? ''); setSiteId(person.siteId ?? ''); }, [person.teamId, person.siteId]);

  const dirty = teamId !== (person.teamId ?? '') || siteId !== (person.siteId ?? '');
  useSaveBarEntry({
    dirty: editable && dirty,
    save: async () => {
      const previous = detailsOf(person);
      const { skippedPhones } = await setAllowedUserDetails(person.email, { ...previous, teamId: teamId || null, siteId: siteId || null });
      if (skippedPhones.length) onNotice(`Saved, but ${skippedPhones.join(' and ')} could not be read and was left blank.`);
      await onSaved();
      return async () => { await setAllowedUserDetails(person.email, previous); await onSaved(); };
    },
    discard: () => { setTeamId(person.teamId ?? ''); setSiteId(person.siteId ?? ''); },
  });

  const team = teams.find((t) => t.id === teamId) ?? null;
  const lead = team ? findTeamLead(team, everyone) : null;
  const mates = team ? everyone.filter((p) => p.teamId === team.id && p.email !== person.email) : [];
  const ledTeams = teams.filter((t) => findTeamLead(t, everyone)?.email === person.email);
  const myGroups = (groups ?? []).filter((g) =>
    (g.memberEmails ?? []).includes(person.email) || (person.uid ? (g.memberUids ?? []).includes(person.uid) : false));
  const select = 'mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50';

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <SettingsCard title="Team and office">
        <div className="space-y-4">
          <label className="block text-sm text-gray-700">
            <span data-es className="font-medium">Team</span>
            <select value={teamId} onChange={(e) => setTeamId(e.target.value)} disabled={!editable} className={select}>
              <option value="">No team</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          {team && (
            <p className="text-sm text-gray-600">
              {lead ? <>Reports to <span className="font-medium text-gray-900">{fullName(lead) || lead.email}</span>{lead.isSalesManager ? ', a Sales Manager who can manage their details and permissions' : ''}.</> : 'This team has no lead yet.'}
            </p>
          )}
          <label className="block text-sm text-gray-700">
            <span data-es className="font-medium">Site</span>
            <select value={siteId} onChange={(e) => setSiteId(e.target.value)} disabled={!editable} className={select}>
              <option value="">No site</option>
              {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
        </div>
      </SettingsCard>

      <SettingsCard title="Who they work with">
        {mates.length === 0 && ledTeams.length === 0 ? (
          <p className="text-sm text-gray-500"><Bi>Nobody else is on their team.</Bi></p>
        ) : (
          <div className="space-y-3 text-sm">
            {ledTeams.length > 0 && (
              <p className="text-gray-700">Leads {ledTeams.map((t) => t.name).join(', ')}.</p>
            )}
            {mates.length > 0 && (
              <ul className="flex flex-wrap gap-1.5">
                {mates.map((m) => (
                  <li key={m.email}>
                    <Link href={personHref(m.email)} className="rounded-full border border-gray-200 px-2.5 py-1 text-xs text-gray-700 hover:border-brand-300 hover:text-brand-700">
                      {fullName(m) || m.email}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </SettingsCard>

      {groups !== null && (
        <SettingsCard title="Work groups" description="Groups share clients and loads between their members. Change who is in them on the Work groups page.">
          {myGroups.length === 0 ? (
            <p className="text-sm text-gray-500"><Bi>Not in any work group.</Bi></p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {myGroups.map((g) => (
                <li key={g.id} className="flex items-center gap-2 text-gray-800"><Users2 size={14} className="text-gray-400" /> {g.name}</li>
              ))}
            </ul>
          )}
          <Link href={pageHref('work-groups')} className="mt-3 inline-block text-sm font-medium text-brand-700 hover:underline">
            <span data-es>Open Work groups</span>
          </Link>
        </SettingsCard>
      )}
    </div>
  );
}
