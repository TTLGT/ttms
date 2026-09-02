'use client';

import Link from 'next/link';
import {
  AtSign, Building2, Cake, CalendarDays, IdCard, Mail, MessageSquare, Phone,
  Smartphone, UsersRound,
} from 'lucide-react';
import { personHref } from '@/lib/directoryProfile';
import { otherPhone, telHref } from '@/lib/phone';
import { useDateFormatters } from '@/lib/useDateFormatters';
import { accessStatus, yearsSince } from '@/types/allowedUser';
import { UserAvatar } from '@/components/settings/UserAvatar';
import StatusChip from '@/components/settings/StatusChip';
import Fact from '@/components/people/Fact';
import MessagePersonButton from '@/components/chat/MessagePersonButton';
import RoleBadges from '@/components/people/RoleBadges';
import type { DirectoryViewProps } from '@/components/people/directoryView';
import { useAuth } from '@/context/AuthContext';

/**
 * The directory as full profiles — the recognising view.
 *
 * The same people as the cards beside it, two abreast instead of four, with
 * the photo as a portrait down the side rather than a circle in front of the
 * name. That is the whole of the difference and the whole of the point: a
 * 64px circle crops the top of the head and both shoulders off every picture,
 * which is fine for confirming you have the right Maria and no use at all for
 * putting a face to a name you have only ever seen in an email.
 *
 * Deliberately the same shape as a card on the access list, because it is the
 * same photo at the same size doing the same job, and two layouts for one
 * thing would drift the first time either was touched. It draws the portrait
 * through the same `shape="panel"` avatar and the same StatusChip. What it
 * does **not** borrow is everything on that card that writes — roles are chips
 * here, not buttons, and there are no permissions, no editor and no delete.
 * This is the phone book; Settings → People is the access list.
 *
 * What each person is shown is decided in lib/directory.ts, the same as for
 * the other three views. An ordinary viewer is handed a person with no payroll
 * fields on them at all, so `full` below picks the wording and the status chip
 * rather than doing the hiding.
 */
export default function DirectoryProfiles({
  people, siteName, teamName, full,
}: DirectoryViewProps) {
  // Dates follow the company setting, like every other date in the app.
  const { formatCalendarDate } = useDateFormatters();
  // Three states, same as the cards: a colleague with an account gets the
  // button, somebody who has never signed in gets told why there is none, and
  // your own profile gets neither.
  const { user } = useAuth();

  return (
    /* Two abreast on a wide screen and one on anything narrower. Never three:
       a portrait and a column of facts need the width, and squeezing a third
       in is how this ends up as the card view again with a taller photo. */
    <ul className="mt-3 grid items-start gap-3 xl:grid-cols-2">
      {people.map((p) => {
        const other = otherPhone(p);
        const site  = siteName(p.siteId);
        const team  = teamName(p.teamId);
        // Only worth a line when it is not simply the name again — most
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
            {/* `items-stretch` is what makes the portrait grow to the height of
                the facts beside it, so a person with more on file simply gets a
                taller picture rather than a card with a gap under the photo. */}
            <div className="flex items-stretch gap-4">
              <UserAvatar
                photoPath={p.photoPath}
                fallback={p.displayName.charAt(0).toUpperCase()}
                muted={p.suspended}
                shape="panel"
                size={180}
                expandable
                name={p.displayName}
              />

              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    {/* The name is the way through to the person's own page,
                        the same as it is in the other three views. */}
                    <Link
                      href={personHref(p.email)}
                      className="block truncate text-sm font-medium text-gray-900 hover:text-brand-700 hover:underline"
                    >
                      {p.displayName}
                    </Link>
                    {/* `break-all` because an address is the one thing here
                        that cannot wrap at a space, and cutting it would hide
                        the domain — which is the half that says whether it is
                        the work account. */}
                    <a
                      href={`mailto:${p.email}`}
                      className="block break-all text-xs text-gray-500 hover:text-brand-700 hover:underline"
                    >
                      {p.email}
                    </a>
                  </div>

                  {/* The state of an account is not directory information — it
                      shows only to the two roles whose job it is to do
                      something about it. Everyone else's copy of a person is
                      built from profiles, where the answer would be "active"
                      for all of them anyway. */}
                  {full && (
                    <StatusChip status={accessStatus({ uid: p.uid ?? null, suspended: p.suspended })} />
                  )}
                </div>

                <div className="mt-2">
                  <RoleBadges person={p} />
                </div>

                {/* One fact per line, nothing truncated — see the note on Fact.
                    The order is the access list's, so a reader moving between
                    the two screens finds the same thing in the same place. */}
                <div className="mt-3 grid grid-cols-[14px_1fr] items-start gap-x-2 gap-y-1">
                  {/* Labelled, because a second name under the first is
                      otherwise anybody's guess — a nickname, a previous name,
                      the name of the person who reports to them. */}
                  {legal && (
                    <Fact Icon={IdCard}>
                      <span className="text-gray-400">Legal name</span> {legal}
                    </Fact>
                  )}

                  {/* Labelled by country and dialable, unlike the access
                      list's: this is the view somebody has open when they are
                      about to make the call. */}
                  {(p.phone || p.extension) && (
                    <Fact Icon={Phone}>
                      {p.phone && (
                        <a href={telHref(p.phone, 'US')} className="hover:text-brand-700 hover:underline">
                          US {p.phone}
                        </a>
                      )}
                      {p.phone && p.extension && ' · '}
                      {p.extension && `ext. ${p.extension}`}
                    </Fact>
                  )}

                  {other.value && (
                    <Fact Icon={Smartphone} href={telHref(other.value, other.region)}>
                      {other.region} {other.value}
                    </Fact>
                  )}

                  {/* Marked as the personal one: it is the address to use when
                      the company account is gone, and reaching somebody there
                      by mistake is a different thing from emailing them at
                      work. Loaded for admin and HR alone. */}
                  {full && p.personalEmail && (
                    <Fact Icon={Mail} href={`mailto:${p.personalEmail}`}>
                      <span className="break-all">{p.personalEmail}</span>{' '}
                      <span className="text-gray-400">personal</span>
                    </Fact>
                  )}

                  {site && <Fact Icon={Building2}>{site}</Fact>}

                  {/* Prefixed so a team called "Staff" cannot be read as
                      another office sitting next to the real one. */}
                  {team && <Fact Icon={UsersRound}>Team {team}</Fact>}

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

                {/* Holds the button to the foot of the card when the portrait
                    beside it is the taller of the two — without it the button
                    floats in the middle of a gap. */}
                <div className="flex-1" />

                <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-gray-100 pt-3">
                  {p.uid && p.uid !== user?.uid ? (
                    <MessagePersonButton
                      uid={p.uid}
                      name={p.displayName}
                      label="Message"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-700 transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700 disabled:opacity-50"
                      iconSize={13}
                    />
                  ) : !p.uid ? (
                    /* Chat threads are keyed to the account Google creates at
                       first sign-in, so there is genuinely nobody to open one
                       with yet. Saying so beats leaving a gap where a button
                       goes, which reads as a missing feature. */
                    <p className="inline-flex items-center gap-1.5 text-xs text-gray-400">
                      <MessageSquare size={13} className="opacity-70" />
                      Not on chat yet
                    </p>
                  ) : null}

                  <Link
                    href={personHref(p.email)}
                    className="inline-flex items-center gap-1.5 text-xs text-brand-700 hover:underline"
                  >
                    <AtSign size={13} className="opacity-70" />
                    Open profile
                  </Link>
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
