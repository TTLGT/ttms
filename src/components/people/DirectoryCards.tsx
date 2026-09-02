'use client';

import {
  AtSign, Building2, CalendarDays, Cake, Hash, Mail, MessageSquare, Phone, Smartphone, UsersRound,
} from 'lucide-react';
import { otherPhone, telHref } from '@/lib/phone';
import { useDateFormatters } from '@/lib/useDateFormatters';
import { yearsSince } from '@/types/allowedUser';
import { UserAvatar } from '@/components/settings/UserAvatar';
import Fact from '@/components/people/Fact';
import MessagePersonButton from '@/components/chat/MessagePersonButton';
import RoleBadges from '@/components/people/RoleBadges';
import type { DirectoryViewProps } from '@/components/people/directoryView';
import { useAuth } from '@/context/AuthContext';

/**
 * The directory as cards — the browsing view.
 *
 * Three abreast on a wide screen, small and fixed in shape, because this is
 * the view for looking someone up when you are not sure of the spelling: the
 * photo is the fastest way to recognise a colleague, and nothing here
 * truncates. The list view beside it is the one for scanning a whole office at
 * once.
 */
export default function DirectoryCards({
  people, siteName, teamName, full,
}: DirectoryViewProps) {
  // Dates follow the company setting, like every other date in the app.
  const { formatCalendarDate } = useDateFormatters();
  // Three states, and the card has to tell them apart: a colleague with an
  // account gets the button, somebody invited who has never signed in gets told
  // why there is no button, and your own card gets neither. Decided here rather
  // than left to the button, which can only render or not render — and "no
  // button" was being read as "the feature is missing", because most of this
  // company has not signed in yet and almost every card was blank.
  const { user } = useAuth();

  return (
    <ul className="mt-3 grid items-start gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {people.map((p) => {
        const other = otherPhone(p);
        const site  = siteName(p.siteId);
        const team  = teamName(p.teamId);
        // Only worth showing when it is not simply the name again — most
        // people's legal name is what everyone already calls them.
        const legal =
          full && p.legalName && p.legalName.trim() !== p.displayName
            ? p.legalName.trim()
            : '';
        const years = full ? yearsSince(p.startDate) : null;

        return (
          <li
            key={p.email}
            className={`rounded-xl border p-4 ${
              p.suspended ? 'border-red-200 bg-red-50/50' : 'border-gray-200 bg-white'
            }`}
          >
            <div className="flex items-start gap-3">
              <UserAvatar
                photoPath={p.photoPath}
                fallback={p.displayName.charAt(0).toUpperCase()}
                muted={p.suspended}
                size={64}
                expandable
                name={p.displayName}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900">
                  {p.displayName}
                </p>
                {/* The name on the paperwork, under the name people use, for
                    the admins and HR who have to copy it onto a form. */}
                {legal && (
                  <p className="truncate text-[11px] text-gray-500">{legal}</p>
                )}
                {/* What they do, under who they are and above how to reach
                    them — which is the order the question is usually asked in:
                    somebody looking for "the dispatcher" is looking for a
                    person before they are looking for a number. */}
                <div className="mt-1">
                  <RoleBadges person={p} />
                </div>

                {/* The status of an account is not directory information — it
                    only appears for the two roles whose job it is to do
                    something about it. */}
                {full && (p.pending || p.suspended) && (
                  <p
                    className={`text-[11px] font-medium ${
                      p.suspended ? 'text-red-600' : 'text-amber-600'
                    }`}
                  >
                    {p.suspended ? 'Suspended' : 'Not signed in yet'}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-3 grid grid-cols-[14px_1fr] items-start gap-x-2 gap-y-1">
              <Fact Icon={AtSign} href={`mailto:${p.email}`}>{p.email}</Fact>

              {/* Dialable, because half the reason to open a directory is to
                  call the person in it. */}
              {p.phone && (
                <Fact Icon={Phone} href={telHref(p.phone, 'US')}>{p.phone}</Fact>
              )}

              {p.extension && <Fact Icon={Hash}>ext. {p.extension}</Fact>}

              {other.value && (
                <Fact Icon={Smartphone} href={telHref(other.value, other.region)}>
                  {other.region} {other.value}
                </Fact>
              )}

              {site && <Fact Icon={Building2}>{site}</Fact>}

              {/* Prefixed so a team called "Staff" cannot be read as another
                  office sitting next to the real one. */}
              {team && <Fact Icon={UsersRound}>Team {team}</Fact>}

              {/* The admin and HR half of the card. These four are loaded only
                  for those two roles — see the note at the top of
                  lib/directory.ts — so for everyone else there is nothing here
                  to draw, and `full` decides the wording rather than the
                  secrecy. */}
              {full && p.personalEmail && (
                <Fact Icon={Mail} href={`mailto:${p.personalEmail}`}>
                  {p.personalEmail} (personal)
                </Fact>
              )}

              {/* Start date carries the years with it: "how long has this
                  person been here" is the question it actually gets asked,
                  and it is the same phrasing Settings → People uses. */}
              {full && formatCalendarDate(p.startDate) && (
                <Fact Icon={CalendarDays}>
                  Started {formatCalendarDate(p.startDate)}
                  {years !== null && years >= 1 && ` · ${years} year${years === 1 ? '' : 's'}`}
                </Fact>
              )}

              {full && formatCalendarDate(p.dateOfBirth) && (
                <Fact Icon={Cake}>Born {formatCalendarDate(p.dateOfBirth)}</Fact>
              )}
            </div>

            {/* The in-house way to reach them, under the contact details rather
                than among them: this is the one thing on the card you *do*
                rather than read, and it was being scanned straight past while
                it sat in the grid looking like another address. */}
            {p.uid && p.uid !== user?.uid ? (
              <MessagePersonButton
                uid={p.uid}
                name={p.displayName}
                label="Message"
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-700 transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700 disabled:opacity-50"
                iconSize={13}
              />
            ) : !p.uid ? (
              /* Chat threads are keyed to the account Google creates at first
                 sign-in, so there is genuinely nobody to open one with yet.
                 Saying so beats leaving a gap: most of the company is in this
                 state today, and a blank space where the button goes reads as
                 a missing feature rather than a waiting invite.

                 Only ever drawn in the admin and HR view — everyone else's
                 directory is built from profiles, which exist only for people
                 who have signed in. */
              <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-gray-400">
                <MessageSquare size={13} className="opacity-70" />
                Not on chat yet
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
