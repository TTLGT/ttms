import QRCode from 'qrcode';

/**
 * A QR code for a link, as a PNG. Server-side only — the agreement email and
 * the quote PDF attached to it.
 *
 * Error correction `M` (about 15% of the code can be damaged and still scan):
 * enough for a printed quote with a fold or a smudge, without making the code
 * so dense that a phone held at arm's length struggles with a 90-character
 * signing link. A quiet zone of two modules, because some email clients and
 * PDF viewers draw a border right up to the image.
 */
export async function qrPng(text: string): Promise<Buffer> {
  return QRCode.toBuffer(text, {
    type: 'png',
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 360,
    color: { dark: '#111827', light: '#ffffff' },
  });
}
