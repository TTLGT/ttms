'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ref, uploadBytesResumable } from 'firebase/storage';
import { Check, ExternalLink, Lock, ShieldCheck, X } from 'lucide-react';
import { storage } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { useApprovals } from '@/context/ApprovalsContext';
import {
  decideProfileUpdateRequest,
  fetchMyRecord,
  listProfileUpdateRequests,
  requestProfileUpdate,
  type MyRecord,
} from '@/lib/profileRequests';
import { listSites } from '@/lib/sites';
import { listTeams } from '@/lib/teams';
import {
  OTHER_PHONE_REGIONS,
  PHONE_EXAMPLE,
  PHONE_REGION_NAME,
  phoneHint,
  type OtherPhoneRegion,
} from '@/lib/phone';
import { personHref } from '@/lib/directoryProfile';
import { useDateFormatters } from '@/lib/useDateFormatters';
import {
  MAX_REASON,
  PROFILE_FIELDS,
  type ProfileField,
  type ProfileFieldMeta,
  type ProfileUpdateRequest,
} from '@/types/profileUpdateRequest';
import type { Site } from '@/types/site';
import type { Team } from '@/types/team';
import DateField from '@/components/DateField';
import RoleBadges from '@/components/people/RoleBadges';
import { MAX_PHOTO_BYTES, UserAvatar } from '@/components/settings/UserAvatar';

/**
 * Your own record: what the company holds about you, and how to get it fixed.
 *
 * Everything on this page is entered by an admin in Settings → People, and it
 * stays that way — nothing here writes to `allowedUsers`. What was missing was
 * the other half of that arrangement: the person the record is *about* could
 * not see it, and had no way to say "that is my old number" except by finding
 * somebody. Four of the fields (legal name, personal email, date of birth,
 * start date) are deliberately kept off `users/{uid}` because every signed-in
 * user can read that document, which meant they were invisible to their owner
 * too. /api/me serves them here, to the one caller they belong to.
 *
 * Each row offers a **request**, not an edit. It goes to whoever holds
 * `profile.decideUpdates` — admin and HR — and appears in their Approvals
 * inbox beside the client and load requests. Approving is what writes the
 * field, through the Admin SDK, exactly as an admin editing the row would.
 *
 * Roles are shown and cannot be asked about. What somebody is allowed to do is
 * not a detail about them that could be out of date; it is the access model,
 * and a queue for "please make me an admin" is a queue for the wrong question.
 */

/** The sections the fields are grouped into, in the order they are shown. */
const SECTIONS: { title: string; blurb: string; fields: ProfileField[] }[] = [
  {
    title: 'Your name',
    blurb: 'How you appear everywhere in TTMS — on loads, in chat and in the directory.',
    fields: ['firstName', 'lastName'],
  },
  {
    title: 'How people reach you',
    blurb: 'Everyone signed in can see these. They are the company phone book.',
    fields: ['phone', 'extension', 'phoneOther'],
  },
  {
    title: 'Where you work',
    blurb: 'Your office and the team you report through.',
    fields: ['siteId', 'teamId'],
  },
  {
    title: 'Payroll and personal',
    blurb: 'Only you, HR and administrators can see these. They are never shown in the directory.',
    fields: ['legalName', 'personalEmail', 'dateOfBirth', 'startDate'],
  },
];

