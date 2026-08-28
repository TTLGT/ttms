'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDown, ArrowUp, Ban, Building2, CalendarDays, Check, Download, Pencil,
  Phone, RotateCcw, Smartphone, Trash2, UsersRound, X,
} from 'lucide-react';
import {
  listAllowedUsers,
  setAllowedUserRole,
  setAllowedUserDetails,
  setAllowedUserPhoto,
  setAllowedUserSuspended,
  revokeUser,
} from '@/lib/allowedUsers';
import { isBootstrapAdmin, isBroker, normalizeEmail } from '@/lib/accessControl';
import {
  DEFAULT_OTHER_REGION,
  OTHER_PHONE_LABEL,
  OTHER_PHONE_REGIONS,
  PHONE_COUNTRY_CODE,
  PHONE_EXAMPLE,
  PHONE_LABEL,
  PHONE_NATIONAL_LENGTH,
  PHONE_REGION_NAME,
  normalizePhone,
  otherPhone,
  phoneHint,
  type OtherPhoneRegion,
  type PhoneRegion,
} from '@/lib/phone';
import { listSites } from '@/lib/sites';
import { listTeams } from '@/lib/teams';
import { useAuth } from '@/context/AuthContext';
import {
  accessStatus, fullName, splitName, yearsSince,
} from '@/types/allowedUser';
import { useDateFormatters } from '@/lib/useDateFormatters';
import type { DateLike } from '@/lib/dateFormat';
import type { AccessStatus, AllowedUser, AllowedUserRole } from '@/types/allowedUser';
import { toCsv, csvDate, downloadCsv } from '@/lib/csv';
import type { Site } from '@/types/site';
import type { Team } from '@/types/team';
import AddPeoplePanel from '@/components/settings/AddPeoplePanel';
import RemovedPeoplePanel from '@/components/settings/RemovedPeoplePanel';
import { personAnchorId } from '@/components/settings/settingsSections';
import { AvatarUploader, UserAvatar } from '@/components/settings/UserAvatar';
import DateField from '@/components/DateField';
import Fact from '@/components/people/Fact';

/**
 * The elevated roles. Broker is not among them: it is the default everyone
 * has until one of these is granted, so it is shown as a chip but derived
 * rather than stored (see isBroker in accessControl).
 */
const ROLE_CHIPS: { field: AllowedUserRole; label: string }[] = [
  { field: 'isAdmin',      label: 'Admin' },
  { field: 'isDispatcher', label: 'Dispatcher' },
  { field: 'isFinance',    label: 'Finance' },
  { field: 'isHr',         label: 'HR' },
];

const NO_ROLES = { isAdmin: false, isDispatcher: false, isFinance: false, isHr: false };

type StatusFilter = 'all' | 'active' | 'pending' | 'suspended';
/** 'broker' means "no elevated role" — the default everyone starts with. */
type RoleFilter   = 'all' | AllowedUserRole | 'broker';
type SortField =
  | 'firstName' | 'lastName' | 'email' | 'phone' | 'phoneOther' | 'extension'
  | 'startDate' | 'dateOfBirth' | 'added';
type SortDir   = 'asc' | 'desc';

const SORT_FIELDS: { key: SortField; label: string }[] = [
  { key: 'firstName', label: 'First name' },
  { key: 'lastName',  label: 'Last name' },
  { key: 'email',     label: 'Email' },
  { key: 'phone',     label: 'Work phone (US)' },
  { key: 'phoneOther', label: OTHER_PHONE_LABEL },
  { key: 'extension', label: 'Extension' },
  { key: 'startDate', label: 'Start date' },
  { key: 'dateOfBirth', label: 'Date of birth' },
  { key: 'added',     label: 'Date added' },
];

/** Direction reads differently depending on what is being ordered. */
function directionLabel(field: SortField, dir: SortDir): string {
  if (field === 'added')     return dir === 'asc' ? 'Oldest first' : 'Newest first';
  if (field === 'startDate') return dir === 'asc' ? 'Longest here first' : 'Newest hire first';
  // The earliest birthday belongs to the oldest person, which is the way round
  // anyone sorting by it is actually thinking.
  if (field === 'dateOfBirth') return dir === 'asc' ? 'Oldest first' : 'Youngest first';
  if (field === 'phone' || field === 'phoneOther' || field === 'extension') {
    return dir === 'asc' ? 'Low → High' : 'High → Low';
  }
  return dir === 'asc' ? 'A → Z' : 'Z → A';
}

