/**
 * CSV aimed at a spreadsheet, not at another program.
 *
 * Excel is where these files get opened, which drives two decisions the format
 * itself does not require: the output is written with a BOM, and any cell that
 * could be read as a formula is neutralised first.
 */

/** Cells starting with these are executed as formulas by Excel and Sheets. */
const FORMULA_START = /^[=+\-@\t\r]/;

function escapeCell(value: string): string {
  // Prefixing an apostrophe keeps the text readable but inert. Worth doing even
  // though these values come from admins: a phone number typed as "+1 555…"
  // already trips this, and a pasted name should never be able to run.
  const safe = FORMULA_START.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows
    .map((row) => row.map((cell) => escapeCell(cell == null ? '' : String(cell))).join(','))
    .join('\r\n');
}

/**
 * Dates as `YYYY-MM-DD HH:mm` — Excel parses that into a real datetime, so the
 * column sorts chronologically instead of alphabetically.
 */
export function csvDate(ts: { toDate?: () => Date } | null | undefined): string {
  if (!ts || typeof ts.toDate !== 'function') return '';
  const d = ts.toDate();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
         `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** U+FEFF, spelled out so it is not an invisible character in this file. */
const BOM = String.fromCharCode(0xFEFF);

export function downloadCsv(filename: string, csv: string): void {
  // Without the BOM Excel decodes the file in the local codepage and mangles
  // every accented name in it.
  const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
}
