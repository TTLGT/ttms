import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { adminDb, AdminAuthError } from '@/lib/firebase-admin';
import { can } from '@/lib/accessControl';
import { requireCaller } from '@/lib/partyAccess';
import { getVisibleOrder } from '@/lib/orderAccess';
import { actorOf, writeChange } from '@/lib/recordHistory';
import { postOrderAlert } from '@/lib/chatAlerts';
import { bringIntoOrderRoom } from '@/lib/saRequestsServer';
import { openBolRequestIfSigned } from '@/lib/bolRequests';
import { millisOf, partyChangedAt } from '@/lib/signedSaProof';
import { toOrderFile } from '@/lib/orderFilesServer';
import { updateOrderAsCaller } from '@/lib/orderWrites';
import { AGREEMENT_LABEL, describeSignature, partyOfKind } from '@/lib/signedDocuments';
import { ORDER_FILES_COLLECTION } from '@/types/orderFile';
import {
  MAX_REJECT_REASON, RECORD_FIELD, asSignatureRecord, cleanSignatureDetails, detailsFromDetected,
  reviewOf, sameDetails, signedAtMillis,
  type DetectedSignature, type SignatureDetails, type SignatureRecord,
} from '@/types/signatureRecord';

type RouteContext = { params: Promise<{ orderId: string; fileId: string }> };