const digitsOnly = (value: string | null | undefined) => (value ?? '').replace(/\D/g, '');

/**
 * Compare phone numbers as digits alone.
 *
 * New and re-saved numbers are all one shape now (lib/phone.ts), but entries
 * that have not been touched since still hold whatever was typed at the time —
 * (555) 123-4567, 555.123.4567, +1 555 123 4567 — and those have to sort in
 * with the rest rather than in a block of their own. The country code is
 * dropped for the same reason: +1 on the US line, +502 or +52 on the other.
 *
 * Sorting the second column mixes countries, and that is the honest result:
 * it is one column holding one number each, so it orders by the number and
 * lets the country ride along.
 */
function phoneKey(value: string | null | undefined, region: PhoneRegion): string {
  const d = digitsOnly(value);
  const code = PHONE_COUNTRY_CODE[region];
  const national = PHONE_NATIONAL_LENGTH[region];
  return d.length === national + code.length && d.startsWith(code)
    ? d.slice(code.length)
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
  if (field === 'phone')     return phoneKey(p.phone, 'US');
  if (field === 'phoneOther') {
    const { value, region } = otherPhone(p);
    return phoneKey(value, region);
  }
  if (field === 'extension') return extensionKey(p);
  // Stored as YYYY-MM-DD precisely so plain text order is date order; a blank
  // one falls through to the same "unknown, so put it last" rule as the rest.
  if (field === 'startDate')   return (p.startDate ?? '').trim();
  if (field === 'dateOfBirth') return (p.dateOfBirth ?? '').trim();
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

const STATUS_CHIP: Record<AccessStatus, { label: string; className: string }> = {
  active:    { label: 'Active',    className: 'bg-green-50 text-green-700 border-green-200' },
  pending:   { label: 'Pending',   className: 'bg-amber-50 text-amber-700 border-amber-200' },
  suspended: { label: 'Suspended', className: 'bg-red-50 text-red-700 border-red-200' },
};

/**
 * The three states as a chip in the card's corner rather than a line of text
 * under the name — it is one word, and giving it a whole row was part of what
 * made the list so tall.
 */
function StatusChip({ status }: { status: AccessStatus }) {
  const { label, className } = STATUS_CHIP[status];
  return (
    <span
      className={`flex-shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${className}`}
      title={status === 'pending' ? 'Added, but has never signed in' : undefined}
    >
      {label}
    </span>
  );
}

/**
 * What someone is allowed to do, in words. Broker is the absence of the rest,
 * so it is spelled out rather than left as an empty row — same rule the CSV
 * export follows.
 */
function roleLabels(p: AllowedUser): string[] {
  const held = ROLE_CHIPS.filter(({ field }) => p[field]).map(({ label }) => label);
  return held.length > 0 ? held : ['Broker'];
}

export default function SettingsPeoplePage() {
  const { user, isAdmin }       = useAuth();
  // Start dates and birthdays follow the company setting — Settings →
  // Operations → Date Format.
  const { formatCalendarDate, formatDateTime } = useDateFormatters();
  // "Added" is a fact about the record rather than about the person, so a
  // missing one says so in words instead of showing a dash.
  const formatWhen = (ts: DateLike) => formatDateTime(ts, 'date unknown');
  const [people, setPeople]     = useState<AllowedUser[]>([]);
  const [loading, setLoading]   = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [error, setError]       = useState('');
  const [busy, setBusy]         = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [roleFilter, setRoleFilter]     = useState<RoleFilter>('all');
  const [sortField, setSortField]       = useState<SortField>('firstName');
  const [sortDir, setSortDir]           = useState<SortDir>('asc');

  // Sites and teams are managed on the Organization tab; this page only needs
  // their names, to label each row and to fill the two pickers.
  const [sites, setSites] = useState<Site[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const siteName = (id: string | null | undefined) =>
    sites.find((x) => x.id === id)?.name ?? null;
  const teamName = (id: string | null | undefined) =>
    teams.find((x) => x.id === id)?.name ?? null;

  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft]     = useState({
    firstName: '', lastName: '', legalName: '', personalEmail: '', phone: '',
    phoneOther: '', phoneOtherRegion: DEFAULT_OTHER_REGION as OtherPhoneRegion,
    extension: '', dateOfBirth: '', startDate: '', siteId: '', teamId: '',
  });
  /**
   * Something that was not an error but that the admin still has to be told —
   * currently only a phone number that could not be read and was therefore
   * saved blank. Kept apart from `error`, because the save itself worked.
   */
  const [notice, setNotice]   = useState('');

  /**
   * Rewrite a phone field into the shape it is stored in when it loses focus.
   * Same rule as the add form: a number that cannot be read is left as typed so
   * it can be corrected, and the hint under the field says it will not be kept.
   * See lib/phone.ts.
   */
  const tidyPhone = (key: 'phone' | 'phoneOther', region: PhoneRegion) => () =>
    setDraft((d) => {
      const { value, rejected } = normalizePhone(d[key], region);
      return rejected ? d : { ...d, [key]: value };
    });

  /**
   * Changing the country re-reads the digits already in the box under the new
   * country's rules — the same as the add form does. A number that will not
   * fit the new country is left exactly as typed, and the hint underneath is
   * what says it will not be kept.
   */
  const setOtherRegion = (region: OtherPhoneRegion) =>
    setDraft((d) => {
      const { value, rejected } = normalizePhone(d.phoneOther, region);
      return { ...d, phoneOtherRegion: region, phoneOther: rejected ? d.phoneOther : value };
    });

  /**
   * HR reads this page; only admins act on it. Everything that writes is gated
   * on this rather than on `isAdmin` directly, so there is one place to look
   * when asking what HR can do here.
   */
  const canEdit = isAdmin;

  const myEmail = normalizeEmail(user?.email);

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

  // The layout above bounces anyone who is neither admin nor HR before this
  // renders, and the Firestore rules on `allowedUsers` refuse them again
  // independently of that. So there is nothing to check here.
  useEffect(() => {
    load();
  }, [load]);

  // Read on every visit rather than handed down from the Sites and Teams
  // panels, which now live on the Organization tab. That means a site renamed
  // or deleted over there is already correct by the time this page is opened —
  // the previous version had to patch stale ids in place because both lists
  // were on screen at once.
  useEffect(() => {
    void listSites().then(setSites).catch(() => {});
    void listTeams().then(setTeams).catch(() => {});
  }, []);

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
    // These headings are the ones the importer reads back, so an export can be
    // edited in Excel and uploaded again — see COLUMNS in lib/userImportColumns.
    const header = [
      'First name', 'Last name', 'Full legal name', 'Email', 'Personal email',
      PHONE_LABEL.US, PHONE_LABEL.GT, PHONE_LABEL.MX, 'Extension', 'Site', 'Team',
      'Date of birth', 'Start date',
      'Roles', 'Status', 'Added', 'Added by', 'Last sign-in',
    ];

    const rows = visiblePeople.map((p) => {
      const roles = ROLE_CHIPS.filter(({ field }) => p[field]).map(({ label }) => label);
      // One field on the person, one column per country in the file: the number
      // is written under its own country's heading and the other cell is left
      // blank, which is the shape the importer reads back.
      const other = otherPhone(p);
      return [
        p.firstName ?? '',
        p.lastName ?? '',
        p.legalName ?? '',
        p.email,
        p.personalEmail ?? '',
        p.phone ?? '',
        other.region === 'GT' ? other.value : '',
        other.region === 'MX' ? other.value : '',
        p.extension ?? '',
        siteName(p.siteId) ?? '',
        // By name, not id — the importer matches teams by name, so an export
        // edited in Excel goes back in without anyone touching a document id.
        teamName(p.teamId) ?? '',
        // Left as YYYY-MM-DD rather than prettified: Excel reads that as a real
        // date, and it is the format the importer takes back without argument.
        p.dateOfBirth ?? '',
        p.startDate ?? '',
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
    setNotice('');
    setDraft({
      ...name,
      legalName:     person.legalName ?? '',
      personalEmail: person.personalEmail ?? '',
      phone:            person.phone ?? '',
      phoneOther:       otherPhone(person).value,
      phoneOtherRegion: otherPhone(person).region,
      extension:     person.extension ?? '',
      dateOfBirth:   person.dateOfBirth ?? '',
      startDate:     person.startDate ?? '',
      siteId:        person.siteId ?? '',
      teamId:        person.teamId ?? '',
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
    setNotice('');
    try {
      const details = {
        ...draft,
        siteId: draft.siteId || null,
        teamId: draft.teamId || null,
      };
      const { skippedPhones } = await setAllowedUserDetails(person.email, details);
      // The server composes displayName from the two parts; mirror that here so
      // the row does not keep showing the name it had before the edit.
      const displayName = [details.firstName, details.lastName].filter(Boolean).join(' ');
      // Phones are taken from what the server would have accepted, not from the
      // draft: one it could not read was stored blank, and leaving the typed
      // digits in the row would show a number that is not on the record.
      const saved = {
        ...details,
        phone:      normalizePhone(details.phone, 'US').value,
        phoneOther: normalizePhone(details.phoneOther, details.phoneOtherRegion).value,
        // Blanked on the row as well as on the record: the server clears the
        // old field on every write, and a stale value left here would show
        // through `otherPhone()` until the page was reloaded.
        phoneGt:    '',
      };
      setPeople((prev) =>
        prev.map((p) => (p.email === person.email ? { ...p, ...saved, displayName } : p)),
      );
      if (skippedPhones.length > 0) {
        setNotice(
          `Saved, but ${skippedPhones.join(' and ')} was not the right length, so it was left blank.`,
        );
      }
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
      Number(p.isAdmin) + Number(p.isDispatcher) + Number(p.isFinance) + Number(p.isHr);
    return {
      all:          people.length,
      active:       people.filter((p) => accessStatus(p) === 'active').length,
      pending:      people.filter((p) => accessStatus(p) === 'pending').length,
      suspended:    people.filter((p) => accessStatus(p) === 'suspended').length,
      isAdmin:      people.filter((p) => p.isAdmin).length,
      isDispatcher: people.filter((p) => p.isDispatcher).length,
      isFinance:    people.filter((p) => p.isFinance).length,
      isHr:         people.filter((p) => p.isHr).length,
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

  return (
    <div>
      {error && (
        <div className="mb-6 rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-600">
          {error}
        </div>
      )}

      {notice && (
        <div className="mb-6 rounded-lg bg-amber-50 border border-amber-200 p-4 text-sm text-amber-700">
          {notice}
        </div>
      )}

      {/* The list below takes the full width of the tab; these two are a form
          and a collapsed archive, and a form field stretched across the whole
          screen is harder to fill in, not easier. */}
      {canEdit && (
        <div id="add-people" className="scroll-mt-44 max-w-4xl">
          <AddPeoplePanel sites={sites} teams={teams} onChanged={load} />
        </div>
      )}

      <section id="people-list" className="scroll-mt-44 bg-white rounded-xl border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-100">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-gray-900">People With Access</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {canEdit ? (
                  <>
                    Everyone is a Broker by default — their own clients and loads, and nothing they
                    do not own. Admins can see all records and manage access, dispatchers can send
                    carrier/shipper agreements, finance can generate BOLs and invoices, and HR can
                    read this directory and nothing else. Click a role to toggle it, or Broker to
                    take the others away. Suspending blocks sign-in but keeps the roles, so access
                    can be restored; removing deletes the entry outright.
                  </>
                ) : (
                  <>
                    Everyone who can sign in to TTMS, with the details on file for them — including
                    full legal name, date of birth and personal email, which nobody outside this
                    page can see. Use Export CSV to take the list into Excel. Changing any of it
                    is an admin job.
                  </>
                )}
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
          /* Two abreast once there is room. This was one full-width row per
             person down a narrow column, which made two dozen people a long
             scroll for no reason — half the width of every row was empty. */
          <ul className="grid items-start gap-3 rounded-b-xl bg-gray-50 p-4 xl:grid-cols-2">
            {visiblePeople.map((p) => {
              const isSelf      = normalizeEmail(p.email) === myEmail;
              const isProtected = isBootstrapAdmin(p.email);
              const status      = accessStatus(p);
              const suspended   = status === 'suspended';
              const other       = otherPhone(p);
              const site        = siteName(p.siteId);
              const team        = teamName(p.teamId);

              return (
                /* The id is what the search box jumps to when someone looks a
                   person up by name; `target:` rings the card on arrival so it
                   is obvious which one of two dozen was meant.

                   Editing takes the whole width: the form is a three-column
                   grid, and folding it into half a screen would put the long
                   scroll straight back. */
                <li
                  key={p.email}
                  id={personAnchorId(p.email)}
                  className={`scroll-mt-44 rounded-xl border p-4 transition target:ring-2 target:ring-brand-400 ${
                    editing === p.email ? 'border-brand-300 xl:col-span-2' : 'border-gray-200'
                  } ${suspended ? 'bg-red-50/50' : 'bg-white'}`}
                >
                  <div className="flex items-start gap-3">
                    <UserAvatar
                      photoPath={p.photoPath}
                      fallback={(fullName(p) || p.email).charAt(0).toUpperCase()}
                      muted={suspended}
                      size={40}
                    />
                    <div className="min-w-0 flex-1">
                      <p
                        className={`truncate text-sm font-medium ${
                          suspended ? 'text-gray-500' : 'text-gray-900'
                        }`}
                      >
                        {fullName(p) || p.email}
                        {isSelf && <span className="ml-1.5 text-xs text-gray-400">(you)</span>}
                      </p>

                      {/* Only worth a line of its own once a name is displacing
                          it from the line above. `break-all` because an address
                          is the one thing on the card that cannot wrap at a
                          space, and cutting it would hide the domain. */}
                      {fullName(p) && (
                        <p className="break-all text-xs text-gray-500">{p.email}</p>
                      )}
                    </div>

                    <StatusChip status={status} />
                  </div>

                  {/* The facts, one per line, none of them truncated. They used
                      to be joined into a single line that was cut off at the
                      edge of the row — which in practice meant the office name,
                      because it sat last. A card one line taller is a much
                      smaller problem than a fact that is not there at all. */}
                  {(p.phone || p.extension || other.value || site || team || p.startDate) && (
                    <div className="mt-3 grid grid-cols-[14px_1fr] items-start gap-x-2 gap-y-1">
                      {(p.phone || p.extension) && (
                        <Fact Icon={Phone}>
                          {[
                            // Labelled, because two bare numbers on adjacent
                            // lines give no clue which to dial from where.
                            p.phone ? `US ${p.phone}` : null,
                            p.extension ? `ext. ${p.extension}` : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </Fact>
                      )}

                      {other.value && (
                        <Fact Icon={Smartphone}>
                          {other.region} {other.value}
                        </Fact>
                      )}

                      {site && <Fact Icon={Building2}>{site}</Fact>}

                      {/* Prefixed so a team called "Staff" cannot be read as
                          another office sitting next to the real one. */}
                      {team && <Fact Icon={UsersRound}>Team {team}</Fact>}

                      {/* Start date earns a line because it answers "how long
                          has this person been here" at a glance. Date of birth
                          does not — it stays in the editor, where it is not on
                          screen every time someone opens Settings. */}
                      {p.startDate && (
                        <Fact Icon={CalendarDays}>
                          Started {formatCalendarDate(p.startDate)}
                          {(() => {
                            const years = yearsSince(p.startDate);
                            return years !== null && years >= 1
                              ? ` · ${years} year${years === 1 ? '' : 's'}`
                              : '';
                          })()}
                        </Fact>
                      )}
                    </div>
                  )}

                  {/* Every control below writes. HR reads this page, so they get
                      the roles as plain chips instead — what someone is allowed
                      to do is the first thing anyone reads a directory entry
                      for, and a row of greyed-out buttons would only invite a
                      support call asking why none of them work. */}
                  <div className="mt-3 border-t border-gray-100 pt-3">
                    {canEdit ? (
                      <div className="flex flex-wrap items-center gap-1.5">
                        {(() => {
                          const active = isBroker(p);
                          // Demoting means dropping admin, which these two
                          // accounts are never allowed to do.
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
                              className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
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
                          // Roles stay editable while suspended — they are what
                          // the person comes back to — but read as inactive.
                          const locked   = field === 'isAdmin' && (isSelf || isProtected);
                          const working  = busy === `${p.email}:${field}`;
                          return (
                            <button
                              key={field}
                              onClick={() => handleToggle(p, field)}
                              disabled={locked || working}
                              title={locked ? 'This admin role cannot be removed' : undefined}
                              className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
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
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-1.5">
                        {roleLabels(p).map((label) => (
                          <span
                            key={label}
                            className="rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-600"
                          >
                            {label}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="mt-2 flex items-end justify-between gap-3">
                      <p className="min-w-0 text-[11px] text-gray-400">
                        Added {formatWhen(p.invitedAt)}
                        {p.invitedBy ? ` by ${p.invitedBy}` : ''}
                        {isProtected && <span className="block">Protected account</span>}
                      </p>

                      {canEdit && (
                        <div className="flex flex-shrink-0 items-center gap-1.5">
                          <button
                            onClick={() => (editing === p.email ? setEditing(null) : startEditing(p))}
                            title="Edit name, phone, extension and site"
                            className={`rounded-lg border p-1.5 transition ${
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
                            className={`rounded-lg border p-1.5 transition ${
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
                            className={`rounded-lg border p-1.5 transition ${
                              isSelf || isProtected
                                ? 'border-gray-200 text-gray-300 cursor-not-allowed'
                                : 'border-gray-200 text-gray-400 hover:bg-red-50 hover:text-red-600 hover:border-red-200'
                            }`}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {canEdit && editing === p.email && (
                    <div className="mt-3">
                      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                        <div className="pb-4 mb-4 border-b border-gray-200">
                          <AvatarUploader
                            email={p.email}
                            photoPath={p.photoPath}
                            onChange={(path) => handlePhoto(p, path)}
                          />
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
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
                            Full legal name
                            <input
                              value={draft.legalName}
                              onChange={(e) => setDraft((d) => ({ ...d, legalName: e.target.value }))}
                              placeholder="As it appears on payroll"
                              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-400"
                            />
                          </label>
                          <label className="text-xs text-gray-500">
                            Team
                            <select
                              value={draft.teamId}
                              onChange={(e) => setDraft((d) => ({ ...d, teamId: e.target.value }))}
                              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-400"
                            >
                              <option value="">No team</option>
                              {teams.map((team) => (
                                <option key={team.id} value={team.id}>{team.name}</option>
                              ))}
                            </select>
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
                            {PHONE_LABEL.US}
                            <input
                              value={draft.phone}
                              onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))}
                              onBlur={tidyPhone('phone', 'US')}
                              placeholder={PHONE_EXAMPLE.US}
                              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-400"
                            />
                            {phoneHint(draft.phone, 'US') && (
                              <span className="mt-1 block text-[11px] text-amber-700">
                                {phoneHint(draft.phone, 'US')}
                              </span>
                            )}
                          </label>
                          <label className="text-xs text-gray-500">
                            {OTHER_PHONE_LABEL}
                            <div className="mt-1 flex gap-2">
                              <select
                                value={draft.phoneOtherRegion}
                                onChange={(e) => setOtherRegion(e.target.value as OtherPhoneRegion)}
                                className="w-32 shrink-0 rounded-lg border border-gray-300 px-2 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-400"
                              >
                                {OTHER_PHONE_REGIONS.map((r) => (
                                  <option key={r} value={r}>{PHONE_REGION_NAME[r]}</option>
                                ))}
                              </select>
                              <input
                                value={draft.phoneOther}
                                onChange={(e) => setDraft((d) => ({ ...d, phoneOther: e.target.value }))}
                                onBlur={tidyPhone('phoneOther', draft.phoneOtherRegion)}
                                placeholder={PHONE_EXAMPLE[draft.phoneOtherRegion]}
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-400"
                              />
                            </div>
                            {phoneHint(draft.phoneOther, draft.phoneOtherRegion) && (
                              <span className="mt-1 block text-[11px] text-amber-700">
                                {phoneHint(draft.phoneOther, draft.phoneOtherRegion)}
                              </span>
                            )}
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
                          <label className="text-xs text-gray-500">
                            Personal email
                            <input
                              type="email"
                              value={draft.personalEmail}
                              onChange={(e) => setDraft((d) => ({ ...d, personalEmail: e.target.value }))}
                              placeholder="name@example.com"
                              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-400"
                            />
                          </label>
                          {/* DateField holds a real YYYY-MM-DD whatever was
                              typed, so what is saved still needs no parsing. */}
                          <label className="text-xs text-gray-500">
                            Start date
                            <DateField
                              value={draft.startDate}
                              onChange={(v) => setDraft((d) => ({ ...d, startDate: v }))}
                              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-400"
                            />
                          </label>
                          <label className="text-xs text-gray-500">
                            Date of birth
                            <DateField
                              value={draft.dateOfBirth}
                              onChange={(v) => setDraft((d) => ({ ...d, dateOfBirth: v }))}
                              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-400"
                            />
                          </label>
                        </div>

                        {/* Said once, next to the two fields it applies to,
                            rather than left for someone to assume either way. */}
                        <p className="text-[11px] text-gray-400 mt-2">
                          Full legal name, date of birth and personal email are visible to admins
                          and HR only — they are not copied onto the profile the rest of the
                          company can read. Leave the legal name blank when it is the same as the
                          first and last name above.
                        </p>

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
                          {teams.length === 0 && (
                            <span className="text-xs text-gray-400">
                              No teams yet — add one under Teams below.
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

      {/* The archive holds date of birth and personal email for people who
          have left, so it stays admin-only — HR reads the live directory
          above and nothing else. */}
      {canEdit && (
        <div id="removed-people" className="scroll-mt-44 max-w-4xl">
          <RemovedPeoplePanel sites={sites} teams={teams} />
        </div>
      )}
    </div>
  );
}
