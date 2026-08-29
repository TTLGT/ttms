'use client';

import { useCallback, useState } from 'react';
import { Download, History } from 'lucide-react';
import { listRemovedUsers } from '@/lib/allowedUsers';
import { downloadCsv, toCsv } from '@/lib/csv';
import { PHONE_LABEL, otherPhone } from '@/lib/phone';
import { useDateFormatters } from '@/lib/useDateFormatters';
import { removedUserName, removedUserRoles } from '@/types/removedUser';
import type { RemovedUser } from '@/types/removedUser';
import type { Site } from '@/types/site';
import type { Team } from '@/types/team';
import CollapsibleSection from './CollapsibleSection';

/**
 * The removal log — who was taken off the system, when, and by whom.
 *
 * Collapsed by default and loaded only when opened: an admin visits Settings to
 * manage current access, and this is a record they go looking for rather than
 * one they need in front of them. Leaving it shut also keeps a page that
 * already reads two collections from reading a third on every visit.
 *
 * The folding itself is CollapsibleSection's, which the whole People tab now
 * uses — this panel had the only one of these, and the other two sections were
 * given the same behaviour rather than a second copy of it.
 */

/** `YYYY-MM-DD HH:mm` for the CSV, which Excel parses as a real datetime. */
function csvWhen(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
         `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function RemovedPeoplePanel({
  sites,
  teams,
}: {
  sites: Site[];
  teams: Team[];
}) {
  const { formatCalendarDate, formatDateTime } = useDateFormatters();
  /** `null` when the row predates the field or the write never landed. */
  const formatWhen = (iso: string | null) => formatDateTime(iso, 'date unknown');

  const [users, setUsers]         = useState<RemovedUser[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');

  const siteName = (id: string | null | undefined) =>
    sites.find((s) => s.id === id)?.name ?? null;
  // A team deleted after the person was removed resolves to nothing, which is
  // the honest answer — the archive keeps the id, not a name that may have
  // been renamed since.
  const teamName = (id: string | null | undefined) =>
    teams.find((t) => t.id === id)?.name ?? null;

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await listRemovedUsers();
      setUsers(data.users);
      setTruncated(data.truncated);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the removal log.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetched on first open only; the log does not change while it is on screen
  // unless the admin removes someone, which reloads the page's own list. The
  // section calls this again on every open, so the guard is what makes it once.
  const loadOnce = useCallback(() => {
    if (users === null && !loading) load();
  }, [users, loading, load]);

  function handleExport() {
    if (!users) return;

    const header = [
      'Name', 'Full legal name', 'Email', 'Personal email', PHONE_LABEL.US,
      PHONE_LABEL.GT, PHONE_LABEL.MX, 'Extension', 'Site', 'Team',
      'Date of birth', 'Start date',
      'Roles held',
      'Was suspended', 'Added', 'Added by', 'Last sign-in', 'Removed', 'Removed by',
    ];

    const rows = users.map((u) => {
      const roles = removedUserRoles(u);
      // A column per country, matching the main export — the archive is read
      // back the same way, by a person looking for one number.
      const other = otherPhone(u);
      return [
        removedUserName(u),
        u.legalName ?? '',
        u.email,
        u.personalEmail ?? '',
        u.phone ?? '',
        other.region === 'GT' ? other.value : '',
        other.region === 'MX' ? other.value : '',
        u.extension ?? '',
        siteName(u.siteId) ?? '',
        teamName(u.teamId) ?? '',
        u.dateOfBirth ?? '',
        u.startDate ?? '',
        // Same convention as the main export: Broker is the absence of the
        // others, so it is spelled out rather than left blank.
        roles.length > 0 ? roles.join(', ') : 'Broker',
        u.wasSuspended ? 'Yes' : 'No',
        csvWhen(u.invitedAt),
        u.invitedBy ?? '',
        csvWhen(u.lastLoginAt),
        csvWhen(u.removedAt),
        u.removedBy,
      ];
    });

    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`removed-people-${stamp}.csv`, toCsv([header, ...rows]));
  }

  return (
    <CollapsibleSection
      id="removed-people"
      title="Removed People"
      Icon={History}
      className="mt-6"
      onOpen={loadOnce}
      description={
        <>
          Everyone whose access has been revoked, with the date and the admin who did it.
          Removing someone deletes their entry — this log is the only record that they were
          ever here.
        </>
      }
      /* Only once it has been opened: a count of nothing, or of a log that has
         not been read yet, would be a number nobody could account for. */
      aside={
        users !== null ? (
          <span className="text-sm font-semibold tabular-nums text-gray-600">
            {users.length}
            {truncated && '+'}
          </span>
        ) : null
      }
    >
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <div className="py-12 text-center">
          <p className="text-sm text-gray-500">{error}</p>
          <button
            onClick={load}
            className="mt-3 text-xs font-medium text-brand-700 hover:text-brand-800 underline"
          >
            Try again
          </button>
        </div>
      ) : !users || users.length === 0 ? (
        <div className="py-12 text-center text-sm text-gray-400">
          Nobody has been removed yet.
        </div>
      ) : (
        <>
          <div className="px-6 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
            <p className="text-xs text-gray-500">
              {users.length} removal{users.length === 1 ? '' : 's'}, newest first
              {truncated && (
                <span className="ml-2 text-amber-600">
                  · only the most recent {users.length} are shown
                </span>
              )}
            </p>
            <button
              onClick={handleExport}
              title="Download the removal log as a CSV that opens in Excel"
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition"
            >
              <Download size={13} />
              Export CSV
            </button>
          </div>

          {/* Two entries abreast from lg up. A removal is a short record —
              a name and a date — so a single column left most of the width
              empty and made a long log longer to scroll than it needs to
              be. The separators are drawn per entry rather than with
              divide-y, which only knows about rows: border-t on every
              entry except the two that make up the first row, and a left
              edge on the right-hand column. Below lg it is one column
              again and the same rules draw the same list as before. */}
          <ul className="grid lg:grid-cols-2">
            {users.map((u) => {
              const roles = removedUserRoles(u);
              const name  = removedUserName(u);
              return (
                <li
                  key={u.id}
                  className="px-6 py-4 border-t border-gray-100 first:border-t-0 lg:[&:nth-child(2)]:border-t-0 lg:even:border-l lg:even:border-gray-100"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-700 truncate">{name}</p>
                      {name !== u.email && (
                        <p className="text-xs text-gray-500 truncate">{u.email}</p>
                      )}

                      <p className="text-xs text-gray-500 truncate">
                        {[
                          roles.length > 0 ? roles.join(', ') : 'Broker',
                          siteName(u.siteId),
                          teamName(u.teamId) ? `Team ${teamName(u.teamId)}` : null,
                          u.extension ? `ext. ${u.extension}` : null,
                          u.phone ? `US ${u.phone}` : null,
                          otherPhone(u).value
                            ? `${otherPhone(u).region} ${otherPhone(u).value}`
                            : null,
                        ].filter(Boolean).join(' · ')}
                      </p>

                      {/* Kept because they are what an admin needs if the
                          removal turns out to have been a mistake and the
                          person has to be set up again. */}
                      {(u.personalEmail || u.legalName || u.startDate || u.dateOfBirth) && (
                        <p className="text-xs text-gray-500 truncate">
                          {[
                            u.legalName ? `legally ${u.legalName}` : null,
                            u.personalEmail,
                            u.startDate ? `started ${formatCalendarDate(u.startDate)}` : null,
                            u.dateOfBirth ? `b. ${formatCalendarDate(u.dateOfBirth)}` : null,
                          ].filter(Boolean).join(' · ')}
                        </p>
                      )}

                      <p className="text-[11px] text-gray-400 mt-1">
                        Added {formatWhen(u.invitedAt)}
                        {u.invitedBy ? ` by ${u.invitedBy}` : ''}
                        {u.uid === null && ' · never signed in'}
                      </p>
                    </div>

                    <div className="text-right flex-shrink-0">
                      <p className="text-xs font-medium text-red-600">
                        Removed {formatWhen(u.removedAt)}
                      </p>
                      <p className="text-[11px] text-gray-400 mt-0.5 break-all">
                        by {u.removedBy}
                      </p>
                      {u.wasSuspended && (
                        <p className="text-[11px] text-gray-400 mt-0.5">
                          was suspended first
                        </p>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </CollapsibleSection>
  );
}