export default function MyProfilePage() {
  const { user } = useAuth();
  // Raising a request moves the amber "waiting on someone else" badge in the
  // nav, so it has to re-count here as well as on the Approvals screen.
  const { refresh: refreshBadges } = useApprovals();
  const { formatCalendarDate } = useDateFormatters();

  const [me, setMe]         = useState<MyRecord | null>(null);
  const [sites, setSites]   = useState<Site[]>([]);
  const [teams, setTeams]   = useState<Team[]>([]);
  const [mine, setMine]     = useState<ProfileUpdateRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState('');
  const [notice, setNotice] = useState('');

  /** Which field's editor is open. One at a time — this is a list, not a form. */
  const [editing, setEditing] = useState<ProfileField | null>(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const [record, siteList, teamList, requests] = await Promise.all([
        fetchMyRecord(),
        listSites(),
        listTeams(),
        listProfileUpdateRequests('outgoing'),
      ]);
      setMe(record);
      setSites(siteList);
      setTeams(teamList);
      setMine(requests);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your record.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (user) void load(); }, [user, load]);

  /** The pending request against a field, if there is one. */
  const pendingFor = useMemo(() => {
    const byField = new Map<string, ProfileUpdateRequest>();
    for (const r of mine) if (r.status === 'pending') byField.set(r.field, r);
    return byField;
  }, [mine]);

  const siteName = (id: string | null) => sites.find((s) => s.id === id)?.name ?? '';
  const teamName = (id: string | null) => teams.find((t) => t.id === id)?.name ?? '';

  /** The value of a field as it should read on screen. */
  const shown = (field: ProfileField): string => {
    if (!me) return '';
    switch (field) {
      case 'siteId':      return siteName(me.siteId);
      case 'teamId':      return teamName(me.teamId);
      case 'dateOfBirth': return formatCalendarDate(me.dateOfBirth);
      case 'startDate':   return formatCalendarDate(me.startDate);
      case 'phoneOther':  return me.phoneOther
        ? `${me.phoneOther} (${PHONE_REGION_NAME[me.phoneOtherRegion]})`
        : '';
      case 'photoPath':   return me.photoPath ? 'A photo is set' : '';
      default:            return String(me[field] ?? '');
    }
  };

  async function submit(field: ProfileField, input: {
    value: string;
    region?: OtherPhoneRegion;
    reason: string;
    requestedLabel?: string;
  }) {
    setError('');
    setNotice('');
    try {
      // The words behind an id, so the approver reads "Dallas → Laredo" rather
      // than two document ids. Only for the two fields whose value is an id:
      // for everything else the value already IS the words, and a label would
      // be a second copy of it that could disagree. A photo carries no label
      // at all — the inbox shows the picture.
      const labelled = field === 'siteId' || field === 'teamId';

      await requestProfileUpdate({
        field,
        value: input.value,
        region: input.region,
        reason: input.reason,
        currentLabel:   labelled ? shown(field) || 'Not assigned' : undefined,
        requestedLabel: labelled ? input.requestedLabel || 'Not assigned' : undefined,
      });
      setEditing(null);
      setNotice('Sent. It will show in Approvals until HR or an administrator decides it.');
      setMine(await listProfileUpdateRequests('outgoing'));
      refreshBadges();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the request.');
    }
  }

  async function withdraw(requestId: string) {
    setError('');
    setNotice('');
    try {
      await decideProfileUpdateRequest(requestId, 'withdraw');
      setMine(await listProfileUpdateRequests('outgoing'));
      refreshBadges();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not take the request back.');
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!me) {
    return (
      <div className="p-8 max-w-3xl">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600">
          {error || 'Could not load your record.'}
        </div>
      </div>
    );
  }

  const name = me.displayName || [me.firstName, me.lastName].filter(Boolean).join(' ') || me.email;

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">My profile</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          What TTMS holds about you. Your details are kept by HR and administrators,
          so anything you want changed is asked for here and shows in their Approvals
          inbox.
        </p>
      </div>

      {error  && <Banner tone="error">{error}</Banner>}
      {notice && <Banner tone="ok">{notice}</Banner>}

      {!me.onAllowlist && (
        <Banner tone="error">
          You are signed in against the emergency administrator list rather than an
          entry of your own, so there is no record here to change. Ask another
          administrator to add you in Settings → People.
        </Banner>
      )}

      {/* Who you are, and the picture everyone else sees beside your name. */}
      <section className="mb-6 rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex flex-wrap items-center gap-4">
          <UserAvatar
            photoPath={me.photoPath}
            fallback={name.charAt(0).toUpperCase()}
            size={72}
            expandable
            name={name}
          />
          <div className="min-w-0 flex-1">
            <p className="text-lg font-semibold text-gray-900">{name}</p>
            <p className="text-sm text-gray-500">{me.email}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <RoleBadges person={me} />
            </div>
          </div>
          <Link
            href={personHref(me.email)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:underline"
          >
            See your directory page <ExternalLink size={13} />
          </Link>
        </div>

        {/*
          What everybody else can and cannot see, said once rather than
          repeated on four rows. People assume a birthday held for payroll is
          on the card their colleagues read, and it is not.
        */}
        <p className="mt-4 flex items-start gap-2 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
          <ShieldCheck size={14} className="mt-0.5 flex-shrink-0 text-gray-400" />
          Your name, photo, work number, extension, office and team are in the company
          directory. Your legal name, personal email, date of birth and start date are
          not — only you, HR and administrators can see those.
        </p>

        <PhotoRow
          email={me.email}
          photoPath={me.photoPath}
          name={name}
          pending={pendingFor.get('photoPath')}
          disabled={!me.onAllowlist}
          onSubmit={(value, reason) => submit('photoPath', { value, reason })}
          onWithdraw={withdraw}
        />
      </section>

      {SECTIONS.map((section) => (
        <section key={section.title} className="mb-6 rounded-xl border border-gray-200 bg-white">
          <header className="border-b border-gray-100 bg-gray-50 px-4 py-2.5">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              {section.title}
            </h2>
            <p className="mt-0.5 text-[11px] text-gray-400">{section.blurb}</p>
          </header>

          <ul className="divide-y divide-gray-100">
            {section.fields.map((field) => {
              const meta = PROFILE_FIELDS.find((f) => f.key === field)!;
              return (
                <FieldRow
                  key={field}
                  meta={meta}
                  value={shown(field)}
                  pending={pendingFor.get(field)}
                  open={editing === field}
                  disabled={!me.onAllowlist}
                  onOpen={() => { setEditing(field); setNotice(''); }}
                  onCancel={() => setEditing(null)}
                  onWithdraw={withdraw}
                  onSubmit={(input) => submit(field, input)}
                  me={me}
                  sites={sites}
                  teams={teams}
                />
              );
            })}
          </ul>
        </section>
      ))}

      <p className="text-xs text-gray-400">
        Everything you have asked for, decided or not, is under{' '}
        <Link href="/dashboard/approvals" className="text-brand-600 hover:underline">
          Approvals → Your requests
        </Link>.
      </p>
    </div>
  );
}

