import fs from 'fs';
import path from 'path';

/**
 * The company's look on the documents that leave the building — the client's
 * load confirmation, the carrier's dispatch sheet and the quote. One place,
 * so the three cannot drift into three shades of navy.
 *
 * The colours are TTL's own (the navy of the lettering and the red of the
 * truck badge in the logo), not the app's `brand-*` Tailwind tokens: those are
 * tuned for a screen in light and dark mode, these for paper.
 */

export const TTL = {
  navy:      '#041561',
  navyMid:   '#041688',
  blue:      '#062DA1',
  red:       '#B30000',
  redBright: '#CC0000',
  /** Pale navy for panel headings and table heads. */
  wash:      '#eef1fa',
  ink:       '#111827',
  muted:     '#4b5563',
  faint:     '#6b7280',
  rule:      '#d6dbea',
} as const;

/**
 * The letterhead, as BATS printed it on the Shipper Agreement. Written here
 * rather than read from settings because nothing in the app edits it; if the
 * office moves, this is the line to change.
 */
export const COMPANY = {
  legalName: 'Total Transport Logistics, Inc.',
  street:    '4833 W Royal Ln',
  city:      'Irving, TX 75063',
  phone:     '(469) 472-2334',
  web:       'totaltransportlogistics.us',
} as const;

const LOGO_FULL_PATH = path.join(process.cwd(), 'public', 'logo-full.png');
let logoFullData: Buffer | null = null;

/**
 * The full logo (lettering and badge) for a white letterhead, as bytes.
 *
 * Handed to react-pdf as data rather than as a path: on Windows a path starts
 * `C:\`, which react-pdf reads as a URL with a `c:` scheme, fails to fetch,
 * and draws nothing — so the logo vanished on any PDF made on a staff PC.
 * Read once and kept; it is 40 KB.
 */
export function logoFull(): { data: Buffer; format: 'png' } {
  logoFullData ??= fs.readFileSync(LOGO_FULL_PATH);
  return { data: logoFullData, format: 'png' };
}

/**
 * logo-full.png is 915 × 273 with transparent margins: the artwork spans
 * roughly 16%–84% of the width. Drawn at a given height, these are the
 * width to give it and how far to pull it left so the artwork sits on the
 * page margin instead of floating inside it.
 */
export function logoFullBox(height: number): { width: number; height: number; marginLeft: number } {
  const width = height * (915 / 273);
  return { width, height, marginLeft: -width * 0.16 };
}
