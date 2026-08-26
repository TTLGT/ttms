'use client';

import { COLUMN_LABELS, type ColumnKey } from '@/lib/userImportColumns';
import {
  PHONE_EXAMPLE,
  normalizePhone,
  phoneHint,
  type PhoneRegion,
} from '@/lib/phone';
import type { ImportProblem } from '@/lib/userImport';
import type { Site } from '@/types/site';
import type { Team } from '@/types/team';

/**
 * Fix one row of an import without going back to Excel.
 *
 * This edits **the file**, not the directory. Every box here writes back into
 * the parsed spreadsheet held by SpreadsheetImport, which then has to be
 * checked again before anything is saved — the preview step is not skippable
 * just because the correction was made on this screen. That is the whole
 * reason this writes cells rather than calling the users API directly: one
 * code path validates an import, and it is the one that runs on the file.
 *
 * Every column the importer understands is offered, not only the broken ones.
 * A row is usually opened because something was wrong with it, but the fields
 * that were simply left blank are the other half of what an admin wants to
 * fill in while they are already looking at the person.
 */

/** The columns, in the order they read on a person rather than in file order. */
const FIELD_ORDER: ColumnKey[] = [
  'email', 'firstName', 'lastName', 'legalName', 'personalEmail',
  'phone', 'phoneGt', 'extension', 'site', 'team',
  'startDate', 'dateOfBirth', 'roles',
];

const PHONE_REGION: Partial<Record<ColumnKey, PhoneRegion>> = {
  phone: 'US',
  phoneGt: 'GT',
};

/**
 * Role words this writes back. The importer re-reads whatever string ends up
 * in the cell and **its** reading is the one that counts — this is only here so
 * the common case is a click instead of remembering the spelling.
 */
const ROLE_WORDS = ['Admin', 'Dispatcher', 'Finance', 'HR'] as const;

/**
 * Which chips to light up for the text currently in the Roles cell.
 *
 * Deliberately forgiving and deliberately not authoritative: a cell the
 * importer would reject lights nothing up, and the next check is what says so.
 */
function readRoles(value: string): Set<string> {
  const held = new Set<string>();
  for (const token of value.toLowerCase().split(/[,;/|+&]|\s+/)) {
    const t = token.trim().replace(/[.]$/, '');
    if (t === 'admin' || t === 'administrator') held.add('Admin');
    else if (t === 'dispatcher' || t === 'dispatch') held.add('Dispatcher');
    else if (t === 'finance' || t === 'accounting') held.add('Finance');
    else if (t === 'hr' || t === 'payroll') held.add('HR');
  }
  return held;
}

const inputClass =
  'mt-1 w-full rounded-lg border px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-400';

/** Amber ring on a box the report complained about, so the eye lands on it. */
function borderFor(problem: string | undefined): string {
  return problem ? 'border-amber-400 bg-amber-50/40' : 'border-gray-300';
}