// ── Pieces ───────────────────────────────────────────────────────────────────

function Banner({ tone, children }: { tone: 'error' | 'ok'; children: React.ReactNode }) {
  const style = tone === 'error'
    ? 'border-red-200 bg-red-50 text-red-600'
    : 'border-green-200 bg-green-50 text-green-700';
  return <div className={`mb-4 rounded-lg border p-3 text-sm ${style}`}>{children}</div>;
}

/** "Waiting on HR" plus the way out of it, shown wherever a request is open. */
function PendingNote({
  request, onWithdraw,
}: {
  request: ProfileUpdateRequest;
  onWithdraw: (id: string) => void;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
        Change requested
      </span>
      <button
        type="button"
        onClick={() => onWithdraw(request.id)}
        className="text-[11px] text-gray-400 underline-offset-2 hover:text-gray-700 hover:underline"
      >
        Take it back
      </button>
    </span>
  );
}

/**
 * One field: what it holds now, and the way to ask for something else.
 *
 * The editor opens in place rather than in a dialog. A dialog would hide the
 * value being changed at the moment somebody is deciding what to change it to,
 * which is the one thing they need in front of them.
 */
function FieldRow({
  meta, value, pending, open, disabled, onOpen, onCancel, onWithdraw, onSubmit, me, sites, teams,
}: {
  meta: ProfileFieldMeta;
  value: string;
  pending?: ProfileUpdateRequest;
  open: boolean;
  disabled: boolean;
  onOpen: () => void;
  onCancel: () => void;
  onWithdraw: (id: string) => void;
  onSubmit: (input: {
    value: string; region?: OtherPhoneRegion; reason: string; requestedLabel?: string;
  }) => Promise<void>;
  me: MyRecord;
  sites: Site[];
  teams: Team[];
}) {
  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium text-gray-900">{meta.label}</span>
            {meta.privateToHr && (
              <Lock size={11} className="text-gray-400" aria-label="Not shown in the directory" />
            )}
          </div>
          <p className="mt-0.5 text-sm text-gray-600">
            {value || <span className="text-gray-400">Not recorded</span>}
          </p>
          <p className="mt-0.5 text-[11px] text-gray-400">{meta.detail}</p>
        </div>

        <div className="flex-shrink-0">
          {pending ? (
            <PendingNote request={pending} onWithdraw={onWithdraw} />
          ) : open ? null : (
            <button
              type="button"
              onClick={onOpen}
              disabled={disabled}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
            >
              Ask to change
            </button>
          )}
        </div>
      </div>

      {open && !pending && (
        <FieldEditor
          meta={meta}
          me={me}
          sites={sites}
          teams={teams}
          onCancel={onCancel}
          onSubmit={onSubmit}
        />
      )}
    </li>
  );
}

