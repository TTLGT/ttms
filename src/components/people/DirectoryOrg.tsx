'use client';

import Link from 'next/link';
import { Building2, Hash, Phone, UserRound, Users } from 'lucide-react';
import { personHref } from '@/lib/directoryProfile';
import { telHref } from '@/lib/phone';
import { buildOrgChart, type OrgGroup } from '@/lib/directoryOrg';
import { UserAvatar } from '@/components/settings/UserAvatar';
import MessagePersonButton from '@/components/chat/MessagePersonButton';
import RoleBadges from '@/components/people/RoleBadges';
import type { DirectoryPerson } from '@/lib/directory';
import type { DirectoryOrgProps } from '@/components/people/directoryView';

/**
 * The directory as the org chart — who reports to whom.
 *
 * The cards are for looking a colleague up and the list is for scanning an
 * office; this one answers the question neither of them can, which is "who do
 * I go to about this team's loads". It is built out of what is already there —
 * every team names a lead, every person names a team — so nothing new is
 * stored and nothing new is asked of anyone. What goes in which group is
 * worked out in lib/directoryOrg.ts; this file only draws it.
 *
 * The chart is one level deep, because the data is: everyone on a team reports
 * to that team's lead, and teams do not nest. Where the lead sits on somebody
 * else's team, that one further step up is shown under their name rather than
 * drawn as another tier — a second tier would suggest a hierarchy that is not
 * recorded anywhere.
 *
 * Contact details are trimmed to the three that place somebody: the extension,
 * the work line and the office. This is the view for finding the right person,
 * not for reading everything about them — the rest of the card is one click
 * away in the other view.
 */

/** No team, and so nobody to report to, as it travels in the URL. */
const UNASSIGNED = 'none';

/**
 * One person in the chart.
 *
 * The lead and their reports are drawn by the same component on purpose: a
 * lead is one of the team rather than a different kind of thing, and the only
 * differences are the size of the photo and the line that says so. Two
 * components would have drifted apart the first time a field was added to one.
 */
