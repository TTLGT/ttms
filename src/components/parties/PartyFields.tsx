'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { listUserProfiles } from '@/lib/userProfiles';
import { listWorkGroups } from '@/lib/workGroups';
import { lookupPartiesByPhone } from '@/lib/parties';
import { BLANK_ADDRESS, ROLE_LABEL, PARTY_ROLES, toPhoneKey, partyDisplayName } from '@/types/party';
import type { Party, PartyRole } from '@/types/party';
import type { Address } from '@/types/order';
import type { UserProfile } from '@/types/userProfile';
import type { WorkGroup } from '@/types/workGroup';
import PersonNameFields from '@/components/PersonNameFields';
import LeadSourceField from '@/components/orders/LeadSourceField';

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY',
];

/**
 * Everything a new client, shipper or consignee is made of.
 *
 * `contactName` is one string rather than a first/last pair because that is
 * what the schema has and what BATS imported — see src/lib/names.ts. The form
 * still asks for the two halves; PersonNameFields joins them.
 */
export interface PartyDraft {
  companyName: string;
  contactName: string;
  phone: string;
  email: string;
  phone2: string;
  email2: string;
  address: Address;
  roles: PartyRole[];
  sourceId: string | null;
  notes: string;
  /** Co-owners chosen at creation. Ignored when the form is editing. */
  ownerUids: string[];
  ownerGroupIds: string[];
}

export function blankPartyDraft(role: PartyRole): PartyDraft {
  return {
    companyName: '',
    contactName: '',
    phone: '',
    email: '',
    phone2: '',
    email2: '',
    address: { ...BLANK_ADDRESS },
    roles: [role],
    sourceId: null,
    notes: '',
    ownerUids: [],
    ownerGroupIds: [],
  };
}

/** Which keys a validation message can be attached to, for highlighting. */
export type PartyField =
  | 'companyName' | 'contactName' | 'phone' | 'email'
  | 'street' | 'city' | 'state' | 'zip' | 'sourceId';

/**
 * What is still missing before this record may be saved.
 *
 * Everything except the second phone, the second email and the comments is
 * required, for all three roles. That is a deliberate tightening: the old
 * order form accepted a name typed into one box and created the record from
 * that alone, so a client could reach the point of needing an agreement sent
 * with no email on file and nobody aware of it until that moment. A shipper
 * with no phone number is the same problem at the dock.
 *
 * The lead source is asked for on a client only. A shipper or consignee is a
 * facility on somebody's route, not a lead — the same split the party pages
 * and the API already make.
 *
 * Returned as a map rather than thrown, so every gap is shown at once instead
 * of one per attempt.
 */
export function validatePartyDraft(draft: PartyDraft): Partial<Record<PartyField, string>> {
  const errors: Partial<Record<PartyField, string>> = {};
  const has = (v: string) => v.trim().length > 0;

  if (!has(draft.companyName)) errors.companyName = 'Company name is required.';
  if (!has(draft.contactName)) errors.contactName = 'A first and last name are required.';
  else if (draft.contactName.trim().split(/\s+/).length < 2) {
    errors.contactName = 'Enter both a first and a last name.';
  }

  // Digits, not just any text: "call the desk" in a phone box is worse than an
  // empty one, because it looks answered.
  if (!has(draft.phone))            errors.phone = 'A phone number is required.';
  else if (!toPhoneKey(draft.phone)) errors.phone = 'That is too short to be a phone number.';

  if (!has(draft.email))                       errors.email = 'An email address is required.';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim())) {
    errors.email = 'That does not look like an email address.';
  }

  if (!has(draft.address.street)) errors.street = 'Street is required.';
  if (!has(draft.address.city))   errors.city   = 'City is required.';
  if (!has(draft.address.state))  errors.state  = 'State is required.';
  if (!has(draft.address.zip))    errors.zip    = 'ZIP is required.';

  if (draft.roles.includes('client') && !draft.sourceId) {
    errors.sourceId = 'A lead source is required on a client.';
  }

  return errors;
}

const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400';
const badCls   = 'w-full border border-red-400 bg-red-50 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400';

function Field({ label, error, hint, children }: {
  label: string; error?: string; hint?: string; children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {children}
      {error ? <p className="text-xs text-red-600 mt-1">{error}</p>
             : hint ? <p className="text-xs text-gray-400 mt-1">{hint}</p> : null}
    </div>
  );
}

/**
 * The full detail form for a party, shared by the standalone New Client page
 * and by the quick-add dialog on the order form.
 *
 * One definition on purpose: the two used to disagree completely — the order
 * form asked for a name and nothing else — and a record's completeness should
 * not depend on which screen somebody happened to be on when they made it.
 *
 * Renders no <form> element. The quick-add dialog opens inside the order form,
 * and a nested form is invalid HTML that browsers resolve by dropping the
 * inner one, taking its validation with it. Validation is validatePartyDraft().
 */
