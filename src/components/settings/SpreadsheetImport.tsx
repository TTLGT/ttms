'use client';

import { useCallback, useMemo, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  AlertCircle, Check, Download, FileText, Minus, Pencil, Plus, UploadCloud, X,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { ALLOWED_EMAIL_DOMAIN } from '@/lib/accessControl';
import { downloadCsv, parseCsv, toCsv, unescapeCell } from '@/lib/csv';
import {
  COLUMN_LABELS,
  TEMPLATE_HEADERS,
  matchColumn,
  type ColumnKey,
} from '@/lib/userImportColumns';
import { PHONE_EXAMPLE } from '@/lib/phone';
import type { UserImportAction, UserImportReport, UserImportRow } from '@/lib/userImport';
import type { Site } from '@/types/site';
import type { Team } from '@/types/team';
import ImportRowEditor from './ImportRowEditor';

/**
 * The spreadsheet half of the Add People panel: bulk-import in two steps.
 *
 * The preview step is not optional and not skippable: this writes to the live
 * company directory, so the admin sees every row that would change — and which
 * fields on it — before anything is saved. Uploading a second file, or picking
 * a different one, throws the preview away rather than leaving a stale plan
 * next to a "Save" button.
 *
 * **The file is parsed here as well as on the server**, which is what lets a
 * bad row be fixed on this screen instead of back in Excel. The grid below is
 * the working copy: the row editor writes cells into it, and what gets sent for
 * checking and applying is rebuilt from it. The server re-reads and re-plans
 * that file from scratch every time, so an edit made here is worth exactly as
 * much as the same edit made in Excel — no more, and nothing routes around the
 * preview. Editing therefore *invalidates* the plan on screen and the Apply
 * button goes away until it has been checked again.
 *
 * Rendered inside AddPeoplePanel's section rather than carrying its own, so
 * there is one place in Settings that adds people and two ways to do it.
 */

const CSV_ACCEPT = { 'text/csv': ['.csv'] };

/** How each outcome reads and looks. Ordered worst-first in the summary. */
const ACTION_STYLE: Record<UserImportAction, { label: string; tone: string; dot: string }> = {
  add:            { label: 'New',       tone: 'text-green-700',  dot: 'bg-green-500' },
  update:         { label: 'Updated',   tone: 'text-brand-700',  dot: 'bg-brand-500' },
  unchanged:      { label: 'No change', tone: 'text-gray-400',   dot: 'bg-gray-300' },
  invalid:        { label: 'Skipped',   tone: 'text-amber-700',  dot: 'bg-amber-500' },
  'wrong-domain': { label: 'Skipped',   tone: 'text-amber-700',  dot: 'bg-amber-500' },
  duplicate:      { label: 'Skipped',   tone: 'text-amber-700',  dot: 'bg-amber-500' },
  error:          { label: 'Failed',    tone: 'text-red-600',    dot: 'bg-red-500' },
};

/** Every column the editor offers, whether or not the file has one for it. */
const ALL_COLUMNS = Object.keys(COLUMN_LABELS) as ColumnKey[];

/**
 * Rows worth reading first — the ones that change something or went wrong.
 *
 * A message counts even on a row that changes nothing: a file whose only fault
 * is an unreadable phone number produces exactly that row, and folding it away
 * under "rows that change nothing" would hide the one thing to act on.
 */
function isNoteworthy(row: UserImportRow): boolean {
  return row.action !== 'unchanged' || row.message !== '';
}

/**
 * Where a column sits in the header, or -1.
 *
 * First match wins, which is the same rule the importer uses — a file with two
 * "Phone" columns must be read the same way on both sides, or this would edit
 * a cell the server is not reading.
 */
function headerIndex(header: string[], key: ColumnKey): number {
  for (let i = 0; i < header.length; i++) {
    if (matchColumn(header[i]) === key) return i;
  }
  return -1;
}

export default function SpreadsheetImport({
  sites,
  teams,
  onImported,
}: {
  sites: Site[];
  teams: Team[];
  onImported: () => void;
}) {
  const { user } = useAuth();
  const [file, setFile]       = useState<File | null>(null);
  /** The working copy of the file. Row 0 is the header. */
  const [grid, setGrid]       = useState<string[][] | null>(null);
  const [report, setReport]   = useState<UserImportReport | null>(null);
  const [busy, setBusy]       = useState<'preview' | 'apply' | null>(null);
  const [error, setError]     = useState('');
  const [showAll, setShowAll] = useState(false);
  /** Line number of the row open in the editor, if any. */
  const [openLine, setOpenLine] = useState<number | null>(null);
  /** Lines edited since the last check — what makes the plan on screen stale. */
  const [editedLines, setEditedLines] = useState<Set<number>>(new Set());

  const onDrop = useCallback(async (accepted: File[]) => {
    if (accepted.length === 0) return;

    const picked = accepted[0];
    // A new file invalidates the plan on screen — never leave a preview of one
    // file above an Apply button that would run a different one.
    setFile(picked);
    setReport(null);
    setError('');
    setShowAll(false);
    setOpenLine(null);
    setEditedLines(new Set());

    try {
      setGrid(parseCsv(await picked.text()));
    } catch {
      setGrid(null);
      setError('That file could not be read as a CSV.');
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: CSV_ACCEPT, multiple: false,
  });

  const dirty = editedLines.size > 0;

  async function send(apply: boolean) {
    if (!user || !grid || !file) return;
    // The Apply button is hidden while there are unchecked edits; this is the
    // same rule enforced where it cannot be clicked around.
    if (apply && dirty) return;

    setBusy(apply ? 'apply' : 'preview');
    setError('');
    try {
      const form = new FormData();
      // Rebuilt from the working copy, so a row fixed on this screen is what
      // gets read. Identical to the original file when nothing was edited.
      form.append('file', new File([toCsv(grid)], file.name, { type: 'text/csv' }));
      if (apply) form.append('apply', 'true');

      const idToken = await user.getIdToken();
      const res = await fetch('/api/admin/users/import', {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}` },
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'The import failed.');

      setReport(data.report as UserImportReport);
      // The plan on screen now matches the working copy again.
      setEditedLines(new Set());
      if (apply) {
        setOpenLine(null);
        onImported();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The import failed.');
    } finally {
      setBusy(null);
    }
  }

  /** The cells of one row, keyed by column, for the editor. */
  const rowValues = useCallback(
    (line: number): Record<ColumnKey, string> => {
      const header = grid?.[0] ?? [];
      const row    = grid?.[line - 1] ?? [];
      return Object.fromEntries(
        ALL_COLUMNS.map((key) => {
          const index = headerIndex(header, key);
          // unescapeCell for the same reason the importer calls it: our own
          // export writes a leading apostrophe in front of anything Excel would
          // treat as a formula, and a phone number trips that every time.
          return [key, index === -1 ? '' : unescapeCell(row[index] ?? '')];
        }),
      ) as Record<ColumnKey, string>;
    },
    [grid],
  );

  /**
   * Write one cell back into the working copy.
   *
   * A column the file does not have is appended to the header first, so a field
   * that was blank because the spreadsheet had no column for it can still be
   * filled in — "left blank" and "never asked for" should not be different
   * kinds of unfixable here.
   */
  const setCell = useCallback((line: number, key: ColumnKey, value: string) => {
    setGrid((prev) => {
      if (!prev) return prev;

      const next = prev.map((row) => [...row]);
      let index = headerIndex(next[0], key);
      if (index === -1) {
        index = next[0].length;
        next[0].push(COLUMN_LABELS[key]);
      }

      const row = next[line - 1];
      // Short rows are legal CSV — pad out to the column being written.
      while (row.length <= index) row.push('');
      row[index] = value;
      return next;
    });

    setEditedLines((prev) => new Set(prev).add(line));
  }, []);

  /**
   * A template with the headers and one filled-in example, because the fastest
   * way to explain an accepted date format is to show one.
   */
  function handleTemplate() {
    // The legal name in the example differs from first + last on purpose: that
    // is the whole reason the column exists, and an example that repeated
    // "Maria Ruiz" would teach the opposite.
    //
    // The phones are written in the shape they are stored in, because that is
    // what an export of the list looks like. Anything the right length is
    // accepted and rewritten to match — see lib/phone.ts.
    //
    // The Mexico cell is deliberately empty. A person has one home-country
    // number, and a row that fills both country columns is refused — so the
    // example has to show one filled and the other blank, or it would teach
    // exactly the shape the importer turns down.
    const example = [
      `new.person@${ALLOWED_EMAIL_DOMAIN}`, 'Maria', 'Ruiz',
      'Maria del Carmen Ruiz Gómez', 'maria.ruiz@example.com',
      PHONE_EXAMPLE.US, PHONE_EXAMPLE.GT, '', '204', 'Houston Office', 'Top Brokers',
      '1990-03-04', '2024-01-15', 'Dispatcher, Finance',
    ];
    downloadCsv('ttms-people-template.csv', toCsv([TEMPLATE_HEADERS, example]));
  }

  /** The working copy, so corrections made here can go back to whoever owns the file. */
  function handleDownloadEdited() {
    if (!grid || !file) return;
    downloadCsv(`corrected-${file.name}`, toCsv(grid));
  }

  const pending = report && !report.applied ? report.counts.add + report.counts.update : 0;
  const rowsToShow = useMemo(
    () => (report ? (showAll ? report.rows : report.rows.filter(isNoteworthy)) : []),
    [report, showAll],
  );
  const hiddenCount = report ? report.rows.length - rowsToShow.length : 0;

  return (
    <div className="px-6 py-4">
      <div className="flex items-start justify-between gap-4 mb-3">
        <p className="text-xs text-gray-500">
          Adds people and fills in their details in one go. Anyone whose email is already on the
          list is <span className="font-medium text-gray-600">updated rather than duplicated</span>,
          so you can export the list, edit it in Excel and upload it back. A blank cell leaves the
          existing value alone — it never erases one — and nobody is suspended or removed by being
          left out of the file. Phone numbers are rewritten to{' '}
          <span className="font-medium text-gray-600">{PHONE_EXAMPLE.US}</span> and{' '}
          <span className="font-medium text-gray-600">{PHONE_EXAMPLE.GT}</span>; one that is not
          the right length is left out and listed below.
        </p>
        <button
          type="button"
          onClick={handleTemplate}
          title="Download a CSV with the column headings and one example row"
          className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition flex-shrink-0"
        >
          <Download size={13} />
          Template
        </button>
      </div>

      <div>
        <div
          {...getRootProps()}
          className={`rounded-lg border-2 border-dashed px-4 py-6 text-center cursor-pointer transition ${
            isDragActive ? 'border-brand-400 bg-brand-50' : 'border-gray-200 hover:border-gray-300'
          }`}
        >
          <input {...getInputProps()} />
          <UploadCloud size={20} className="mx-auto text-gray-400 mb-1" />
          <p className="text-xs text-gray-500">
            {isDragActive ? 'Drop the CSV here…' : 'Drag & drop a CSV, or click to browse'}
          </p>
        </div>

        {file && (
          <div className="mt-2 flex items-center justify-between text-xs bg-gray-50 border border-gray-100 rounded-lg px-3 py-1.5">
            <span className="flex items-center gap-1.5 text-gray-600 truncate">
              <FileText size={12} className="shrink-0" />
              <span className="truncate">{file.name}</span>
            </span>
            <button
              type="button"
              onClick={() => {
                setFile(null);
                setGrid(null);
                setReport(null);
                setError('');
                setOpenLine(null);
                setEditedLines(new Set());
              }}
              className="text-gray-400 hover:text-red-500 shrink-0 ml-2"
              title="Remove this file"
            >
              <X size={12} />
            </button>
          </div>
        )}

        {error && (
          <div className="mt-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-600">
            {error}
          </div>
        )}

        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => send(false)}
            disabled={!grid || busy !== null}
            className={`text-sm font-medium px-4 py-2 rounded-lg border disabled:opacity-40 disabled:cursor-not-allowed transition ${
              dirty
                ? 'border-brand-700 bg-brand-700 text-white hover:bg-brand-800'
                : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            {busy === 'preview' ? 'Checking…' : report ? 'Check again' : 'Check the file'}
          </button>

          {/* Hidden rather than disabled while there are unchecked edits: an
              Apply button next to a plan that no longer describes the file is
              the one thing this panel must never offer. */}
          {report && !report.applied && pending > 0 && !dirty && (
            <button
              type="button"
              onClick={() => send(true)}
              disabled={busy !== null}
              className="text-sm font-medium px-4 py-2 rounded-lg bg-brand-700 text-white hover:bg-brand-800 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              {busy === 'apply'
                ? 'Saving…'
                : `Apply ${pending} change${pending === 1 ? '' : 's'}`}
            </button>
          )}

          {grid && editedLines.size > 0 && (
            <button
              type="button"
              onClick={handleDownloadEdited}
              title="Download the spreadsheet with your corrections in it"
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition"
            >
              <Download size={13} />
              Download corrected file
            </button>
          )}
        </div>

        {dirty && (
          <div className="mt-3 rounded-lg bg-brand-50 border border-brand-200 px-3 py-2 text-xs text-brand-800">
            You changed {editedLines.size} row{editedLines.size === 1 ? '' : 's'}. Check the file
            again to see what they would do — nothing can be applied until you do.
          </div>
        )}
      </div>

      {report && (
        <div className="mt-4">
          <div
            className={`rounded-lg border px-3 py-2.5 text-xs ${
              report.applied
                ? 'border-green-200 bg-green-50 text-green-800'
                : 'border-gray-200 bg-gray-50 text-gray-700'
            }`}
          >
            <p className="font-medium flex items-center gap-1.5">
              {report.applied ? <Check size={13} /> : <AlertCircle size={13} />}
              {report.applied
                ? `Saved — ${report.counts.add} added, ${report.counts.update} updated.`
                : pending === 0
                ? 'Nothing to save — every row in this file already matches the list.'
                : `Ready to save: ${report.counts.add} new, ${report.counts.update} updated.`}
            </p>
            <p className="mt-1 text-[11px] opacity-80">
              {report.counts.unchanged} unchanged · {report.counts.rejected} skipped ·{' '}
              {report.rows.length} row{report.rows.length === 1 ? '' : 's'} read
            </p>
            {/* Its own line, and amber inside an otherwise green box: these
                rows were saved, so this is the one thing left to go back and
                fix. The row it happened on is named in the list below. */}
            {report.counts.phonesSkipped > 0 && (
              <p className="mt-1 text-[11px] text-amber-700">
                {report.counts.phonesSkipped} phone number
                {report.counts.phonesSkipped === 1 ? ' was' : 's were'} not the right length and{' '}
                {report.applied ? 'was' : 'will be'} left out — the rest of{' '}
                {report.counts.phonesSkipped === 1 ? 'that row' : 'those rows'}{' '}
                {report.applied ? 'saved' : 'saves'} normally.
              </p>
            )}
            {(report.counts.rejected > 0 || report.counts.phonesSkipped > 0) && (
              <p className="mt-1 text-[11px] opacity-80">
                Anything that went wrong can be fixed here — click{' '}
                <span className="font-medium">Fix</span> on the row.
              </p>
            )}
            {report.matchedColumns.length > 0 && (
              <p className="mt-1 text-[11px] opacity-80">
                Columns read: {report.matchedColumns.join(', ')}
              </p>
            )}
            {report.unknownColumns.length > 0 && (
              <p className="mt-1 text-[11px] text-amber-700">
                Ignored — not a column this understands: {report.unknownColumns.join(', ')}
              </p>
            )}
          </div>

          {report.rows.length > 0 && (
            <>
              <ul className="mt-3 divide-y divide-gray-100 border border-gray-100 rounded-lg overflow-hidden">
                {rowsToShow.map((row) => {
                  const style   = ACTION_STYLE[row.action];
                  const open    = openLine === row.line;
                  const stale   = editedLines.has(row.line);
                  const broken  = row.problems.length > 0;

                  return (
                    <li key={`${row.line}-${row.email}`} className="px-3 py-2 text-xs bg-white">
                      <div className="flex items-start gap-2">
                        <span className={`mt-1.5 h-1.5 w-1.5 rounded-full flex-shrink-0 ${style.dot}`} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-2 flex-wrap">
                            <span className="font-medium text-gray-800">
                              {row.name || row.email}
                            </span>
                            {row.name && (
                              <span className="font-mono text-gray-400 truncate">{row.email}</span>
                            )}
                            {/* The line number is what the admin needs to find
                                the row again in Excel. */}
                            <span className="text-gray-300">line {row.line}</span>
                          </div>
                          {row.changes.length > 0 && (
                            <p className="text-gray-500 mt-0.5">
                              {report.applied ? 'Set' : 'Will set'}: {row.changes.join(', ')}
                            </p>
                          )}
                          {row.message && (
                            <p className="text-amber-700 mt-0.5">{row.message}</p>
                          )}
                          {stale && (
                            <p className="text-brand-700 mt-0.5 font-medium">
                              Edited — check the file again to see what this does now.
                            </p>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => setOpenLine(open ? null : row.line)}
                          className={`flex items-center gap-1 flex-shrink-0 rounded-lg border px-2 py-1 font-medium transition ${
                            broken
                              ? 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100'
                              : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
                          }`}
                        >
                          <Pencil size={11} />
                          {open ? 'Close' : broken ? 'Fix' : 'Edit'}
                        </button>

                        <span className={`flex-shrink-0 font-medium ${style.tone}`}>
                          {style.label}
                        </span>
                      </div>

                      {open && (
                        <ImportRowEditor
                          values={rowValues(row.line)}
                          problems={row.problems}
                          sites={sites}
                          teams={teams}
                          onChange={(key, value) => setCell(row.line, key, value)}
                        />
                      )}
                    </li>
                  );
                })}
              </ul>

              {(hiddenCount > 0 || showAll) && (
                <button
                  type="button"
                  onClick={() => setShowAll((v) => !v)}
                  className="mt-2 flex items-center gap-1 text-xs font-medium text-brand-700 hover:text-brand-800"
                >
                  {showAll ? <Minus size={12} /> : <Plus size={12} />}
                  {showAll
                    ? 'Hide the rows that change nothing'
                    : `Show ${hiddenCount} row${hiddenCount === 1 ? '' : 's'} that change nothing`}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