function OrgPerson({
  person, siteName, full, lead = false,
}: {
  person: DirectoryPerson;
  siteName: (id: string | null | undefined) => string | null;
  full: boolean;
  lead?: boolean;
}) {
  const site = siteName(person.siteId);

  return (
    <div className="group flex min-w-0 items-center gap-3">
      <UserAvatar
        photoPath={person.photoPath}
        fallback={person.displayName.charAt(0).toUpperCase()}
        muted={person.suspended}
        size={lead ? 40 : 32}
        expandable
        name={person.displayName}
      />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {/* The name opens the person's own page, the same as it does in the
              other two views. The team heading above still filters the chart
              rather than going anywhere — a heading is a place in this list, a
              name is a person. */}
          <Link
            href={personHref(person.email)}
            className={`truncate text-sm text-gray-900 hover:text-brand-700 hover:underline ${lead ? 'font-semibold' : 'font-medium'}`}
          >
            {person.displayName}
          </Link>
          <RoleBadges person={person} size="small" />
          {/* Same rule as the other two views: the state of an account is not
              directory information, and shows only to the two roles whose job
              it is to do something about it. */}
          {full && (person.pending || person.suspended) && (
            <span
              className={`text-[11px] font-medium ${
                person.suspended ? 'text-red-600' : 'text-amber-600'
              }`}
            >
              {person.suspended ? 'Suspended' : 'Not signed in yet'}
            </span>
          )}
          {/* Hidden until the row is hovered, so a column of buttons does not
              compete with the names when reading down a team. */}
          <span className="opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
            <MessagePersonButton uid={person.uid} name={person.displayName} label="" iconSize={13} />
          </span>
        </div>

        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500">
          {person.extension && (
            <span className="inline-flex items-center gap-1">
              <Hash size={11} className="text-gray-400" />
              ext. {person.extension}
            </span>
          )}
          {person.phone && (
            <a
              href={telHref(person.phone, 'US')}
              className="inline-flex items-center gap-1 hover:text-brand-700 hover:underline"
            >
              <Phone size={11} className="text-gray-400" />
              {person.phone}
            </a>
          )}
          {site && (
            <span className="inline-flex items-center gap-1">
              <Building2 size={11} className="text-gray-400" />
              {site}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/** One team, its lead, and everyone under them. */
function OrgTeam({
  group, siteName, full, teamFilter, onFilterTeam,
}: {
  group: OrgGroup;
  siteName: (id: string | null | undefined) => string | null;
  full: boolean;
  teamFilter: string;
  onFilterTeam: (id: string) => void;
}) {
  const { team, lead, leadFiltered, members, leadReportsTo } = group;
  const id     = team?.id ?? UNASSIGNED;
  const active = teamFilter === id;
  // The lead counts as one of the team only when they are actually on screen —
  // otherwise the heading would claim a person the chart is not showing.
  const count  = members.length + (lead && !leadFiltered ? 1 : 0);

  return (
    <section className="rounded-xl border border-gray-200 bg-white">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 bg-gray-50 px-4 py-2.5">
        {/* A button, like the team cell in the list view and for the same
            reason: it changes what is on screen rather than going anywhere,
            and clicking the team already filtered on is the way back out. */}
        <button
          onClick={() => onFilterTeam(id)}
          aria-pressed={active}
          title={active ? 'Showing only this team — click to show everyone' : 'Show only this team'}
          className={`text-sm font-semibold hover:underline ${
            active ? 'text-brand-700' : 'text-gray-900 hover:text-brand-700'
          }`}
        >
          {team ? team.name : 'No team set'}
        </button>
        <span className="text-xs text-gray-500">
          {count} {count === 1 ? 'person' : 'people'}
        </span>
      </header>

      <div className="p-4">
        {team && (
          <div className="mb-3">
            {lead ? (
              <>
                <OrgPerson person={lead} siteName={siteName} full={full} lead />
                {/* Indented to clear the photo, so the label reads as part of
                    the person above it rather than as the start of the list
                    below. */}
                <p className="mt-1 pl-[52px] text-[11px] uppercase tracking-wide text-brand-700">
                  Team lead
                  {/* The lead is resolved against the whole directory, so under
                      a search they can be the one name on screen that does not
                      match what was typed. Saying so beats dropping them, which
                      would make the team read as leaderless when it is not. */}
                  {leadFiltered && (
                    <span className="ml-1.5 normal-case tracking-normal text-gray-400">
                      · outside what you are filtering on
                    </span>
                  )}
                </p>
                {/* The one step further up, when the lead sits on somebody
                    else's team. See the note on OrgGroup for why it stops
                    there. */}
                {leadReportsTo && (
                  <p className="mt-0.5 pl-[52px] text-[11px] text-gray-500">
                    Reports into {leadReportsTo.team.name}
                    {leadReportsTo.lead ? ` — ${leadReportsTo.lead.displayName}` : ''}
                  </p>
                )}
              </>
            ) : (
              /* Not an error. A team is regularly stood up before the person
                 who will run it has been hired, and the fix is in
                 Settings → Teams rather than anywhere on this page. */
              <p className="flex items-center gap-1.5 text-xs text-gray-400">
                <UserRound size={13} />
                No lead named for this team
              </p>
            )}
          </div>
        )}

        {members.length === 0 ? (
          <p className="text-xs text-gray-400">
            {team ? 'Nobody else on this team.' : 'Nobody.'}
          </p>
        ) : (
          /* The rail is what makes this read as a chart rather than as one more
             way of grouping the same cards: one line down from the lead, one
             stub across to each person under them. It is also why the reports
             are a single column — side by side there is nothing for a line to
             connect them to. */
          <ul className={team ? 'ml-5 space-y-2.5 border-l border-gray-200 pl-5' : 'space-y-2.5'}>
            {members.map((p) => (
              <li key={p.email} className="relative">
                {team && (
                  <span className="absolute -left-5 top-4 h-px w-4 bg-gray-200" aria-hidden />
                )}
                <OrgPerson person={p} siteName={siteName} full={full} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export default function DirectoryOrg({
  people, allPeople, teams, siteName, full, teamFilter, onFilterTeam,
}: DirectoryOrgProps) {
  const groups = buildOrgChart(people, allPeople, teams);

  // Only reachable with no teams set up at all: once there is one team,
  // everybody lands either in it or in the "no team set" group, so there is
  // always something to draw. Says what to do about it rather than leaving an
  // empty page that looks broken.
  if (groups.length === 0) {
    return (
      <div className="mt-3 rounded-xl border border-gray-200 bg-white py-16 text-center text-sm text-gray-400">
        <Users size={20} className="mx-auto mb-2 opacity-50" />
        No teams have been set up yet, so there is no reporting line to show.
      </div>
    );
  }

  return (
    /* Two abreast on a wide screen, one on anything narrower. A team is a
       self-contained block here — unlike the list, nothing lines up across
       from one team to the next, so there is nothing to lose by putting two
       side by side. */
    <div className="mt-3 grid items-start gap-3 xl:grid-cols-2">
      {groups.map((g) => (
        <OrgTeam
          key={g.team?.id ?? UNASSIGNED}
          group={g}
          siteName={siteName}
          full={full}
          teamFilter={teamFilter}
          onFilterTeam={onFilterTeam}
        />
      ))}
    </div>
  );
}