/** The input for one field, shaped by its kind, plus the reason and the buttons. */
function FieldEditor({
  meta, me, sites, teams, onCancel, onSubmit,
}: {
  meta: ProfileFieldMeta;
  me: MyRecord;
  sites: Site[];
  teams: Team[];
  onCancel: () => void;
  onSubmit: (input: {
    value: string; region?: OtherPhoneRegion; reason: string; requestedLabel?: string;
  }) => Promise<void>;
}) {
  // Seeded with what is there now, so a correction is an edit rather than a
  // retype — most of these requests are one wrong digit.
  const [value, setValue]   = useState(() => seed(meta.key, me));
  const [region, setRegion] = useState<OtherPhoneRegion>(me.phoneOtherRegion);
  const [reason, setReason] = useState('');
  const [busy, setBusy]     = useState(false);

  const field = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500';

  // The same warning the admin editor shows under the same box, so a number
  // that will not be stored is said so before it is sent to anybody.
  const hint = meta.kind === 'phone' ? phoneHint(value, 'US')
    : meta.kind === 'otherPhone' ? phoneHint(value, region)
    : '';

  async function send() {
    setBusy(true);
    try {
      await onSubmit({
        value,
        region: meta.kind === 'otherPhone' ? region : undefined,
        reason,
        requestedLabel:
          meta.kind === 'site' ? sites.find((s) => s.id === value)?.name
          : meta.kind === 'team' ? teams.find((t) => t.id === value)?.name
          : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 rounded-lg bg-gray-50 p-3">
      <label className="block text-[11px] font-medium uppercase tracking-wide text-gray-400">
        New {meta.label.toLowerCase()}
      </label>

      <div className="mt-1">
        {meta.kind === 'date' ? (
          <DateField value={value} onChange={setValue} className={field} ariaLabel={meta.label} />
        ) : meta.kind === 'site' || meta.kind === 'team' ? (
          <select value={value} onChange={(e) => setValue(e.target.value)} className={field}>
            <option value="">Not assigned</option>
            {(meta.kind === 'site' ? sites : teams).map((option) => (
              <option key={option.id} value={option.id}>{option.name}</option>
            ))}
          </select>
        ) : meta.kind === 'otherPhone' ? (
          <div className="flex gap-2">
            <select
              value={region}
              onChange={(e) => setRegion(e.target.value as OtherPhoneRegion)}
              className={`${field} w-36`}
              aria-label="Country"
            >
              {OTHER_PHONE_REGIONS.map((r) => (
                <option key={r} value={r}>{PHONE_REGION_NAME[r]}</option>
              ))}
            </select>
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={PHONE_EXAMPLE[region]}
              className={field}
            />
          </div>
        ) : (
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={meta.kind === 'phone' ? PHONE_EXAMPLE.US : ''}
            className={field}
          />
        )}
      </div>

      {hint && <p className="mt-1 text-xs text-amber-600">{hint}</p>}
      <p className="mt-1 text-[11px] text-gray-400">
        Leave it empty to ask for this to be cleared.
      </p>

      <label className="mt-3 block text-[11px] font-medium uppercase tracking-wide text-gray-400">
        Why (optional)
      </label>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value.slice(0, MAX_REASON))}
        rows={2}
        placeholder="Anything the person deciding should know."
        className={`${field} mt-1 resize-y`}
      />

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={send}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
        >
          <Check size={13} /> {busy ? 'Sending…' : 'Send request'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-white disabled:opacity-50"
        >
          <X size={13} /> Cancel
        </button>
      </div>
    </div>
  );
}

/** What the editor starts on: the stored value, in the form the input takes. */
function seed(field: ProfileField, me: MyRecord): string {
  switch (field) {
    case 'siteId':     return me.siteId ?? '';
    case 'teamId':     return me.teamId ?? '';
    case 'photoPath':  return '';
    case 'phoneOther': return me.phoneOther;
    default:           return String(me[field] ?? '');
  }
}

/**
 * The photo, which is the one field whose value is a file.
 *
 * The image is uploaded before the request is raised, because there is nowhere
 * else to put it — a request document cannot carry a JPEG, and the approver
 * has to be able to look at the picture before deciding. It goes under
 * `avatars/`, which the Storage rules already open to every staff account, and
 * nothing points at it until somebody approves. If the request is refused or
 * taken back, the decide route deletes the file rather than leaving it in the
 * bucket forever.
 *
 * Note what this does NOT do: write `photoPath`. Uploading a file is not
 * setting a photo. That is the whole difference between this and the uploader
 * an admin uses in Settings → People, which writes immediately because an
 * admin's decision is the decision.
 */
function PhotoRow({
  email, photoPath, name, pending, disabled, onSubmit, onWithdraw,
}: {
  email: string;
  photoPath: string | null;
  name: string;
  pending?: ProfileUpdateRequest;
  disabled: boolean;
  onSubmit: (value: string, reason: string) => Promise<void>;
  onWithdraw: (id: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [problem, setProblem]   = useState('');

  function handleFile(file: File) {
    if (!file.type.startsWith('image/')) { setProblem('Choose an image file.'); return; }
    if (file.size > MAX_PHOTO_BYTES)     { setProblem('Image must be under 5 MB.'); return; }

    setProblem('');
    const extension = file.name.includes('.') ? file.name.split('.').pop() : 'jpg';
    // `requested-` in the name so anybody looking in the bucket can tell a
    // photo that is waiting on a decision from one that is in use.
    const path = `avatars/${email}/requested-${Date.now()}.${extension}`;
    const task = uploadBytesResumable(ref(storage, path), file);

    task.on(
      'state_changed',
      (snap) => setProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
      (err) => { setProblem(err.message); setProgress(null); },
      async () => {
        setProgress(null);
        await onSubmit(path, '');
      },
    );
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4">
      {pending ? (
        <>
          <UserAvatar
            photoPath={pending.requestedValue || null}
            fallback={name.charAt(0).toUpperCase()}
            size={44}
            expandable
            name={name}
          />
          <div className="min-w-0">
            <p className="text-xs text-gray-600">
              This photo is waiting on HR or an administrator.
            </p>
            <div className="mt-1"><PendingNote request={pending} onWithdraw={onWithdraw} /></div>
          </div>
        </>
      ) : progress !== null ? (
        <div className="flex w-48 items-center gap-2">
          <div className="h-1.5 flex-1 rounded-full bg-gray-200">
            <div className="h-1.5 rounded-full bg-brand-500 transition-all" style={{ width: `${progress}%` }} />
          </div>
          <span className="text-xs text-gray-500">{progress}%</span>
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={disabled}
            className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700 transition hover:bg-brand-100 disabled:opacity-50"
          >
            {photoPath ? 'Ask to change your photo' : 'Ask for a photo to be added'}
          </button>
          <p className="text-[11px] text-gray-400">
            JPG or PNG, under 5 MB. It is not used until somebody approves it.
          </p>
        </>
      )}

      {problem && <p className="w-full text-xs text-red-500">{problem}</p>}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = '';
        }}
      />
    </div>
  );
}
