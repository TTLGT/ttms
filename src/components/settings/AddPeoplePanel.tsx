'use client';

import { useMemo, useState } from 'react';
import { AlertCircle, Check, Keyboard, Table2, UserPlus } from 'lucide-react';
import { inviteUsers, type NewPersonDetails } from '@/lib/allowedUsers';
import {
  ALLOWED_EMAIL_DOMAIN,
  isAllowedEmailDomain,
  isBroker,
  parseEmailList,
} from '@/lib/accessControl';
import {
  DEFAULT_OTHER_REGION,
  OTHER_PHONE_LABEL,
  OTHER_PHONE_REGIONS,
  PHONE_EXAMPLE,
  PHONE_LABEL,
  PHONE_REGION_NAME,
  normalizePhone,
  phoneHint,
  type OtherPhoneRegion,
  type PhoneRegion,
} from '@/lib/phone';
import type { AllowedUserRole, InviteResult } from '@/types/allowedUser';
import type { Site } from '@/types/site';
import type { Team } from '@/types/team';
import SpreadsheetImport from './SpreadsheetImport';
import DateField from '@/components/DateField';

/**
 * The one place in Settings that adds people, with two ways to do it.
 *
 * These were two separate panels — "Grant Access" and a spreadsheet import —
 * which left an admin looking at two boxes that both add people and no way to
 * tell which one they wanted. They are now one section with a mode switch.
 *
 * The typed-in mode **adapts to how many addresses are in the box**, because
 * the per-person fields genuinely cannot apply to a batch: one address and the
 * whole form is there, several and only the site, team and roles remain —
 * those are the only things that can honestly be true of everyone pasted in.
 * That rule is enforced on the server as well, not just here.
 */

const ROLE_CHIPS: { field: AllowedUserRole; label: string }[] = [
  { field: 'isAdmin',      label: 'Admin' },
  { field: 'isDispatcher', label: 'Dispatcher' },
  { field: 'isFinance',    label: 'Finance' },
  { field: 'isHr',         label: 'HR' },
];

const NO_ROLES = { isAdmin: false, isDispatcher: false, isFinance: false, isHr: false };

const EMPTY_DETAILS: NewPersonDetails = {
  firstName: '', lastName: '', legalName: '', personalEmail: '',
  phone: '', phoneOther: '', phoneOtherRegion: DEFAULT_OTHER_REGION,
  extension: '', dateOfBirth: '', startDate: '',
};

/** The fields on the details block that hold plain typed text. */
type TextDetail = Exclude<keyof NewPersonDetails, 'phoneOtherRegion'>;

type Mode = 'type' | 'spreadsheet';

const MODES: { id: Mode; label: string; Icon: typeof Keyboard }[] = [
  { id: 'type',        label: 'Type it in',  Icon: Keyboard },
  { id: 'spreadsheet', label: 'Spreadsheet', Icon: Table2 },
];

/** One labelled text input in the details grid. */
function Field({
  label, value, onChange, onBlur, hint, placeholder, type = 'text', disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  /** Shown under the field in amber. Used to say what will not be saved. */
  hint?: string;
  placeholder?: string;
  type?: string;
  disabled: boolean;
}) {
  const inputCls =
    'mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-400 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed';

  return (
    <label className="text-xs text-gray-500">
      {label}
      {/* Dates get the company's own box rather than the browser's — see
          DateField. Everything else is a plain input. */}
      {type === 'date' ? (
        <DateField value={value} onChange={onChange} disabled={disabled} className={inputCls} />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder={placeholder}
          disabled={disabled}
          className={inputCls}
        />
      )}
      {hint && <span className="mt-1 block text-[11px] text-amber-700">{hint}</span>}
    </label>
  );
}

