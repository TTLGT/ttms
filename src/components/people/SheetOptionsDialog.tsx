'use client';

import { useEffect, useMemo, useState } from 'react';
import { Printer, X } from 'lucide-react';
import {
  estimatePages, loadSheetOptions, saveSheetOptions, sheetGroups,
  type SheetGroupBy, type SheetOptions, type SheetOrder,
} from '@/lib/extensionSheet';
import type { DirectoryPerson } from '@/lib/directory';

/**
 * How the extension sheet should come out, asked before the print dialog.
 *
 * The sheet started as one fixed shape — by team, in name order — and that is
 * still what opens here, because it is the right answer most of the time. What
 * this adds is the two or three questions people actually had about it: put
 * them all on one list instead, order them by extension number rather than by
 * name, and stop starting a new page for every four-person team.
 *
 * It is a dialog rather than controls on the page for one reason: these
 * settings change nothing anybody can see until paper comes out of a printer.
 * Controls sitting permanently on the Directory would look like they were
 * filtering the page.
 *
 * The choice is remembered per browser (see loadSheetOptions), so the person
 * who prints the same sheet every month sets it up once. The summary line at
 * the bottom says what will happen in plain words, and roughly how many pages
 * it comes to — the mistake worth catching is "one team to a page" left on
 * while printing the whole company.
 */

interface Props {
  /** Exactly the people on screen: what the sheet will be built from. */
  people: DirectoryPerson[];
  siteName: (id: string | null | undefined) => string | null;
  teamName: (id: string | null | undefined) => string | null;
  onCancel: () => void;
  /** Print with these. The page hands them straight to ExtensionSheet. */
  onPrint: (options: SheetOptions) => void;
}

const GROUP_CHOICES: { value: SheetGroupBy; label: string; detail: string }[] = [
  { value: 'team', label: 'By team',   detail: 'A heading per team, the way the org chart reads.' },
  { value: 'site', label: 'By office', detail: 'A heading per office, for a sheet by the phones.' },
  { value: 'none', label: 'One list',  detail: 'Everybody together, no headings.' },
];

const ORDER_CHOICES: { value: SheetOrder; label: string; detail: string }[] = [
  { value: 'name',      label: 'By name',      detail: 'A–Z, the way you look somebody up.' },
  { value: 'extension', label: 'By extension', detail: 'Lowest first. People with none go last.' },
];

/** The four columns beside name, extension and work phone. */
type ColumnKey = 'showRole' | 'showOffice' | 'showTeam' | 'showEmail';

const COLUMN_CHOICES: { key: ColumnKey; label: string }[] = [
  { key: 'showRole',   label: 'Role' },
  { key: 'showOffice', label: 'Office' },
  { key: 'showTeam',   label: 'Team' },
  { key: 'showEmail',  label: 'Email' },
];

