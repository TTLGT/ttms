import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { hasSignAccess } from '@/lib/signAccess';
import { readPhotoUpload } from '@/lib/loadPhotosServer';
import {
  DRIVER_API_COOKIE,
  DRIVER_TOKEN_RE,
  DriverActionError,
  driverLinkRef,
  linkProblem,
  recordDriverPaid,
  recordDriverPhoto,
  recordLocation,
  recordStep,
} from '@/lib/driverLinksServer';
import { cleanPoint, isDriverStep } from '@/types/driverLink';
import { MAX_CAPTION, isPhotoStage } from '@/types/loadPhoto';
import { MAX_PAYMENT_NOTE, driverMayRecord, isCodLoad, isPaymentMarkKey } from '@/types/orderPayment';

type RouteContext = { params: Promise<{ token: string }> };

// A picture into the bucket and one batch; the headroom is a phone on one bar.
export const maxDuration = 30;

/**
 * Everything a driver does from their link. PUBLIC, like /api/sign/[token]:
 * the credential is the token plus the cookie the phone check set, and both
 * are checked before anything is read from the form. See
 * src/types/driverLink.ts.
 *
 * One multipart form with an `action`:
 * - `step`     — `step`, optional `lat`/`lng`/`accuracy`; `picked_up` and
 *                `delivered` also need `photo` + `thumb` (STEP_PHOTO).
 * - `location` — `lat`, `lng`, `accuracy`.
 * - `photo`    — `photo` + `thumb`, `stage`, `caption`.
 * - `paid`     — `mark` (`driverPaid`, or `clientPaid` on COD), `proof`, `note`.
 *
 * Errors come back as plain English sentences or as short keys the page
 * words in the driver's language (`revoked`, `expired`, …).
 */
export async function POST(req: NextRequest, { params }: RouteContext) {
  const { token } = await params;
  if (!DRIVER_TOKEN_RE.test(token)) return NextResponse.json({ error: 'missing' }, { status: 404 });

  const link = (await driverLinkRef(token).get()).data();
  if (!link || !hasSignAccess(link, req.cookies.get(DRIVER_API_COOKIE)?.value)) {
    return NextResponse.json({ error: 'verify' }, { status: 401 });
  }
  const order = (await adminDb.collection('orders').doc(String(link.orderId)).get()).data();
  const problem = linkProblem(link, order);
  if (problem) return NextResponse.json({ error: problem }, { status: 410 });

  const form   = await req.formData().catch(() => null);
  const action = String(form?.get('action') ?? '');
  const point  = cleanPoint(form?.get('lat'), form?.get('lng'), form?.get('accuracy'));
  const caption = String(form?.get('caption') ?? '').trim().slice(0, MAX_CAPTION);

  try {
    if (action === 'step') {
      const step = form?.get('step');
      if (!isDriverStep(step)) return NextResponse.json({ error: 'Which step?' }, { status: 400 });
      let photo = null;
      if (form?.get('photo')) {
        const upload = await readPhotoUpload(form);
        if ('error' in upload) return NextResponse.json({ error: upload.error }, { status: upload.status });
        photo = { ...upload, caption };
      }
      return NextResponse.json(await recordStep(link, step, point, photo));
    }

    if (action === 'location') {
      if (!point) return NextResponse.json({ error: 'no_location' }, { status: 400 });
      await recordLocation(link, point);
      return NextResponse.json({ ok: true });
    }

    if (action === 'photo') {
      const upload = await readPhotoUpload(form);
      if ('error' in upload) return NextResponse.json({ error: upload.error }, { status: upload.status });
      const stageRaw = form?.get('stage');
      // A driver's picture is never filed as Proof unless they said so —
      // Proof is kept off client documents (clientPhotoId()).
      const stage = isPhotoStage(stageRaw) ? stageRaw : 'commodity';
      await recordDriverPhoto(link, { ...upload, stage, caption, location: '' });
      return NextResponse.json({ ok: true });
    }

    if (action === 'paid') {
      const mark = form?.get('mark');
      if (!isPaymentMarkKey(mark) || !driverMayRecord(mark, isCodLoad(order!))) {
        return NextResponse.json({ error: 'That payment is not yours to record.' }, { status: 403 });
      }
      const proof = form?.get('proof');
      if (!(proof instanceof File) || !proof.size) {
        return NextResponse.json({ error: 'proof_required' }, { status: 400 });
      }
      const note = String(form?.get('note') ?? '').trim().slice(0, MAX_PAYMENT_NOTE);
      return NextResponse.json(await recordDriverPaid(link, mark, proof, note));
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e) {
    if (e instanceof DriverActionError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
