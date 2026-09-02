'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { sheetGroups, type SheetOptions } from '@/lib/extensionSheet';
import { useDateFormatters } from '@/lib/useDateFormatters';
import { roleLabels } from '@/types/allowedUser';
import type { DirectoryPerson } from '@/lib/directory';

/**
 * The extension sheet: the phone book as paper.
 *
 * Three columns always — name, extension, work line — and up to four more the
 * person printing it can turn on. This sheet ends up taped to a wall beside
 * the phones, where anybody walking past can read it, which is the argument
 * for what it can never carry: the second phone number and the payroll fields
 * are not on the list of columns at all, not even for the admin and HR viewers
 * whose own screen shows them. The second number is usually somebody's
 * personal mobile in their home country. A wall is not an audience.
 *
 * How it is grouped and ordered comes in as `options` — see lib/extensionSheet.ts,
 * where the choice is made and remembered. This component draws what it is
 * handed and decides nothing about which people are on it.
 *
 * ## How it prints
 *
 * The sheet is portalled to `<body>` rather than drawn where the button is.
 * The dashboard shell is a fixed-height box that scrolls inside `<main>` (see
 * `.app-shell-locked` in globals.css), and a printer honours that by printing
 * the first page and stopping — so a sheet rendered inside it would come out
 * clipped to whatever was on screen. As a child of `<body>` it is on the paper
 * by itself, which is also what the `printing-sheet` class set below arranges:
 * the matching rule in globals.css hides every other child of the body while
 * this is mounted, and only in print media.
 *
 * On screen the sheet is `hidden` and only `print:block`, so it never appears
 * in the app. That is worth the belt and braces: if `afterprint` never arrives
 * — an older browser, a print dialog dismissed in an odd way — the component
 * stays mounted, and the failure is an invisible node in the DOM rather than a
 * page that has replaced itself with a paper form.
 */

interface Props {
  /** Exactly the people on screen — same filters, same search. */
  people: DirectoryPerson[];
  siteName: (id: string | null | undefined) => string | null;
  teamName: (id: string | null | undefined) => string | null;
  /** Grouping, order and columns, as set in the dialog. */
  options: SheetOptions;
  /** What the list is narrowed to, in words, for under the heading. */
  scope: string;
  /** Called when the print dialog has been dealt with, either way. */
  onDone: () => void;
}

export default function ExtensionSheet({
  people, siteName, teamName, options, scope, onDone,
}: Props) {
  const { formatDate } = useDateFormatters();

  // The portal target is only there in the browser. Rendering nothing on the
  // first pass keeps the server render and the client's first one identical.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!mounted) return;

    const root = document.documentElement;
    root.classList.add('printing-sheet');

    // `afterprint` covers both outcomes — printed and cancelled — because
    // either way the sheet has done its job and should come back out of the
    // DOM. Registered before print() is called: the dialog blocks in most
    // browsers, and the event can land the instant it returns.
    const done = () => onDone();
    window.addEventListener('afterprint', done);

    // Two frames, not one. The first commits this component's markup; the
    // second is after the browser has laid it out. Printing inside the same
    // frame it mounted in gives some browsers a blank first page.
    const frame = requestAnimationFrame(() => requestAnimationFrame(() => window.print()));

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('afterprint', done);
      root.classList.remove('printing-sheet');
    };
  }, [mounted, onDone]);

  if (!mounted) return null;

  const groups = sheetGroups(people, options, { siteName, teamName });

  /**
   * A column that repeats the heading is dropped, whatever the dialog says.
   * On a sheet grouped by team, a Team column is the same word forty times
   * under a heading that already said it — and the dialog cannot know which
   * grouping was picked when the box was ticked, months ago.
   */
  const showOffice = options.showOffice && options.groupBy !== 'site';
  const showTeam   = options.showTeam   && options.groupBy !== 'team';

  const printed = formatDate(new Date());

  return createPortal(
    <div data-print-sheet className="hidden bg-white text-black print:block">
      {groups.map((group, i) => (
        <section
          key={group.id ?? 'none'}
          // Each group on its own page when that was asked for — the point of
          // the sheet is that a team can pin theirs up. The first section must
          // never carry it or the print starts with a blank sheet.
          className={options.pageBreak && i > 0 ? 'break-before-page' : i > 0 ? 'mt-6' : ''}
        >
          <header className="mb-4 border-b-2 border-black pb-2">
            <h1 className="text-xl font-bold">
              {group.name}
              {/* The ungrouped sheet's heading is already a title of its own,
                  so it does not take the suffix. */}
              {group.id || options.groupBy !== 'none' ? ' — extensions' : ''}
            </h1>
            <p className="mt-0.5 text-[11px]">
              Total Transport Logistics · {scope} · Printed {printed}
            </p>
          </header>

          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-black text-left">
                <th className="py-1 pr-3 font-semibold">Name</th>
                {options.showRole && <th className="py-1 pr-3 font-semibold">Role</th>}
                {showOffice && <th className="py-1 pr-3 font-semibold">Office</th>}
                {showTeam   && <th className="py-1 pr-3 font-semibold">Team</th>}
                <th className="w-16 py-1 pr-3 font-semibold">Ext.</th>
                <th className="w-44 py-1 pr-3 font-semibold">Work phone</th>
                {options.showEmail && <th className="py-1 font-semibold">Email</th>}
              </tr>
            </thead>
            <tbody>
              {group.people.map((p) => (
                <tr key={p.email} className="border-b border-gray-300">
                  <td className="py-1 pr-3">{p.displayName}</td>
                  {options.showRole && (
                    <td className="py-1 pr-3">{roleLabels(p).join(', ')}</td>
                  )}
                  {showOffice && (
                    <td className="py-1 pr-3">{siteName(p.siteId) ?? '—'}</td>
                  )}
                  {showTeam && (
                    <td className="py-1 pr-3">{teamName(p.teamId) ?? '—'}</td>
                  )}
                  {/* An em dash rather than an empty cell: a blank reads as a
                      printing fault, and somebody retypes the sheet by hand
                      to "fix" it. */}
                  <td className="py-1 pr-3 font-semibold">{p.extension || '—'}</td>
                  <td className="py-1 pr-3">{p.phone || '—'}</td>
                  {options.showEmail && (
                    <td className="py-1 text-[11px]">{p.email}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>

          <p className="mt-3 text-[10px] text-gray-600">
            {group.people.length} {group.people.length === 1 ? 'person' : 'people'}.
            Corrections go to an admin — this sheet is printed from TTMS and
            edits made to the paper are lost at the next print.
          </p>
        </section>
      ))}
    </div>,
    document.body,
  );
}
