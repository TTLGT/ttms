'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft, AtSign, Building2, Cake, CalendarDays, ChevronRight, Hash, IdCard,
  Mail, MapPin, MessageSquare, Phone, Smartphone, UserRound, UsersRound,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { canSeeDirectory } from '@/lib/accessControl';
import { listDirectory, type DirectoryPerson } from '@/lib/directory';
import { buildPersonProfile, personEmailFromParam, personHref } from '@/lib/directoryProfile';
import { listSites } from '@/lib/sites';
import { listTeams } from '@/lib/teams';
import { otherPhone, telHref } from '@/lib/phone';
import { useDateFormatters } from '@/lib/useDateFormatters';
import { yearsSince } from '@/types/allowedUser';
import CopyLinkButton from '@/components/CopyLinkButton';
import MessagePersonButton from '@/components/chat/MessagePersonButton';
import Fact from '@/components/people/Fact';
import RoleBadges from '@/components/people/RoleBadges';
import { UserAvatar } from '@/components/settings/UserAvatar';
import type { Site } from '@/types/site';
import type { Team } from '@/types/team';

/**
 * One colleague, at their own address.
 *
 * The three directory views all answer "who is there"; this one answers
 * "who is this person", and it exists mostly so that answer can be **sent**.
 * A filtered list is the only thing the directory could hand somebody before
 * — /dashboard/directory?team=… is a screen, not a person — and "the Maria in
 * Dallas, not the one in GT" is not something a link could say. This page is
 * that link.
 *
 * It shows what the card shows and then the things a card has no room for: the
 * office's street address rather than just its name, who the person reports
 * to, and everyone sitting on their team. Nothing new is loaded to do it —
 * the directory, the sites and the teams are the same three lists the index
 * page loads, and lib/directoryProfile.ts turns them into one person.
 *
 * **Read-only, like the rest of the directory.** Names, numbers and offices
 * are edited in Settings → People, which is the access list and stays admin
 * and HR only. What is on screen here is decided in lib/directory.ts, not in
 * this file: an ordinary viewer is handed a person with no payroll fields on
 * them at all, so the admin/HR block below has nothing to draw rather than
 * being hidden.
 */

