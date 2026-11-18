/**
 * Monthly update pages: a hand-made report of what changed in TTMS that month,
 * written for management, shown at /dashboard/updates/{month}.
 *
 * Deliberately not in the sidebar or anywhere else in the app. The link is
 * handed to the people it is written for. It is still behind sign-in, because
 * it carries the roadmap and the task board, so "unlisted" is about not
 * cluttering everybody's menu — the guard is `requireCompanyUser` in
 * /api/monthly-updates/{month}, like every other route.
 *
 * The page itself is a self-contained HTML file kept in
 * src/lib/data/monthlyUpdates/{month}.json — never in public/, which Vercel
 * serves to anybody. Adding a month is a new JSON file plus a line in the
 * route's table.
 */

/** `YYYY-MM`. Anything else is refused before a lookup. */
export function isUpdateMonth(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export interface MonthlyUpdate {
  title: string;
  html: string;
}