export default function ImportRowEditor({
  values,
  problems,
  sites,
  teams,
  onChange,
}: {
  /** The row's cells, keyed by column. '' for a column the file does not have. */
  values: Record<ColumnKey, string>;
  problems: ImportProblem[];
  sites: Site[];
  teams: Team[];
  /** Writes one cell back into the file held by the parent. */
  onChange: (key: ColumnKey, value: string) => void;
}) {
  const problemFor = (key: ColumnKey): string | undefined =>
    problems.find((p) => p.column === key)?.message;

  /**
   * Tidy a phone into its stored shape when the box loses focus, exactly as the
   * Add People form does. One that cannot be read is left as typed so it can be
   * corrected — the hint underneath is what says it will not be kept.
   */
  const tidyPhone = (key: ColumnKey, region: PhoneRegion) => () => {
    const { value, rejected } = normalizePhone(values[key], region);
    if (!rejected && value !== values[key]) onChange(key, value);
  };

  const roles = readRoles(values.roles);

  const setRole = (word: string) => () => {
    const next = new Set(roles);
    if (next.has(word)) next.delete(word);
    else next.add(word);
    // "Broker" rather than an empty cell: blank means "leave their roles alone",
    // which is a different instruction from "take every role off them".
    onChange('roles', next.size === 0 ? 'Broker' : ROLE_WORDS.filter((w) => next.has(w)).join(', '));
  };

  return (
    <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {FIELD_ORDER.map((key) => {
          const label   = COLUMN_LABELS[key];
          const problem = problemFor(key);
          const region  = PHONE_REGION[key];

          if (key === 'roles') {
            return (
              <div key={key} className="sm:col-span-2 lg:col-span-3">
                <span className="text-xs text-gray-500">{label}</span>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onChange('roles', 'Broker')}
                    title="The default — their own clients and loads, nothing else"
                    className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                      roles.size === 0 && values.roles.trim()
                        ? 'border-brand-200 bg-brand-50 text-brand-700'
                        : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
                    }`}
                  >
                    Broker
                  </button>
                  {ROLE_WORDS.map((word) => (
                    <button
                      key={word}
                      type="button"
                      onClick={setRole(word)}
                      className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                        roles.has(word)
                          ? 'border-brand-200 bg-brand-50 text-brand-700'
                          : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
                      }`}
                    >
                      {word}
                    </button>
                  ))}
                  {/* Clearing the cell is its own instruction, and not the same
                      as Broker — see the comment in setRole above. */}
                  <button
                    type="button"
                    onClick={() => onChange('roles', '')}
                    className="ml-1 text-[11px] text-gray-400 underline hover:text-gray-600"
                  >
                    leave unchanged
                  </button>
                </div>
                {problem && <p className="mt-1 text-[11px] text-amber-700">{problem}</p>}
              </div>
            );
          }

          if (key === 'site' || key === 'team') {
            const options = key === 'site' ? sites : teams;
            // Matched by name because that is what the importer matches on —
            // storing an id in the cell would produce a file that only works
            // in this browser session.
            const known = options.some((o) => o.name === values[key]);
            return (
              <label key={key} className="text-xs text-gray-500">
                {label}
                <select
                  value={known ? values[key] : ''}
                  onChange={(e) => onChange(key, e.target.value)}
                  className={`${inputClass} ${borderFor(problem)}`}
                >
                  <option value="">Leave unchanged</option>
                  <option value="None">None — clear it</option>
                  {options.map((o) => (
                    <option key={o.id} value={o.name}>{o.name}</option>
                  ))}
                </select>
                {problem && <p className="mt-1 text-[11px] text-amber-700">{problem}</p>}
              </label>
            );
          }

          if (key === 'dateOfBirth' || key === 'startDate') {
            // A date box can only hold YYYY-MM-DD, so a cell the importer could
            // not read shows empty here. That is the point: the box cannot
            // produce another unreadable date, and the message under it still
            // quotes what the file said.
            const iso = /^\d{4}-\d{2}-\d{2}$/.test(values[key]) ? values[key] : '';
            return (
              <label key={key} className="text-xs text-gray-500">
                {label}
                <input
                  type="date"
                  value={iso}
                  onChange={(e) => onChange(key, e.target.value)}
                  className={`${inputClass} ${borderFor(problem)}`}
                />
                {problem && <p className="mt-1 text-[11px] text-amber-700">{problem}</p>}
              </label>
            );
          }

          const hint = region ? phoneHint(values[key], region) : '';

          return (
            <label key={key} className="text-xs text-gray-500">
              {label}
              <input
                value={values[key]}
                onChange={(e) => onChange(key, e.target.value)}
                onBlur={region ? tidyPhone(key, region) : undefined}
                placeholder={region ? PHONE_EXAMPLE[region] : undefined}
                spellCheck={false}
                className={`${inputClass} ${borderFor(problem)}`}
              />
              {(problem || hint) && (
                <span className="mt-1 block text-[11px] text-amber-700">{problem || hint}</span>
              )}
            </label>
          );
        })}
      </div>

      <p className="mt-3 text-[11px] text-gray-400">
        This edits the spreadsheet, not the directory — check the file again to see what your
        changes would do, then apply.
      </p>
    </div>
  );
}