export default function AddPeoplePanel({
  sites,
  teams,
  onChanged,
}: {
  sites: Site[];
  teams: Team[];
  /** Called after anything is written, so the list below can re-read. */
  onChanged: () => void;
}) {
  const [mode, setMode] = useState<Mode>('type');

  const [emails, setEmails]   = useState('');
  const [roles, setRoles]     = useState(NO_ROLES);
  const [siteId, setSiteId]   = useState('');
  const [teamId, setTeamId]   = useState('');
  const [details, setDetails] = useState<NewPersonDetails>(EMPTY_DETAILS);
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState('');
  const [results, setResults] = useState<InviteResult[]>([]);
  const [skippedPhones, setSkippedPhones] = useState<string[]>([]);

  // Parsed live so the admin sees the count and any off-domain address before
  // submitting. This runs the same parse the server does, so the preview and
  // the outcome cannot disagree.
  const parsed    = useMemo(() => parseEmailList(emails), [emails]);
  const offDomain = useMemo(() => parsed.filter((e) => !isAllowedEmailDomain(e)), [parsed]);

  // The hinge of this panel: details belong to a person, so they are only
  // offered when the box holds exactly one.
  const single = parsed.length === 1;

  const setField = (key: TextDetail) => (value: string) =>
    setDetails((d) => ({ ...d, [key]: value }));

  /**
   * Rewrite a phone field into the shape it will be stored in as soon as it
   * loses focus, so the admin sees the real value before they submit rather
   * than after.
   *
   * A number that cannot be read is left exactly as typed: it is saved blank,
   * but blanking the box here would take away the digits they need in order to
   * fix it. The hint under the field is what says it will not be kept.
   */
  const tidyPhone = (key: 'phone' | 'phoneOther', region: PhoneRegion) => () =>
    setDetails((d) => {
      const { value, rejected } = normalizePhone(d[key], region);
      return rejected ? d : { ...d, [key]: value };
    });

  /**
   * Changing the country re-reads the digits already in the box under the new
   * country's rules, rather than leaving a Guatemala-formatted number sitting
   * under a Mexico label. One that will not fit — eight digits switched to
   * Mexico — is left exactly as typed, and the hint says it will not be kept.
   */
  const setOtherRegion = (region: OtherPhoneRegion) =>
    setDetails((d) => {
      const { value, rejected } = normalizePhone(d.phoneOther, region);
      return { ...d, phoneOtherRegion: region, phoneOther: rejected ? d.phoneOther : value };
    });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (parsed.length === 0) return;

    setError('');
    setResults([]);
    setSkippedPhones([]);
    setBusy(true);
    try {
      const { results: rows, skippedPhones: dropped } = await inviteUsers(
        parsed, roles, siteId || null, teamId || null, single ? details : null,
      );
      setResults(rows);
      setSkippedPhones(dropped);

      // Leave the addresses that did not land in the box so a typo can be
      // fixed in place and resubmitted; clear the ones that succeeded.
      const leftover = rows.filter((r) => r.status !== 'added').map((r) => r.email);
      setEmails(leftover.join('\n'));
      if (leftover.length === 0) {
        setRoles(NO_ROLES);
        // Keeping one person's name and birthday in the form after they were
        // added is how it ends up on the next person.
        setDetails(EMPTY_DETAILS);
      }

      onChanged();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not grant access');
    } finally {
      setBusy(false);
    }
  }

  const addedCount = results.filter((r) => r.status === 'added').length;

  return (
    <section className="bg-white rounded-xl border border-gray-200 mb-6">
      <div className="px-6 py-4 border-b border-gray-100">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-gray-900">Add People</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Only people on this list can sign in. Addresses must end in{' '}
              <span className="font-medium text-gray-600">@{ALLOWED_EMAIL_DOMAIN}</span>. They can
              sign in as soon as you add them, and appear below as “Pending” until they do.
            </p>
          </div>

          {/* Two ways in, one section — see the note at the top of this file. */}
          <div className="flex rounded-lg border border-gray-200 p-0.5 flex-shrink-0">
            {MODES.map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setMode(id)}
                aria-pressed={mode === id}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${
                  mode === id
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-gray-500 hover:bg-gray-50'
                }`}
              >
                <Icon size={13} />
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {mode === 'spreadsheet' ? (
        <SpreadsheetImport sites={sites} teams={teams} onImported={onChanged} />
      ) : (
        <form onSubmit={handleSubmit} className="px-6 py-4 flex flex-col gap-3">
          <label className="text-xs text-gray-500">
            Email address{parsed.length > 1 ? 'es' : ''}
            <textarea
              value={emails}
              onChange={(e) => setEmails(e.target.value)}
              rows={parsed.length > 1 ? 5 : 2}
              spellCheck={false}
              placeholder={`name@${ALLOWED_EMAIL_DOMAIN}`}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            />
          </label>

          <p className="text-xs text-gray-500 -mt-1">
            {parsed.length === 0
              ? `One address to add someone with their full details, or several — one per line — to add a batch.`
              : parsed.length === 1
              ? 'Fill in as much as you know below. You can add the rest later.'
              : `${parsed.length} addresses · details are per-person, so only the site, team and roles below apply to all of them.`}
            {offDomain.length > 0 && (
              <span className="ml-2 text-amber-600">
                · {offDomain.length} outside @{ALLOWED_EMAIL_DOMAIN}
              </span>
            )}
          </p>

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

          {/* Greyed rather than hidden when several addresses are in the box:
              an admin who typed a name and then pasted four more addresses
              needs to see why the name stopped applying. */}
          <fieldset
            disabled={!single}
            className={`rounded-lg border p-4 transition ${
              single ? 'border-gray-200 bg-gray-50' : 'border-gray-100 bg-gray-50/50'
            }`}
          >
            <legend className="px-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              Their details
            </legend>

            {!single && (
              <p className="text-xs text-gray-400 mb-3">
                {parsed.length > 1
                  ? 'A name and a birthday belong to one person, so these are off for a batch. Add the people first, then fill each one in with the pencil icon below — or use the Spreadsheet mode to do it all at once.'
                  : 'Enter one address above to fill these in while you add them.'}
              </p>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="First name" value={details.firstName} onChange={setField('firstName')} placeholder="First" disabled={!single} />
              <Field label="Last name" value={details.lastName} onChange={setField('lastName')} placeholder="Last" disabled={!single} />
              <Field label="Full legal name" value={details.legalName} onChange={setField('legalName')} placeholder="As it appears on payroll" disabled={!single} />
              <Field label="Personal email" type="email" value={details.personalEmail} onChange={setField('personalEmail')} placeholder="name@example.com" disabled={!single} />
              <Field
                label={PHONE_LABEL.US}
                value={details.phone}
                onChange={setField('phone')}
                onBlur={tidyPhone('phone', 'US')}
                hint={phoneHint(details.phone, 'US')}
                placeholder={PHONE_EXAMPLE.US}
                disabled={!single}
              />
              <label className="text-xs text-gray-500">
                {OTHER_PHONE_LABEL}
                <div className="mt-1 flex gap-2">
                  <select
                    value={details.phoneOtherRegion}
                    onChange={(e) => setOtherRegion(e.target.value as OtherPhoneRegion)}
                    disabled={!single}
                    className="w-32 shrink-0 rounded-lg border border-gray-300 px-2 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-400 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
                  >
                    {OTHER_PHONE_REGIONS.map((r) => (
                      <option key={r} value={r}>{PHONE_REGION_NAME[r]}</option>
                    ))}
                  </select>
                  <input
                    value={details.phoneOther}
                    onChange={(e) => setField('phoneOther')(e.target.value)}
                    onBlur={tidyPhone('phoneOther', details.phoneOtherRegion)}
                    placeholder={PHONE_EXAMPLE[details.phoneOtherRegion]}
                    disabled={!single}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-400 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
                  />
                </div>
                {phoneHint(details.phoneOther, details.phoneOtherRegion) && (
                  <span className="mt-1 block text-[11px] text-amber-700">
                    {phoneHint(details.phoneOther, details.phoneOtherRegion)}
                  </span>
                )}
              </label>
              <Field label="Extension" value={details.extension} onChange={setField('extension')} placeholder="e.g. 204" disabled={!single} />
              <Field label="Start date" type="date" value={details.startDate} onChange={setField('startDate')} disabled={!single} />
              <Field label="Date of birth" type="date" value={details.dateOfBirth} onChange={setField('dateOfBirth')} disabled={!single} />
            </div>

            <p className="text-[11px] text-gray-400 mt-2">
              Full legal name, date of birth and personal email are visible to admins and HR only —
              they are not copied onto the profile the rest of the company can read. Leave the
              legal name blank if it is the same as the first and last name above.
            </p>
          </fieldset>

          {/* Site, team and roles sit outside that fieldset because they are the
              things that stay true however many addresses are in the box. */}
          <div className="flex items-center justify-end gap-2 flex-wrap">
            <label className="flex items-center gap-1.5 text-xs text-gray-500">
              Site:
              <select
                value={siteId}
                onChange={(e) => setSiteId(e.target.value)}
                className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs font-medium text-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-400"
              >
                <option value="">No site</option>
                {sites.map((site) => (
                  <option key={site.id} value={site.id}>{site.name}</option>
                ))}
              </select>
            </label>

            <label className="flex items-center gap-1.5 text-xs text-gray-500">
              Team:
              <select
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
                className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs font-medium text-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-400"
              >
                <option value="">No team</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>{team.name}</option>
                ))}
              </select>
            </label>

            <span className="text-xs text-gray-500 ml-1">Roles:</span>
            <button
              type="button"
              onClick={() => setRoles(NO_ROLES)}
              title="The default — their own clients and loads, nothing else"
              className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition ${
                isBroker(roles)
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
                onClick={() => setRoles((r) => ({ ...r, [field]: !r[field] }))}
                className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition ${
                  roles[field]
                    ? 'border-brand-200 bg-brand-50 text-brand-700'
                    : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-600">
              {error}
            </div>
          )}

          <div>
            <button
              type="submit"
              disabled={busy || parsed.length === 0}
              className="flex items-center gap-2 rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <UserPlus size={15} />
              {busy
                ? 'Adding…'
                : parsed.length > 1
                ? `Add ${parsed.length} People`
                : 'Add Person'}
            </button>
          </div>

          {/* Separate from the per-address rows below: the address was added,
              and this is the one part of the form that did not come with it. */}
          {skippedPhones.length > 0 && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
              <div className="flex items-start gap-2">
                <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                <p>
                  Saved without {skippedPhones.join(' or ')} — the number was not the right
                  length, so it was left blank. Add it with the pencil icon below.
                </p>
              </div>
            </div>
          )}

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
                    {/* Someone already on the list is the one case the
                        spreadsheet handles better, so say so. */}
                    {r.status === 'exists'
                      ? 'Already has access — use Spreadsheet mode to update them.'
                      : r.message}
                  </span>
                </div>
              ))}
            </div>
          )}
        </form>
      )}
    </section>
  );
}