/** A titled box. Every section on the page is one, so they line up. */
function Panel({
  title, children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white">
      <header className="border-b border-gray-100 bg-gray-50 px-4 py-2.5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          {title}
        </h2>
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

/**
 * A colleague as one line, linking to their own page — the team lead and every
 * teammate.
 *
 * Trimmed to what places somebody, the same three details the org chart shows:
 * the role, the extension and the work line. This is the view for finding the
 * next person to open, and the whole of them is one click away.
 */
function PersonRow({ person, note }: { person: DirectoryPerson; note?: string }) {
  return (
    <Link
      href={personHref(person.email)}
      className="group flex items-center gap-3 rounded-lg px-2 py-2 transition hover:bg-gray-50"
    >
      <UserAvatar
        photoPath={person.photoPath}
        fallback={person.displayName.charAt(0).toUpperCase()}
        muted={person.suspended}
        size={32}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate text-sm font-medium text-gray-900 group-hover:text-brand-700">
            {person.displayName}
          </span>
          <RoleBadges person={person} size="small" />
          {note && (
            <span className="text-[11px] uppercase tracking-wide text-brand-700">{note}</span>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-gray-500">
          {person.extension && <span>ext. {person.extension}</span>}
          {person.phone && <span>{person.phone}</span>}
        </div>
      </div>
      <ChevronRight size={15} className="flex-shrink-0 text-gray-300 group-hover:text-brand-600" />
    </Link>
  );
}

export default function PersonPage() {
  // Dates follow the company setting, like every other date in the app.
  const { formatCalendarDate } = useDateFormatters();
  const { user, profile } = useAuth();
  // Admin and HR get the payroll block and the account's state. Same test the
  // data layer applies — asked again here only to word the page.
  const full = canSeeDirectory(profile);

  // Decoded on the way in — useParams() does not do it, unlike the params a
  // server component is handed. See personEmailFromParam.
  const params = useParams();
  const email  = personEmailFromParam(params.email);

  const [people, setPeople] = useState<DirectoryPerson[]>([]);
  const [sites, setSites]   = useState<Site[]>([]);
  const [teams, setTeams]   = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => {
    // Null for the moment before AuthContext has established the session;
    // loading then would fetch the narrow list and never widen it.
    if (!profile) return;

    let live = true;
    setLoading(true);
    // All three together, because the page cannot say anything until it has
    // the person *and* the names of the office and team they point at.
    Promise.all([listDirectory(profile), listSites(), listTeams()])
      .then(([directory, siteList, teamList]) => {
        if (!live) return;
        setPeople(directory);
        setSites(siteList);
        setTeams(teamList);
        setError('');
      })
      .catch((e: unknown) => {
        if (live) setError(e instanceof Error ? e.message : 'Could not load the directory.');
      })
      .finally(() => { if (live) setLoading(false); });

    return () => { live = false; };
  }, [profile]);

  const found = useMemo(
    () => buildPersonProfile(email, people, teams, sites),
    [email, people, teams, sites],
  );

  const back = (
    <Link
      href="/dashboard/directory"
      className="inline-flex items-center gap-1.5 text-sm text-gray-500 transition hover:text-brand-700"
    >
      <ArrowLeft size={15} />
      Directory
    </Link>
  );

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-7 w-7 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-3xl p-8">
        {back}
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600">
          {error}
        </div>
      </div>
    );
  }

  if (!found) {
    return (
      <div className="max-w-3xl p-8">
        {back}
        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-8 text-center">
          <UserRound size={22} className="mx-auto mb-2 text-gray-300" />
          <p className="text-sm text-gray-600">
            Nobody in the directory is at <span className="font-medium">{email}</span>.
          </p>
          {/* Not necessarily a dead link. An ordinary viewer's directory is
              built from profiles, so somebody who has been set up and has
              never signed in is genuinely not in it — and neither is anybody
              suspended. Saying so beats letting a working link read as broken
              to everyone but admin and HR. */}
          <p className="mx-auto mt-2 max-w-md text-xs text-gray-400">
            {full
              ? 'The address may have changed, or the person may have been removed from the access list.'
              : 'Somebody who has been set up but has never signed in, or whose access is suspended, only appears in the directory for admins and HR.'}
          </p>
        </div>
      </div>
    );
  }

  const { person, site, team, lead, isLead, teammates, alsoLeads } = found;
  const other = otherPhone(person);
  // Only worth showing when it is not simply the name again — most people's
  // legal name is what everyone already calls them.
  const legal =
    full && person.legalName && person.legalName.trim() !== person.displayName
      ? person.legalName.trim()
      : '';
  const years   = full ? yearsSince(person.startDate) : null;
  const started = full ? formatCalendarDate(person.startDate) : '';
  const born    = full ? formatCalendarDate(person.dateOfBirth) : '';
  const payroll = full && (legal || person.personalEmail || started || born);

  return (
    <div className="max-w-5xl p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {back}
        {/* The reason this page exists, so it is on it rather than left to
            whoever remembers the address bar is copyable. */}
        <CopyLinkButton label="Copy link to this page" />
      </div>

      <header
        className={`mt-4 flex flex-wrap items-start gap-5 rounded-xl border p-5 ${
          person.suspended ? 'border-red-200 bg-red-50/50' : 'border-gray-200 bg-white'
        }`}
      >
        <UserAvatar
          photoPath={person.photoPath}
          fallback={person.displayName.charAt(0).toUpperCase()}
          muted={person.suspended}
          size={96}
          expandable
          name={person.displayName}
        />

        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold text-gray-900">{person.displayName}</h1>
          {/* The name on the paperwork, under the name people use. */}
          {legal && <p className="text-sm text-gray-500">{legal}</p>}

          <div className="mt-2">
            <RoleBadges person={person} />
          </div>

          {/* The state of an account is not directory information — it shows
              only to the two roles whose job it is to do something about it. */}
          {full && (person.pending || person.suspended) && (
            <p
              className={`mt-2 text-xs font-medium ${
                person.suspended ? 'text-red-600' : 'text-amber-600'
              }`}
            >
              {person.suspended
                ? 'Suspended — this account cannot sign in.'
                : 'Set up but not signed in yet.'}
            </p>
          )}

          {/* The same three states the cards handle: a colleague with an
              account gets the button, somebody who has never signed in gets
              told why there is no button, and your own page gets neither. */}
          {person.uid && person.uid !== user?.uid ? (
            <MessagePersonButton
              uid={person.uid}
              name={person.displayName}
              label={`Message ${person.displayName.split(' ')[0]}`}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm font-medium text-brand-700 transition hover:bg-brand-100 disabled:opacity-50"
              iconSize={15}
            />
          ) : !person.uid ? (
            /* Chat threads are keyed to the account Google creates at first
               sign-in, so there is genuinely nobody to open one with yet. */
            <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-gray-400">
              <MessageSquare size={13} className="opacity-70" />
              Not on chat yet — they have never signed in
            </p>
          ) : null}
        </div>
      </header>

      <div className="mt-4 grid items-start gap-4 md:grid-cols-2">
        <Panel title="How to reach them">
          {/* `group` so every detail in this panel offers a copy button while
              the pointer is inside it — this is the page somebody opens with a
              form or a dialler waiting beside it. */}
          <div className="group grid grid-cols-[14px_1fr] items-start gap-x-2 gap-y-2">
            <Fact
              Icon={AtSign}
              href={`mailto:${person.email}`}
              copy={person.email}
              copyLabel="email address"
            >
              {person.email}
            </Fact>

            {/* Dialable, because half the reason to open a directory is to
                call the person in it. */}
            {person.phone && (
              <Fact
                Icon={Phone}
                href={telHref(person.phone, 'US')}
                copy={person.phone}
                copyLabel="work phone"
              >
                {person.phone}
              </Fact>
            )}

            {/* Copyable but not dialable — an extension only means anything
                inside the office phone system. See the same note on the cards. */}
            {person.extension && (
              <Fact Icon={Hash} copy={person.extension} copyLabel="extension">
                ext. {person.extension}
              </Fact>
            )}

            {/* Filled in for admin and HR only — see the note at the top of
                lib/directory.ts. It is usually somebody's home-country mobile
                rather than a desk they sit at. */}
            {other.value && (
              <Fact
                Icon={Smartphone}
                href={telHref(other.value, other.region)}
                copy={other.value}
                copyLabel="other phone"
              >
                {other.region} {other.value}
              </Fact>
            )}
          </div>
        </Panel>

        <Panel title="Where they sit">
          <div className="grid grid-cols-[14px_1fr] items-start gap-x-2 gap-y-2">
            {site ? (
              <>
                <Fact Icon={Building2}>{site.name}</Fact>
                {/* The street address is the thing a card had no room for and
                    the reason somebody opens this page before driving over. */}
                {site.address && <Fact Icon={MapPin}>{site.address}</Fact>}
              </>
            ) : (
              <Fact Icon={Building2}>
                <span className="text-gray-400">No office set</span>
              </Fact>
            )}

            {/* Prefixed so a team called "Staff" cannot be read as another
                office sitting next to the real one. */}
            <Fact Icon={UsersRound}>
              {team ? `Team ${team.name}` : <span className="text-gray-400">No team set</span>}
            </Fact>

            {/* Who they answer to, in the words the org chart uses. A team with
                no lead named is not an error — teams are regularly stood up
                before the person who will run them is hired. */}
            {team && (
              <Fact Icon={UserRound}>
                {isLead ? (
                  <>Leads this team</>
                ) : lead ? (
                  <>
                    Reports to{' '}
                    <Link href={personHref(lead.email)} className="text-brand-700 hover:underline">
                      {lead.displayName}
                    </Link>
                  </>
                ) : (
                  <span className="text-gray-400">No lead named for this team</span>
                )}
              </Fact>
            )}

            {/* One line rather than another list of people: the org chart is
                the view for reading a team out in full. */}
            {alsoLeads.length > 0 && (
              <Fact Icon={UsersRound}>
                Also leads {alsoLeads.map((t) => t.name).join(', ')}
              </Fact>
            )}
          </div>
        </Panel>
      </div>

      {team && (
        <div className="mt-4">
          <Panel title={isLead ? `Reports on team ${team.name}` : `Also on team ${team.name}`}>
            {teammates.length === 0 ? (
              <p className="px-2 text-xs text-gray-400">
                {isLead ? 'Nobody reports to them yet.' : 'Nobody else is on this team.'}
              </p>
            ) : (
              <ul className="-mx-2 divide-y divide-gray-50">
                {teammates.map((p) => (
                  <li key={p.email}>
                    <PersonRow person={p} />
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 px-2 text-xs text-gray-400">
              <Link href="/dashboard/directory?view=org" className="text-brand-700 underline">
                See the whole org chart
              </Link>
            </p>
          </Panel>
        </div>
      )}

      {/* The admin and HR block. These four fields are loaded only for those
          two roles, so for everyone else there is nothing here to draw — they
          are absent from this person rather than hidden by a check. */}
      {payroll && (
        <div className="mt-4">
          <Panel title="Payroll details — admins and HR only">
            {/* `group` for the copy buttons, as above — and this is the panel
                that most needs them: these are the fields HR retypes onto a
                form, where a transposed digit in a date of birth or a dropped
                letter in a legal name is the kind of mistake that comes back
                weeks later. */}
            <div className="group grid grid-cols-[14px_1fr] items-start gap-x-2 gap-y-2">
              {legal && (
                <Fact Icon={IdCard} copy={legal} copyLabel="legal name">
                  {legal} (legal name)
                </Fact>
              )}

              {person.personalEmail && (
                <Fact
                  Icon={Mail}
                  href={`mailto:${person.personalEmail}`}
                  copy={person.personalEmail}
                  copyLabel="personal email address"
                >
                  {person.personalEmail} (personal)
                </Fact>
              )}

              {/* Start date carries the years with it: "how long has this
                  person been here" is the question it actually gets asked, and
                  it is the same phrasing Settings → People uses. */}
              {started && (
                <Fact Icon={CalendarDays}>
                  Started {started}
                  {years !== null && years >= 1 && ` · ${years} year${years === 1 ? '' : 's'}`}
                </Fact>
              )}

              {born && <Fact Icon={Cake}>Born {born}</Fact>}
            </div>
          </Panel>
        </div>
      )}

      <p className="mt-6 text-xs text-gray-400">
        {full ? (
          <>
            Everything here is edited in{' '}
            <Link href="/dashboard/settings/people" className="text-brand-700 underline">
              Settings → People
            </Link>
            .
          </>
        ) : (
          <>Something here wrong or missing? Ask an admin to update it in Settings.</>
        )}
      </p>
    </div>
  );
}
