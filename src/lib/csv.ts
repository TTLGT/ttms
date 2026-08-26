/**
 * CSV aimed at a spreadsheet, not at another program.
 *
 * Excel is where these files get opened, which drives two decisions the format
 * itself does not require: the output is written with a BOM, and any cell that
 * could be read as a formula is neutralised first.
 *
 * Reading is here too, so the files this app writes and the files it accepts
 * back are handled by one implementation — an export edited in Excel and
 * re-uploaded has to survive the round trip.
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

// ── Reading ──────────────────────────────────────────────────────────────────

/**
 * Split CSV text into rows of cells, honouring quoted fields that contain
 * commas or line breaks. Handles CRLF and bare CR, because a file that has
 * been through Excel on Windows has the former and one that has been through
 * an older Mac tool has the latter.
 *
 * A leading BOM is stripped: `downloadCsv` writes one on purpose, so without
 * this the first header of our own export reads back with an invisible
 * U+FEFF glued to the front of it and matches nothing.
 */
export function parseCsv(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;

  const rows: string[][] = [];
  let row: string[] = [], field = '', inQ = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i], nx = src[i + 1];
    if (inQ) {
      if (ch === '"' && nx === '"') { field += '"'; i++; }
      else if (ch === '"')          { inQ = false; }
      else                          { field += ch; }
    } else {
      if      (ch === '"')                 { inQ = true; }
      else if (ch === ',')                 { row.push(field); field = ''; }
      else if (ch === '\r' && nx === '\n') { row.push(field); field = ''; rows.push(row); row = []; i++; }
      else if (ch === '\n' || ch === '\r') { row.push(field); field = ''; rows.push(row); row = []; }
      else                                 { field += ch; }
    }
  }
  if (field || row.length) { row.push(field); rows.push(row); }

  return rows;
}

/**
 * Undo `escapeCell`'s formula guard on the way back in.
 *
 * A phone number exported as "+502 5555 5555" is written to the file as
 * "'+502 5555 5555" so Excel cannot evaluate it. Excel shows that apostrophe
 * rather than absorbing it — it only has the "this is text" meaning for a value
 * a person types — so re-importing our own export would store the apostrophe as
 * part of the number. Stripping exactly one leading apostrophe reverses that,
 * and no value in this data legitimately starts with one.
 */
export function unescapeCell(value: string): string {
  const v = value.trim();
  return v.startsWith("'") && FORMULA_START.test(v.slice(1)) ? v.slice(1) : v;
}

/**
 * Header keys compared loosely, so "Work phone (US)", "work_phone_us" and
 * "WORK PHONE US" are all the same column. Spreadsheets pick up stray
 * punctuation and casing every time a file is passed between people; matching
 * on the letters and digits alone is what makes a hand-edited export usable.
 */
export function headerKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
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
