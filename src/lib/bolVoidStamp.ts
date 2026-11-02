import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';

/**
 * Stamps an earlier BOL VOID on its way out of TTMS.
 *
 * An earlier BOL is the exact file that was on record, copied aside byte for
 * byte (keepPreviousBol() in src/lib/bolRequests.ts), so it cannot be redrawn
 * with a stamp the way a replaced agreement is — redrawing would print today's
 * load, not what was sent. Nor is the stored file stamped: it is the answer to
 * "what did the carrier actually receive?" and stays untouched. The stamp is
 * written onto a copy at download, every time.
 *
 * Why stamp at all: a superseded BOL emailed to a dock by mistake can name a
 * carrier no longer on the load, and freight released against the wrong
 * carrier's name is how loads are stolen. It must read as void at a glance,
 * on every page and wherever on the page somebody crops it — hence three
 * marks down each page rather than one in the middle (the gap a single mark
 * left on a replaced agreement's signature box).
 */
export async function stampBolVoid(original: Uint8Array, note: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(original);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const red = rgb(0.86, 0.15, 0.15);
  const darkRed = rgb(0.6, 0.11, 0.11);

  for (const page of pdf.getPages()) {
    const { width, height } = page.getSize();

    const size = Math.min(width, height) * 0.22;
    const textWidth = bold.widthOfTextAtSize('VOID', size);
    const angle = 30;
    const rad = (angle * Math.PI) / 180;
    for (const y of [height * 0.8, height * 0.5, height * 0.2]) {
      // drawText rotates about the text's start, so start it back along the
      // slope by half its length to centre the word on (width / 2, y).
      page.drawText('VOID', {
        x: width / 2 - (Math.cos(rad) * textWidth) / 2 + (Math.sin(rad) * size) / 3,
        y: y - (Math.sin(rad) * textWidth) / 2 - (Math.cos(rad) * size) / 3,
        size, font: bold, color: red, opacity: 0.16, rotate: degrees(angle),
      });
    }

    // A plain line at the head and foot, so even a page printed in grey or
    // trimmed to its middle still says why.
    const line = `VOID - ${note}. Not valid for pickup or delivery.`;
    const lineSize = Math.min(9, (width - 40) / Math.max(1, bold.widthOfTextAtSize(line, 1)));
    const lineX = (width - bold.widthOfTextAtSize(line, lineSize)) / 2;
    page.drawText(line, { x: lineX, y: height - 14, size: lineSize, font: bold, color: darkRed });
    page.drawText(line, { x: lineX, y: 6, size: lineSize, font: bold, color: darkRed });
  }

  return pdf.save();
}

/** "Replaced on October 30, 2026 by Ana Lopez" — spelled out, since the file can leave the company. */
export function bolVoidNote(replacedAt: Date, replacedByName: string): string {
  const date = replacedAt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  return `Replaced on ${date}${replacedByName ? ` by ${replacedByName}` : ''}`;
}
