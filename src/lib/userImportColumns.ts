import { headerKey } from './csv';

/**
 * The columns the people-import CSV understands.
 *
 * Split out from `userImport.ts` so the Settings panel can build the
 * downloadable template and list the accepted headers without pulling the
 * Admin SDK into the browser bundle. One definition, two consumers — a column
 * cannot end up in the template and be unreadable by the importer.
 */

export type ColumnKey =
  | 'email' | 'firstName' | 'lastName' | 'legalName' | 'personalEmail'
  | 'phone' | 'phoneGt' | 'extension' | 'site' | 'team'
  | 'dateOfBirth' | 'startDate' | 'roles';

/**
 * `label` is what the template and the CSV export both write, so a file that
 * came out of TTMS goes straight back in. The aliases exist for the files that
 * did not — a list typed up in Excel, or one exported from payroll. All of
 * them are compared through `headerKey`, so casing, spacing and punctuation do
 * not matter.
 */
export const COLUMNS: { key: ColumnKey; label: string; aliases: string[] }[] = [
  { key: 'email',         label: 'Email',           aliases: ['work email', 'company email', 'email address', 'address', 'e mail'] },
  { key: 'firstName',     label: 'First name',      aliases: ['first', 'given name', 'firstname'] },
  { key: 'lastName',      label: 'Last name',       aliases: ['last', 'surname', 'family name', 'lastname'] },
  // Payroll files are where this column usually comes from, hence the aliases.
  // A bare "Full name" is deliberately NOT one of them: in a directory export
  // it means the everyday name, and accepting it here would quietly file
  // "Maria Ruiz" as the payroll name for the whole company.
  { key: 'legalName',     label: 'Full legal name', aliases: ['legal name', 'name on payroll', 'payroll name', 'legal full name', 'name as on id', 'full legal name'] },
  { key: 'personalEmail', label: 'Personal email',  aliases: ['private email', 'personal email address', 'home email'] },
  { key: 'phone',         label: 'Work phone (US)', aliases: ['work phone', 'us phone', 'phone', 'phone us', 'mobile', 'cell'] },
  { key: 'phoneGt',       label: 'Guatemala phone', aliases: ['gt phone', 'phone gt', 'guatemala', 'phone guatemala'] },
  { key: 'extension',     label: 'Extension',       aliases: ['ext', 'desk extension'] },
  { key: 'site',          label: 'Site',            aliases: ['office', 'location'] },
  // Not aliased to "group" — that reads as a work group, which is a different
  // thing entirely (record sharing, not reporting).
  { key: 'team',          label: 'Team',            aliases: ['reports to', 'department', 'reporting team', 'team name'] },
  { key: 'dateOfBirth',   label: 'Date of birth',   aliases: ['dob', 'birthday', 'birth date', 'date of birth dob'] },
  { key: 'startDate',     label: 'Start date',      aliases: ['start', 'started', 'hire date', 'date started', 'start date in the company'] },
  { key: 'roles',         label: 'Roles',           aliases: ['role', 'permissions', 'permission'] },
];

/**
 * Columns the CSV export writes that the import has no business reading back.
 * Recognised only so re-uploading an unedited export does not report four
 * "unknown column" warnings the admin then has to reason about.
 */
export const IGNORED_COLUMNS = [
  'status', 'added', 'added by', 'last sign in', 'last sign-in', 'last login',
];

/** The header row of the downloadable template, in the order it is written. */
export const TEMPLATE_HEADERS = COLUMNS.map((c) => c.label);

export const COLUMN_LABELS =
  Object.fromEntries(COLUMNS.map((c) => [c.key, c.label])) as Record<ColumnKey, string>;

export function matchColumn(header: string): ColumnKey | null {
  const key = headerKey(header);
  if (!key) return null;
  for (const col of COLUMNS) {
    if (key === headerKey(col.label) || col.aliases.includes(key)) return col.key;
  }
  return null;
}