function fail(e: unknown) {
  if (e instanceof AdminAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
  throw e;
}

/** Read off the PDF unchanged, read and then corrected, or typed from nothing. */
function sourceOf(details: SignatureDetails, detected: DetectedSignature | null): SignatureRecord['source'] {
  const read = detailsFromDetected(detected);
  if (!read.signerName && !read.date) return 'typed';
  return sameDetails(details, read) ? 'pdf' : 'pdf_edited';
}

/**
 * The signature details of a signed agreement uploaded to a load, and the
 * decision on it. See src/types/signatureRecord.ts.
 *
 * - `{ action: 'save', details }` — the uploader (or anybody who can open the
 *   load) checks what was read off the PDF, or types it, while it waits.
 * - `{ action: 'approve', details?, advance? }` — `orders.verifyRecords`.
 *   The file becomes proof, and the signature is written onto the order
 *   (`clientSignatureRecord` / `carrierSignatureRecord`) in the same
 *   transaction as its change-log entry. Details are required unless the
 *   load already has a signature recorded for that party — a second page of
 *   the same agreement adds a file, not a signer. Approved details that
 *   differ from what was saved are the approver's own entry. `advance` then
 *   moves a Booked load to Client Signed (or a Client Signed one to Carrier
 *   Signed) through the ordinary order save.
 * - `{ action: 'reject', reason }` — `orders.verifyRecords`. Also takes back
 *   an earlier approval, and the signature recorded from this file with it.
 */
export async function POST(req: NextRequest, { params }: RouteContext) {
  const { orderId, fileId } = await params;
  try {
    const caller = await requireCaller(req);
    await getVisibleOrder(caller, orderId);

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = body.action;
    if (action !== 'save' && action !== 'approve' && action !== 'reject') {
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
    if (action !== 'save' && !can(caller.profile, 'orders.verifyRecords')) {
      return NextResponse.json({ error: 'Admin and dispatch verify signed copies.' }, { status: 403 });
    }

    let details: SignatureDetails | null = null;
    if (body.details !== undefined && body.details !== null) {
      const cleaned = cleanSignatureDetails(body.details);
      if ('error' in cleaned) return NextResponse.json({ error: cleaned.error }, { status: 400 });
      details = cleaned.value;
    }
    if (action === 'save' && !details) {
      return NextResponse.json({ error: 'Nothing to save' }, { status: 400 });
    }
    const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, MAX_REJECT_REASON) : '';
    if (action === 'reject' && !reason) {
      return NextResponse.json({ error: 'Say why it is being refused, so the uploader knows what to fix.' }, { status: 400 });
    }

    const fileRef  = adminDb.collection(ORDER_FILES_COLLECTION).doc(fileId);
    const orderRef = adminDb.collection('orders').doc(orderId);
    const now = Timestamp.now();
    const actor = actorOf(caller);
    // Set inside the transaction; cast so the compiler does not narrow it to
    // its starting value and then doubt the comparisons after.
    let party = 'client' as 'client' | 'carrier';
    let fileName = '';
    let alert = '';
    // Who to tell about a refusal — see below.
    let uploader = null as { uid: string; name: string } | null;

    await adminDb.runTransaction(async (tx) => {
      const [fileSnap, orderSnap] = await Promise.all([tx.get(fileRef), tx.get(orderRef)]);
      const file = fileSnap.data();
      if (!fileSnap.exists || !file || file.orderId !== orderId) throw new AdminAuthError('File not found', 404);
      const p = partyOfKind(file.kind);
      if (!p) throw new AdminAuthError('Only a signed SA or Carrier Agreement has signature details.', 400);
      party = p;
      fileName = String(file.name ?? 'file');
      const order = orderSnap.data() ?? {};
      const review = reviewOf(file.review);
      const f = RECORD_FIELD[p];
      const label = AGREEMENT_LABEL[p];
      const detected = (file.detected ?? null) as DetectedSignature | null;
      const stored = file.signature as (SignatureDetails & { enteredByUid?: string; enteredByName?: string; enteredAt?: number; source?: SignatureRecord['source'] }) | null | undefined;

      // ── save ──────────────────────────────────────────────────────────────
      if (action === 'save') {
        if (review !== 'pending') {
          throw new AdminAuthError('This copy has already been decided. Admin or dispatch can still correct it while verifying.', 409);
        }
        tx.update(fileRef, {
          signature: {
            ...details!,
            enteredByUid: caller.uid, enteredByName: caller.displayName, enteredAt: now.toMillis(),
            source: sourceOf(details!, detected),
          },
        });
        return;
      }

      // ── reject ────────────────────────────────────────────────────────────
      if (action === 'reject') {
        if (review === 'rejected') throw new AdminAuthError('This copy has already been refused.', 409);
        tx.update(fileRef, {
          review: 'rejected', rejectReason: reason,
          reviewedByUid: caller.uid, reviewedByName: caller.displayName, reviewedAt: now,
        });
        const rec = asSignatureRecord(order[f.record]);
        const takesRecord = rec?.fileId === fileId;
        if (takesRecord) {
          tx.update(orderRef, { [f.record]: null, [f.flag]: false, updatedAt: now });
        }
        writeChange(tx, orderRef, {
          action: 'event',
          summary: `${review === 'approved' ? 'Took back the verification of' : 'Refused'} the ${label} uploaded by ${String(file.uploadedByName ?? 'someone')} (${fileName}): ${reason}`
            + (takesRecord ? `. The signature recorded from it was removed (${describeSignature(rec!)}).` : ''),
        }, actor, now);
        uploader = { uid: String(file.uploadedByUid ?? ''), name: String(file.uploadedByName ?? '') };
        alert = `${caller.displayName} refused the ${label} ${fileName} uploaded by ${uploader.name || 'someone'}: ${reason}. `
          + 'Upload a corrected copy on the load.';
        return;
      }

      // ── approve ───────────────────────────────────────────────────────────
      if (review === 'approved') throw new AdminAuthError('This copy is already verified.', 409);
      // A copy uploaded before this party last changed is the previous
      // client's or carrier's paper — signedSaProof() already ignores it.
      if (millisOf(file.createdAt) <= partyChangedAt(order, p)) {
        throw new AdminAuthError(`This copy was uploaded before the ${p === 'carrier' ? 'carrier' : 'client'} on the load changed, so it is not their signature. Refuse it, and upload theirs.`, 409);
      }
      // A Carrier Agreement is verified against a carrier on the load: the
      // signature recorded is that carrier's, and Carrier Signed means
      // nothing on a load with nobody named to have signed. A BATS load
      // arrives with none, so the review window links one first.
      if (p === 'carrier' && !order.carrierId) {
        throw new AdminAuthError('Link the carrier to this load first. The review window shows who the dispatch sheet names, and finds them in TTMS or on FMCSA.', 409);
      }
      const existing = asSignatureRecord(order[f.record]);
      const use: SignatureDetails | null = details ?? (stored?.signerName ? stored : null);
      if (!use && !existing) {
        throw new AdminAuthError('Enter who signed and when before verifying — that is what gets recorded on the load.', 400);
      }
      const eSigned = Boolean(p === 'client' ? order.shipperSignedAt : order.carrierSignedAt);

      // The approver's own entry when they changed what was saved, or typed it.
      const changedHere = Boolean(details && !(stored && sameDetails(details, stored) && details.method === stored.method && details.signerTitle === stored.signerTitle));
      const entry = use ? {
        ...use,
        enteredByUid:  changedHere ? caller.uid : String(stored?.enteredByUid ?? caller.uid),
        enteredByName: changedHere ? caller.displayName : String(stored?.enteredByName ?? caller.displayName),
        enteredAt:     changedHere ? now.toMillis() : Number(stored?.enteredAt) || now.toMillis(),
        source:        changedHere ? sourceOf(use, detected) : (stored?.source ?? sourceOf(use, detected)),
      } : null;

      tx.update(fileRef, {
        review: 'approved', rejectReason: '',
        reviewedByUid: caller.uid, reviewedByName: caller.displayName, reviewedAt: now,
        ...(entry ? { signature: entry } : {}),
      });

      let summary = `Verified the ${label} uploaded by ${String(file.uploadedByName ?? 'someone')} (${fileName})`;
      // A party who e-signed on TTMS's link already has the better record;
      // a copy verified afterwards is filed beside it, not over it.
      if (entry && !eSigned) {
        const record: SignatureRecord = {
          ...entry,
          fileId,
          signedAt: signedAtMillis(entry.date, entry.time, entry.zone) ?? now.toMillis(),
          approvedByUid: caller.uid, approvedByName: caller.displayName, approvedAt: now.toMillis(),
        };
        tx.update(orderRef, { [f.record]: record, [f.flag]: true, updatedAt: now });
        summary += ` and recorded the ${p === 'client' ? 'client' : 'carrier'}’s signature from it: ${describeSignature(record)}`
          + (existing ? `, replacing ${describeSignature(existing)}` : '');
      } else if (eSigned) {
        summary += '. The signature on the e-signing link stays the one on record';
      } else {
        summary += ', as another page of the signature already recorded';
      }
      writeChange(tx, orderRef, { action: 'event', summary }, actor, now);
      alert = `${caller.displayName} verified the ${label} ${fileName}${entry && !eSigned ? ` — signed by ${describeSignature(entry)}` : ''}.`;
    });

    // Moving the status is the ordinary order save, after the approval it now
    // has to see: the same check on the copy, the same history entry.
    let advanceError = '';
    if (action === 'approve' && body.advance === true) {
      const order = (await orderRef.get()).data() ?? {};
      const next = party === 'client'
        ? (order.status === 'booked' || order.status === 'carrier_assigned') && !order.shipperSignedAt ? 'shipper_signed' : null
        : order.status === 'shipper_signed' && !order.carrierSignedAt ? 'carrier_signed' : null;
      if (next) {
        await updateOrderAsCaller(caller, orderId, { status: next }).catch((e) => {
          advanceError = e instanceof Error ? e.message : 'The status could not be moved.';
        });
      }
    }
    /*
     * A verified copy is a signature recorded, so it may be the second one
     * the BOL waits for — the same call every signature makes. Never on a
     * Record import: that load's BOL went out from BATS long ago, and
     * verifying its paperwork must not draw and circulate a second one.
     */
    if (action === 'approve') {
      const order = (await orderRef.get()).data() ?? {};
      if (order.recordImport !== true) {
        await openBolRequestIfSigned(orderId, `The ${AGREEMENT_LABEL[party]} uploaded to the load was verified by ${caller.displayName}`).catch(() => {});
      }
    }
    // A refusal goes to whoever uploaded the copy: they are brought into the
    // load's room if they were not in it, so the line reaches them as an
    // unread message wherever they are working. Their Approvals list shows
    // it refused, with the reason, too.
    if (uploader?.uid && uploader.uid !== caller.uid) {
      const order = (await orderRef.get()).data() ?? {};
      await bringIntoOrderRoom(orderId, order, [uploader.uid], caller.uid).catch(() => {});
    }
    if (alert) await postOrderAlert(orderId, alert).catch(() => {});

    const saved = await fileRef.get();
    return NextResponse.json({ file: await toOrderFile(fileId, saved.data()!), advanceError });
  } catch (e) {
    return fail(e);
  }
}
