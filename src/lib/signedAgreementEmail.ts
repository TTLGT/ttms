import { Resend } from 'resend';
import { adminDb } from './firebase-admin';
import { recordEvent } from './recordHistory';
import { clientAgreementRef } from './clientAgreements';
import { signUrl } from './appUrl';
import { agreementFileName, agreementPdf } from './signedAgreements';
import { signatureTime } from './signed-agreement-pdf';
import { cleanCcList } from '@/types/saRequest';

/**
 * Emails the signer their signed agreement as a PDF, straight after they
 * sign — the client their Shipper Agreement, the carrier their Carrier
 * Agreement (rate confirmation). For a carrier it goes to the carrier's
 * address and the CC list that link was sent with, never to the client.
 *
 * - **To** the address the SA was sent to — the contact asked to sign — and
 *   **copied** to whoever the SA itself was copied to (`clientAgreements.cc`):
 *   the same people at the client who already received it unsigned. Nobody
 *   new learns the client's rate from this email.
 * - **Reply-To** the dispatcher who sent the SA, so "thanks, one question"
 *   reaches a person rather than a no-reply box.
 * - The PDF is drawn from the copy on the link, after the signature landed —
 *   exactly what they signed, with their signature record.
 *
 * Best-effort, and never able to undo a signature: the caller runs it after
 * the signing transaction and swallows a failure. The client can always
 * download the same PDF from the link (GET /api/sign/[token]/pdf).
 */
export async function emailSignedAgreement(token: string): Promise<void> {
  if (!process.env.RESEND_API_KEY) return;
  const snap = await adminDb.collection('signing_tokens').doc(token).get();
  const d = snap.data();
  // `shipper_agreement` is the client's load confirmation; the name is historical.
  const carrier = d?.type === 'carrier_agreement';
  if (!d || (d.type !== 'shipper_agreement' && !carrier) || !d.usedAt) return;
  const to = String((carrier ? d.carrierEmail : d.clientEmail) ?? '').trim();
  if (!to) return;

  // The client's CC list lives on the order's link pointer; a carrier link
  // carries its own.
  const pointer = !carrier && d.orderId ? (await clientAgreementRef(String(d.orderId)).get()).data() : undefined;
  const cc = cleanCcList(carrier ? d.cc : pointer?.cc).filter((e) => e !== to.toLowerCase());

  const pdf = await agreementPdf(d, true);
  const orderNumber = String(d.orderNumber ?? '');
  const signedAt = signatureTime(d.usedAt.toDate());
  const replyTo = typeof d.sentByEmail === 'string' && d.sentByEmail.includes('@') ? d.sentByEmail : undefined;

  const sent = await new Resend(process.env.RESEND_API_KEY).emails.send({
    from:    `TTL Dispatch <${process.env.RESEND_FROM_EMAIL ?? 'noreply@totaltransportlogistics.us'}>`,
    to,
    ...(cc.length ? { cc } : {}),
    ...(replyTo ? { replyTo } : {}),
    subject: carrier ? `Signed Rate Confirmation — ${orderNumber}` : `Signed Load Confirmation — ${orderNumber}`,
    html: buildHtml({
      docName: carrier ? 'rate confirmation' : 'load confirmation',
      heading: carrier ? 'Signed Rate Confirmation' : 'Signed Load Confirmation',
      signerName: String(d.signerName ?? ''),
      orderNumber,
      signedAt,
      version: typeof d.version === 'number' ? d.version : null,
      link: signUrl(token),
    }),
    attachments: [{ filename: agreementFileName(d), content: pdf, contentType: 'application/pdf' }],
  });
  if (sent.error) throw new Error(sent.error.message);

  if (d.orderId) {
    await recordEvent(
      adminDb.collection('orders').doc(String(d.orderId)),
      `Emailed the ${carrier ? 'carrier a copy of the signed Carrier Agreement' : 'client a copy of the signed SA'}${typeof d.version === 'number' ? ` (version ${d.version})` : ''} at ${to}${cc.length ? `, copied to ${cc.join(', ')}` : ''}`,
      // No person sent this; TTMS did, on the client's signature.
      { uid: '', name: 'TTMS', email: '', via: 'app' },
    ).catch(() => {});
  }
}

function esc(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildHtml(p: {
  docName: string; heading: string; signerName: string; orderNumber: string; signedAt: string; version: number | null; link: string;
}) {
  return `<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;background:#f3f4f6;margin:0;padding:20px">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">
    <div style="background:#1e3a5f;color:#fff;padding:24px 32px">
      <p style="margin:0;font-size:11px;font-weight:bold;letter-spacing:2px;color:#93c5fd;text-transform:uppercase">Total Transport Logistics</p>
      <h1 style="margin:4px 0 0;font-size:22px;font-weight:bold">${esc(p.heading)}</h1>
    </div>
    <div style="padding:32px">
      <p style="color:#374151;font-size:15px;margin-top:0">Hello <strong>${esc(p.signerName)}</strong>,</p>
      <p style="color:#374151;font-size:15px">
        Thank you for signing the ${esc(p.docName)} for shipment <strong>${esc(p.orderNumber)}</strong>${p.version ? ` (version ${p.version})` : ''}
        on ${esc(p.signedAt)}. Your signed copy is attached to this email as a PDF.
      </p>
      <p style="color:#374151;font-size:14px;line-height:1.5">
        You can also download it again at any time from the same link you signed on.
      </p>
      <div style="text-align:center;margin:28px 0">
        <a href="${p.link}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 36px;border-radius:8px;font-size:15px;font-weight:bold">
          Open the signed agreement
        </a>
      </div>
      <p style="color:#9ca3af;font-size:12px;text-align:center;margin-bottom:0">If you have any questions, reply to this email or contact your dispatcher.</p>
    </div>
    <div style="border-top:1px solid #e5e7eb;padding:16px 32px;background:#f9fafb">
      <p style="margin:0;font-size:11px;color:#9ca3af;text-align:center">Total Transport Logistics · totaltransportlogistics.us</p>
    </div>
  </div>
</body>
</html>`;
}