export default function SheetOptionsDialog({
  people, siteName, teamName, onCancel, onPrint,
}: Props) {
  /**
   * Opens on whatever this browser printed last.
   *
   * Read straight into state rather than in an effect, which is safe only
   * because this dialog is never server-rendered: it is mounted by a click,
   * so there is no first render to disagree with. Anything on the Directory
   * page itself has to read storage in an effect instead — see
   * useDateFormatters for that shape.
   */
  const [options, setOptions] = useState<SheetOptions>(loadSheetOptions);

  const set = <K extends keyof SheetOptions>(key: K, value: SheetOptions[K]) =>
    setOptions((prev) => ({ ...prev, [key]: value }));

  // Escape closes it, the way every other dialog in the app behaves.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const groups = useMemo(
    () => sheetGroups(people, options, { siteName, teamName }),
    // siteName/teamName are read fresh each render from the page's lists; the
    // grouping only has to be recomputed when the people or the shape change.
    [people, options, siteName, teamName],
  );
  const pages = estimatePages(groups, options);

  /**
   * A column that repeats its own heading is dropped by the sheet — see the
   * note there. Saying so here stops the box looking broken when ticking it
   * changes nothing on the paper.
   */
  const redundant = (key: ColumnKey): boolean =>
    (key === 'showTeam'   && options.groupBy === 'team') ||
    (key === 'showOffice' && options.groupBy === 'site');

  const offices = new Set(people.map((p) => p.siteId ?? ''));

  function print() {
    saveSheetOptions(options);
    onPrint(options);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-full w-full max-w-lg flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
        <div className="flex flex-shrink-0 items-start justify-between border-b border-gray-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Print extension sheet</h2>
            <p className="mt-1 text-xs text-gray-500">
              {people.length} {people.length === 1 ? 'person' : 'people'}, as they are
              filtered on the page behind this.
            </p>
          </div>
          <button type="button" onClick={onCancel} title="Close" className="text-gray-400 hover:text-gray-700">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <fieldset>
            <legend className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              Group them
            </legend>
            <div className="mt-2 space-y-1.5">
              {GROUP_CHOICES.map(({ value, label, detail }) => (
                <label
                  key={value}
                  className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 transition ${
                    options.groupBy === value
                      ? 'border-brand-200 bg-brand-50'
                      : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="groupBy"
                    checked={options.groupBy === value}
                    onChange={() => set('groupBy', value)}
                    className="mt-0.5 accent-brand-500"
                  />
                  <span>
                    <span className="block text-sm font-medium text-gray-900">{label}</span>
                    <span className="block text-xs text-gray-500">{detail}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="mt-5">
            <legend className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              Order them
            </legend>
            <div className="mt-2 space-y-1.5">
              {ORDER_CHOICES.map(({ value, label, detail }) => (
                <label
                  key={value}
                  className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 transition ${
                    options.order === value
                      ? 'border-brand-200 bg-brand-50'
                      : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="order"
                    checked={options.order === value}
                    onChange={() => set('order', value)}
                    className="mt-0.5 accent-brand-500"
                  />
                  <span>
                    <span className="block text-sm font-medium text-gray-900">{label}</span>
                    <span className="block text-xs text-gray-500">{detail}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="mt-5">
            <legend className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              Extra columns
            </legend>
            <p className="mt-1 text-xs text-gray-500">
              The name, the extension and the work number are always on it.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {COLUMN_CHOICES.map(({ key, label }) => {
                const off = redundant(key);
                return (
                  <label
                    key={key}
                    title={off ? 'Already the heading on this sheet' : undefined}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition ${
                      off
                        ? 'cursor-not-allowed border-gray-200 text-gray-300'
                        : options[key]
                          ? 'cursor-pointer border-brand-200 bg-brand-50 font-medium text-brand-700'
                          : 'cursor-pointer border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      disabled={off}
                      checked={!off && options[key] === true}
                      onChange={(e) => set(key, e.target.checked)}
                      className="accent-brand-500"
                    />
                    {label}
                  </label>
                );
              })}
            </div>
            {/* Worth saying once, where the box is: a sheet covering several
                buildings and not saying which is how somebody dials the wrong
                one. */}
            {offices.size > 1 && options.groupBy !== 'site' && !options.showOffice && (
              <p className="mt-2 text-xs text-amber-700">
                These people sit in {offices.size} different offices — worth showing that column.
              </p>
            )}
          </fieldset>

          {options.groupBy !== 'none' && (
            <label className="mt-5 flex cursor-pointer items-start gap-2.5 rounded-lg border border-gray-200 p-2.5 hover:bg-gray-50">
              <input
                type="checkbox"
                checked={options.pageBreak}
                onChange={(e) => set('pageBreak', e.target.checked)}
                className="mt-0.5 accent-brand-500"
              />
              <span>
                <span className="block text-sm font-medium text-gray-900">
                  Start each group on its own page
                </span>
                <span className="block text-xs text-gray-500">
                  On, so a team can pin up their own sheet. Off to save paper when
                  the groups are small.
                </span>
              </span>
            </label>
          )}
        </div>

        <div className="flex flex-shrink-0 items-center justify-between gap-3 border-t border-gray-200 px-5 py-4">
          <p className="text-xs text-gray-500">
            {options.groupBy === 'none'
              ? 'One list'
              : `${groups.length} ${groups.length === 1 ? 'group' : 'groups'}`}
            {' · '}
            {/* "About", because it is counted in rows rather than measured —
                see estimatePages. */}
            about {pages} {pages === 1 ? 'page' : 'pages'}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg px-3 py-2 text-sm text-gray-600 transition hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={print}
              className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-600"
            >
              <Printer size={15} />
              Print
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
