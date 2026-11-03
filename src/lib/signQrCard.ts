import QRCode from 'qrcode';
import { COMPANY } from './company';

/**
 * A small "scan to sign" card for a signing link, drawn in the browser and
 * downloaded as a PNG — something staff can text, WhatsApp, print or hand
 * across a desk when the email is not the easiest way in.
 *
 * Browser-only (canvas). It carries nothing the link itself does not: the
 * link is already shown to anybody who can open the load (see
 * GET /api/orders/{id}/sign-link), and the signing page still asks the signer
 * for an email or phone we hold before it shows anything. No rates, no
 * client name — a card left on a counter gives away a load number and a link
 * that needs that second answer.
 *
 * 1050 × 600 is a 3.5 × 2 inch business card at 300 dpi, so it prints at a
 * sensible size and still reads on a phone screen. Drawn in Helvetica/Arial
 * rather than the app's Inter because next/font hashes the family name, and a
 * canvas given a name it cannot find falls back silently to a serif.
 *
 * The date is spelled out ("November 10, 2026") like every other document
 * that leaves the company — a slashed date is two different days depending
 * on who reads it.
 */

const W = 1050;
const H = 600;
const NAVY = '#041561';
const RED = '#B30000';
const INK = '#111827';
const MUTED = '#4b5563';
const FONT = 'Helvetica, Arial, sans-serif';

export type SignQrCardInput = {
  url: string;
  party: 'client' | 'carrier';
  orderNumber?: string;
  expiresAt?: string | null;
};

function spelledDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

/** Word-wraps `text` into lines no wider than `max` at the current font. */
function wrap(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > max) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

async function loadLogo(): Promise<HTMLImageElement | null> {
  const img = new Image();
  img.src = '/logo-full.png';
  try {
    await img.decode();
    return img;
  } catch {
    return null;
  }
}

export async function drawSignQrCard(input: SignQrCardInput): Promise<HTMLCanvasElement> {
  const carrier = input.party === 'carrier';
  // The names the signing page itself uses, so the card and the page it
  // opens agree. See src/app/sign/[token]/page.tsx.
  const docName = carrier ? 'Dispatch Sheet' : 'Load Confirmation';

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot draw the card.');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  // Header: logo left, document and load number right.
  const logo = await loadLogo();
  if (logo) {
    // logo-full.png has transparent side margins (artwork spans ~16%–84% of
    // its width — see logoFullBox() in pdfBrand.ts), so pull it left to line
    // the artwork up with the QR code below.
    const h = 92;
    const w = (logo.naturalWidth / logo.naturalHeight) * h;
    ctx.drawImage(logo, 44 - w * 0.16, 18, w, h);
  } else {
    ctx.fillStyle = NAVY;
    ctx.font = `bold 34px ${FONT}`;
    ctx.textBaseline = 'middle';
    ctx.fillText(COMPANY.legalName, 44, 64);
  }

  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = MUTED;
  ctx.font = `bold 20px ${FONT}`;
  ctx.fillText((carrier ? 'Carrier · ' : 'Client · ') + docName.toUpperCase(), W - 44, 58);
  if (input.orderNumber) {
    ctx.fillStyle = NAVY;
    ctx.font = `bold 34px ${FONT}`;
    ctx.fillText(`Load ${input.orderNumber}`, W - 44, 98);
  }
  ctx.textAlign = 'left';

  // A thin red rule under the header, the badge colour of the logo.
  ctx.fillStyle = RED;
  ctx.fillRect(44, 128, W - 88, 4);

  // The code. Same settings as the emailed one (src/lib/qrCode.ts) so a phone
  // that reads one reads the other.
  const qrSize = 360;
  const qrCanvas = document.createElement('canvas');
  await QRCode.toCanvas(qrCanvas, input.url, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: qrSize,
    color: { dark: INK, light: '#ffffff' },
  });
  const qrX = 36;
  const qrY = 150;
  ctx.drawImage(qrCanvas, qrX, qrY, qrSize, qrSize);

  // Instructions.
  const colX = qrX + qrSize + 34;
  const colW = W - 44 - colX;
  ctx.fillStyle = NAVY;
  ctx.font = `bold 38px ${FONT}`;
  ctx.fillText('Scan to review and sign', colX, 198);

  const steps = [
    "Open your phone's camera and point it at the code.",
    'Tap the link that appears.',
    'Enter the email or phone number we have on file for you.',
    `Review the ${docName.toLowerCase()} and sign it.`,
  ];
  const textX = colX + 50;
  const textW = colW - 50;
  let y = 248;
  ctx.font = `23px ${FONT}`;
  steps.forEach((step, i) => {
    // Numbered navy disc.
    ctx.fillStyle = NAVY;
    ctx.beginPath();
    ctx.arc(colX + 17, y + 9, 17, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold 20px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1), colX + 17, y + 10);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    ctx.fillStyle = INK;
    ctx.font = `23px ${FONT}`;
    const lines = wrap(ctx, step, textW);
    lines.forEach((line, j) => ctx.fillText(line, textX, y + 17 + j * 29));
    y += lines.length * 29 + 20;
  });

  // Footer band: how long the link works, and who to call.
  const bandY = H - 56;
  ctx.fillStyle = NAVY;
  ctx.fillRect(0, bandY, W, 56);
  ctx.fillStyle = '#ffffff';
  ctx.font = `20px ${FONT}`;
  ctx.textBaseline = 'middle';
  const until = spelledDate(input.expiresAt);
  ctx.fillText(until ? `This link works until ${until}.` : COMPANY.legalName, 44, bandY + 28);
  ctx.textAlign = 'right';
  ctx.fillText(`Questions? Call ${COMPANY.phone}`, W - 44, bandY + 28);

  return canvas;
}

/** Draws the card and hands it to the browser as a PNG download. */
export async function downloadSignQrCard(input: SignQrCardInput): Promise<void> {
  const canvas = await drawSignQrCard(input);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('The card could not be saved.');
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const tag = input.party === 'carrier' ? 'dispatch-sheet' : 'load-confirmation';
  a.href = href;
  a.download = `${input.orderNumber ? `load-${input.orderNumber}-` : ''}${tag}-scan-to-sign.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the download a moment to start before the URL is let go.
  window.setTimeout(() => URL.revokeObjectURL(href), 10_000);
}
