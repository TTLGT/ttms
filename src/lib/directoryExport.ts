import { otherPhone, PHONE_LABEL } from './phone';
import { toCsv } from './csv';
import { roleLabels } from '@/types/allowedUser';
import type { DirectoryPerson } from './directory';

/**
 * The directory as a file for a spreadsheet. The printed sheet is the other
 * half of the same idea and lives in lib/extensionSheet.ts — it has a shape to
 * decide (grouping, order, columns) and this does not.
 *
 * Both are gated on `directory.export` (admin, HR and dispatch by default),
 * and both are built from the people already on screen: the same filters, the
 * same search, the same order. Exporting something other than what the person
 * is looking at is how a sheet that says "Dallas" ends up with Houston numbers
 * on it.
 *
 * Nothing here reads the database. Everything comes from the list
 * lib/directory.ts already handed the page, which is what keeps the export
 * honest about what the viewer may see: an ordinary broker's copy of a person
 * has no payroll fields on it to write out, so `full` decides the shape of the
 * file rather than guarding its contents. Read the note at the top of
 * lib/directory.ts before treating that flag as a boundary.
 */

// ── The spreadsheet ──────────────────────────────────────────────────────────

/**
 * The columns everyone with the permission gets — the phone book as it is
 * shown on a card, plus the email address to write to.
 */
const BASE_HEADER = [
  'Name', 'Role', 'Extension', PHONE_LABEL.US, 'Office', 'Team', 'Email',
];

/**
 * What admin and HR get on the end of it.
 *
 * The second number and the four payroll fields — the same five things the
 * directory already shows them on screen, in the same file rather than in a
 * second one, so there is one export to think about rather than two.
 *
 * Every one of these is a field lib/directory.ts loads for admin and HR alone.
 * They are absent from anybody else's copy of a person, so the narrow file
 * below is narrow because there is nothing else in the data, not because these
 * columns were left out of it.
 */
const FULL_HEADER = [
  'Other phone', 'Full legal name', 'Personal email',
  'Date of birth', 'Start date', 'Status',
];

/** Invited, suspended or working here, in the words the People screen uses. */
function status(p: DirectoryPerson): string {
  if (p.suspended) return 'Suspended';
  if (p.pending)   return 'Invited, not signed in';
  return 'Active';
}

export function directoryCsv(
  people: DirectoryPerson[],
  opts: {
    siteName: (id: string | null | undefined) => string | null;
    teamName: (id: string | null | undefined) => string | null;
    /** Admin and HR: the six extra columns. */
    full: boolean;
  },
): string {
  const { siteName, teamName, full } = opts;

  const header = full ? [...BASE_HEADER, ...FULL_HEADER] : BASE_HEADER;

  const rows = people.map((p) => {
    const base = [
      p.displayName,
      // Spelled out rather than left blank for a broker — see roleLabels.
      roleLabels(p).join(', '),
      p.extension ?? '',
      p.phone ?? '',
      // By name, not id: a document id in a spreadsheet is a column nobody in
      // the office can read.
      siteName(p.siteId) ?? '',
      teamName(p.teamId) ?? '',
      p.email,
    ];
    if (!full) return base;

    const other = otherPhone(p);
    return [
      ...base,
      other.value,
      p.legalName ?? '',
      p.personalEmail ?? '',
      // Left as YYYY-MM-DD rather than prettified: Excel reads that as a real
      // date, and it is what the People importer takes back without argument.
      p.dateOfBirth ?? '',
      p.startDate ?? '',
      status(p),
    ];
  });

  return toCsv([header, ...rows]);
}

/**
 * What the downloaded file is called.
 *
 * The office or team it was filtered to goes in the name, because these files
 * end up in a downloads folder next to each other and "directory (3).csv"
 * tells nobody which one is the Dallas list. Dated for the same reason: an
 * extension list is only ever right on the day it was taken.
 */
export function directoryCsvFilename(scope: string | null): string {
  const stamp = new Date().toISOString().slice(0, 10);
  const slug  = (scope ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return slug ? `directory-${slug}-${stamp}.csv` : `directory-${stamp}.csv`;
}