export default function PartyFields({
  value,
  onChange,
  errors = {},
  showRoles = true,
  showOwners = true,
  /** Offered when a phone lookup finds a record already on file. */
  onUseExisting,
}: {
  value: PartyDraft;
  onChange: (draft: PartyDraft) => void;
  errors?: Partial<Record<PartyField, string>>;
  showRoles?: boolean;
  showOwners?: boolean;
  onUseExisting?: (party: Party) => void;
}) {
  const { user, profile, can } = useAuth();
  const [people, setPeople] = useState<UserProfile[]>([]);
  const [groups, setGroups] = useState<WorkGroup[]>([]);

  const set = <K extends keyof PartyDraft>(key: K, v: PartyDraft[K]) =>
    onChange({ ...value, [key]: v });

  const setAddress = (k: keyof Address) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      onChange({ ...value, address: { ...value.address, [k]: e.target.value } });

  useEffect(() => {
    if (!showOwners) return;
    listUserProfiles().then(setPeople).catch(() => {});
    listWorkGroups().then(setGroups).catch(() => {});
  }, [showOwners]);

  /**
   * Which groups this person may hand the record to. Their own, unless they
   * can reassign ownership generally — the API applies the same test, and a
   * picker offering a group the server would refuse is just a dead end.
   */
  const pickableGroups = useMemo(() => {
    if (can('ownership.change')) return groups;
    const mine = new Set(profile?.groupIds ?? []);
    return groups.filter((g) => mine.has(g.id));
  }, [groups, profile, can]);

  const colleagues = useMemo(
    () => people
      .filter((p) => p.uid !== user?.uid && !p.suspended)
      .sort((a, b) => (a.displayName || a.email).localeCompare(b.displayName || b.email)),
    [people, user],
  );

  const toggle = (key: 'ownerUids' | 'ownerGroupIds', id: string) =>
    set(key, value[key].includes(id)
      ? value[key].filter((x) => x !== id)
      : [...value[key], id]);

  return (
    <div className="space-y-5">
      <PhoneLookupRow
        phone={value.phone}
        onUseExisting={onUseExisting}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Company name" error={errors.companyName}
          hint="The name this shows up as on orders and agreements.">
          <input value={value.companyName} onChange={(e) => set('companyName', e.target.value)}
            className={errors.companyName ? badCls : inputCls} />
        </Field>

        <div className="col-span-1">
          <PersonNameFields label="Contact" value={value.contactName}
            onChange={(v) => set('contactName', v)} />
          {errors.contactName && <p className="text-xs text-red-600 mt-1">{errors.contactName}</p>}
        </div>

        <Field label="Phone" error={errors.phone}>
          <input value={value.phone} onChange={(e) => set('phone', e.target.value)}
            inputMode="tel" placeholder="(469) 576-9974"
            className={errors.phone ? badCls : inputCls} />
        </Field>

        <Field label="Email" error={errors.email}
          hint="Agreements and load confirmations are sent here.">
          <input type="email" value={value.email} onChange={(e) => set('email', e.target.value)}
            className={errors.email ? badCls : inputCls} />
        </Field>

        <Field label="Secondary phone (optional)">
          <input value={value.phone2} onChange={(e) => set('phone2', e.target.value)}
            inputMode="tel" className={inputCls} />
        </Field>

        <Field label="Secondary email (optional)">
          <input type="email" value={value.email2} onChange={(e) => set('email2', e.target.value)}
            className={inputCls} />
        </Field>
      </div>

      <div>
        <p className="text-sm font-semibold text-gray-700 mb-3">Address</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="col-span-1 sm:col-span-2">
            <input placeholder="Street address" value={value.address.street} onChange={setAddress('street')}
              className={errors.street ? badCls : inputCls} />
            {errors.street && <p className="text-xs text-red-600 mt-1">{errors.street}</p>}
          </div>
          <div>
            <input placeholder="City" value={value.address.city} onChange={setAddress('city')}
              className={errors.city ? badCls : inputCls} />
            {errors.city && <p className="text-xs text-red-600 mt-1">{errors.city}</p>}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <select value={value.address.state} onChange={setAddress('state')}
                className={errors.state ? badCls : inputCls}>
                <option value="">State</option>
                {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              {errors.state && <p className="text-xs text-red-600 mt-1">{errors.state}</p>}
            </div>
            <div>
              <input placeholder="ZIP" value={value.address.zip} onChange={setAddress('zip')}
                className={errors.zip ? badCls : inputCls} />
              {errors.zip && <p className="text-xs text-red-600 mt-1">{errors.zip}</p>}
            </div>
          </div>
        </div>
      </div>

      {showRoles && (
        <div>
          <p className="text-sm font-semibold text-gray-700 mb-2">Roles</p>
          <div className="flex gap-4">
            {PARTY_ROLES.map((r) => (
              <label key={r} className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={value.roles.includes(r)}
                  onChange={(e) => set('roles', e.target.checked
                    ? [...value.roles, r]
                    : value.roles.filter((x) => x !== r))} />
                {ROLE_LABEL[r]}
              </label>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-1">
            One record serves every role — tick more than one if this company both ships and receives.
          </p>
        </div>
      )}

      {/* A lead source only means anything on a client. The creator owns the
          record they are about to write, so they may always set it. */}
      {value.roles.includes('client') && (
        <div>
          <LeadSourceField value={value.sourceId} onChange={(v) => set('sourceId', v)} canEdit
            hint="How this client came to us. Used for attribution reporting." />
          {errors.sourceId && <p className="text-xs text-red-600 mt-1">{errors.sourceId}</p>}
        </div>
      )}

      {showOwners && (
        <div className="space-y-4 border-t border-gray-100 pt-5">
          <div>
            <p className="text-sm font-semibold text-gray-700">Owners</p>
            <p className="text-xs text-gray-500 mt-0.5">
              You will own this record. Anyone you add here owns it with you and can see it
              and its orders — everybody else has to ask.
            </p>
          </div>

          {colleagues.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-600 mb-2">Share with people</p>
              <div className="flex flex-wrap gap-x-4 gap-y-2 max-h-40 overflow-auto">
                {colleagues.map((p) => (
                  <label key={p.uid} className="flex items-center gap-2 text-sm text-gray-700">
                    <input type="checkbox" checked={value.ownerUids.includes(p.uid)}
                      onChange={() => toggle('ownerUids', p.uid)} />
                    {p.displayName || p.email}
                  </label>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="text-xs font-medium text-gray-600 mb-2">Share with a work group</p>
            {pickableGroups.length === 0 ? (
              <p className="text-sm text-gray-400">
                {groups.length === 0
                  ? 'No work groups yet — an admin creates them in Settings.'
                  : 'You are not in a work group yet.'}
              </p>
            ) : (
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {pickableGroups.map((g) => (
                  <label key={g.id} className="flex items-center gap-2 text-sm text-gray-700">
                    <input type="checkbox" checked={value.ownerGroupIds.includes(g.id)}
                      onChange={() => toggle('ownerGroupIds', g.id)} />
                    {g.name}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <Field label="Comments (optional)"
        hint="Anything the next person to touch this record should know.">
        <textarea value={value.notes} onChange={(e) => set('notes', e.target.value)} rows={3}
          className={`${inputCls} resize-none`} />
      </Field>
    </div>
  );
}

/**
 * Warns when the number being typed is already on somebody's record.
 *
 * The check runs as the number is typed rather than on save, because by save
 * time the broker has filled in a whole form they would have to throw away.
 * It never blocks: two people really do share a switchboard, and a number is
 * not the identity of a company. It only makes the duplicate visible while
 * choosing is still cheap.
 */
function PhoneLookupRow({ phone, onUseExisting }: {
  phone: string;
  onUseExisting?: (party: Party) => void;
}) {
  const [found, setFound] = useState<{ matches: Party[]; owned: number } | null>(null);
  const key = toPhoneKey(phone);

  useEffect(() => {
    if (!key) { setFound(null); return; }
    let live = true;
    // Debounced: a ten-digit number is ten keystrokes, and each one would
    // otherwise be a query against production.
    const timer = setTimeout(() => {
      lookupPartiesByPhone(phone)
        .then((r) => { if (live) setFound({ matches: r.matches, owned: r.owned.length }); })
        .catch(() => { if (live) setFound(null); });
    }, 400);
    return () => { live = false; clearTimeout(timer); };
  }, [key, phone]);

  if (!found || (found.matches.length === 0 && found.owned === 0)) return null;

  return (
    <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm">
      <p className="text-amber-900 font-medium">That number is already on file.</p>
      {found.matches.length > 0 && (
        <ul className="mt-2 space-y-1">
          {found.matches.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3">
              <span className="text-amber-900">
                {partyDisplayName(p)}
                {p.contactName && p.companyName ? ` · ${p.contactName}` : ''}
              </span>
              {onUseExisting && (
                <button type="button" onClick={() => onUseExisting(p)}
                  className="px-2 py-1 bg-amber-600 text-white text-xs font-semibold rounded hover:bg-amber-700 transition">
                  Use this one
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {found.owned > 0 && (
        <p className="text-xs text-amber-800 mt-2">
          {found.owned === 1 ? 'One other record' : `${found.owned} other records`} with this number
          belong to colleagues you would need approval to use.
        </p>
      )}
    </div>
  );
}
