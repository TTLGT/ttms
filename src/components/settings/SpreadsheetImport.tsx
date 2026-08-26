'use client';

import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  AlertCircle, Check, Download, FileText, Minus, Plus, UploadCloud, X,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { ALLOWED_EMAIL_DOMAIN } from '@/lib/accessControl';
import { downloadCsv, toCsv } from '@/lib/csv';
import { TEMPLATE_HEADERS } from '@/lib/userImportColumns';
import type { UserImportAction, UserImportReport, UserImportRow } from '@/lib/userImport';

/**
 * The spreadsheet half of the Add People panel: bulk-import in two steps.
 *
 * The preview step is not optional and not skippable: this writes to the live
 * company directory, so the admin sees every row that would change — and which
 * fields on it — before anything is saved. Uploading a second file, or picking
 * a different one, throws the preview away rather than leaving a stale plan
 * next to a "Save" button.
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

/** Rows worth reading first — the ones that change something or went wrong. */
function isNoteworthy(row: UserImportRow): boolean {
  return row.action !== 'unchanged';
}

export default function SpreadsheetImport({ onImported }: { onImported: () => void }) {
  const { user } = useAuth();
  const [file, setFile]       = useState<File | null>(null);
  const [report, setReport]   = useState<UserImportReport | null>(null);
  const [busy, setBusy]       = useState<'preview' | 'apply' | null>(null);
  const [error, setError]     = useState('');
  const [showAll, setShowAll] = useState(false);

  const onDrop = useCallback((accepted: File[]) => {
    if (accepted.length === 0) return;
    // A new file invalidates the plan on screen — never leave a preview of one
    // file above an Apply button that would run a different one.
    setFile(accepted[0]);
    setReport(null);
    setError('');
    setShowAll(false);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: CSV_ACCEPT, multiple: false,
  });

  async function send(apply: boolean) {
    if (!user || !file) return;

    setBusy(apply ? 'apply' : 'preview');
    setError('');
    try {
      const form = new FormData();
      form.append('file', file);
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
      if (apply) onImported();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The import failed.');
    } finally {
      setBusy(null);
    }
  }

  /**
   * A template with the headers and one filled-in example, because the fastest
   * way to explain an accepted date format is to show one.
   */
  function handleTemplate() {
    const example = [
      `new.person@${ALLOWED_EMAIL_DOMAIN}`, 'Maria', 'Ruiz', 'maria.ruiz@example.com',
      '(555) 123-4567', '+502 5555 5555', '204', 'Houston Office',
      '1990-03-04', '2024-01-15', 'Dispatcher, Finance',
    ];
    downloadCsv('ttms-people-template.csv', toCsv([TEMPLATE_HEADERS, example]));
  }

  const pending  = report && !report.applied ? report.counts.add + report.counts.update : 0;
  const rowsToShow = report
    ? (showAll ? report.rows : report.rows.filter(isNoteworthy))
    : [];
  const hiddenCount = report ? report.rows.length - rowsToShow.length : 0;

  return (
    <div className="px-6 py-4">
      <div className="flex items-start justify-between gap-4 mb-3">
        <p className="text-xs text-gray-500">
          Adds people and fills in their details in one go. Anyone whose email is already on the
          list is <span className="font-medium text-gray-600">updated rather than duplicated</span>,
          so you can export the list, edit it in Excel and upload it back. A blank cell leaves the
          existing value alone — it never erases one — and nobody is suspended or removed by being
          left out of the file.
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
              onClick={() => { setFile(null); setReport(null); setError(''); }}
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
            disabled={!file || busy !== null}
            className="text-sm font-medium px-4 py-2 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            {busy === 'preview' ? 'Checking…' : report ? 'Check again' : 'Check the file'}
          </button>

          {report && !report.applied && pending > 0 && (
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
        </div>
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
                  const style = ACTION_STYLE[row.action];
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
                        </div>
                        <span className={`flex-shrink-0 font-medium ${style.tone}`}>
                          {style.label}
                        </span>
                      </div>
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
