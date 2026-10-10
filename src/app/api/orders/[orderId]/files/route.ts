import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminStorage, AdminAuthError, FieldValue } from '@/lib/firebase-admin';
import { requireCaller } from '@/lib/partyAccess';
import { getVisibleOrder } from '@/lib/orderAccess';
import { actorOf, writeChange } from '@/lib/recordHistory';
import { listOrderFiles, toOrderFile } from '@/lib/orderFilesServer';
import {
  MAX_FILES_PER_ORDER,
  MAX_ORDER_FILE_BYTES,
  MAX_ORDER_FILE_NAME,
  MAX_ORDER_FILE_NOTE,
  ORDER_FILES_COLLECTION,
  ORDER_FILE_ID_RE,
  ORDER_FILE_KIND_LABEL,
  isOrderFileKind,
  isSignedSaUpload,
  orderFilePath,
} from '@/types/orderFile';

type RouteContext = { params: Promise<{ orderId: string }> };

function fail(e: unknown) {
  if (e instanceof AdminAuthError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  throw e;
}

/** A load's other files, oldest first, with signed links. Same boundary as the order. */
export async function GET(req: NextRequest, { params }: RouteContext) {
  const { orderId } = await params;
  try {
    const caller = await requireCaller(req);
    await getVisibleOrder(caller, orderId);
    return NextResponse.json({ files: await listOrderFiles(orderId) });
  } catch (e) {
    return fail(e);
  }
}

/**
 * Makes a file the browser has just uploaded into one of the order's files.
 *
 * The upload itself went straight into the bucket under `order-files/`, which
 * the browser can create in and nothing more — see src/types/orderFile.ts. This
 * is the step that checks: the caller can see the order, the id is well formed,
 * and an object really sits at that order's path. The size and type are read
 * off the object, not believed from the request.
 *
 * The record's id is the file's id and is written with create(), so the same
 * upload cannot be registered twice and one order's file cannot be re-filed
 * under another.
 */
export async function POST(req: NextRequest, { params }: RouteContext) {
  const { orderId } = await params;
  try {
    const caller = await requireCaller(req);
    const order  = await getVisibleOrder(caller, orderId);

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const fileId = typeof body.fileId === 'string' ? body.fileId : '';
    if (!ORDER_FILE_ID_RE.test(fileId)) {
      return NextResponse.json({ error: 'That upload has no valid id' }, { status: 400 });
    }
    const name = (typeof body.name === 'string' ? body.name.trim() : '').slice(0, MAX_ORDER_FILE_NAME) || 'file';
    const kind = isOrderFileKind(body.kind) ? body.kind : 'other';
    const note = (typeof body.note === 'string' ? body.note.trim() : '').slice(0, MAX_ORDER_FILE_NOTE);

    if ((Number(order.fileCount) || 0) >= MAX_FILES_PER_ORDER) {
      return NextResponse.json({ error: `A load can hold at most ${MAX_FILES_PER_ORDER} files` }, { status: 409 });
    }

    const file = adminStorage.bucket().file(orderFilePath(orderId, fileId));
    const [exists] = await file.exists();
    if (!exists) {
      return NextResponse.json({ error: 'The upload did not arrive. Try again.' }, { status: 400 });
    }
    const [meta] = await file.getMetadata();
    const size = Number(meta.size) || 0;
    if (size > MAX_ORDER_FILE_BYTES) {
      // The storage rule should have refused it already; this is the belt to
      // that pair of braces, and a refused file is not left behind.
      await file.delete({ ignoreNotFound: true }).catch(() => {});
      return NextResponse.json({ error: 'That file is too large' }, { status: 413 });
    }

    // A signed SA is a scan or a photo — it is emailed to the client as their
    // copy, so a spreadsheet or a zip filed under that name is refused.
    if ((kind === 'signed_sa' || kind === 'signed_ca') && !isSignedSaUpload(String(meta.contentType ?? ''))) {
      await file.delete({ ignoreNotFound: true }).catch(() => {});
      return NextResponse.json({ error: 'A signed agreement must be a PDF or a picture.' }, { status: 400 });
    }

    const ref = adminDb.collection(ORDER_FILES_COLLECTION).doc(fileId);
    const record = {
      orderId,
      name,
      kind,
      note,
      contentType:    String(meta.contentType ?? 'application/octet-stream'),
      size,
      uploadedByUid:  caller.uid,
      uploadedByName: caller.displayName,
      createdAt:      FieldValue.serverTimestamp(),
    };

    const orderRef = adminDb.collection('orders').doc(orderId);
    const batch = adminDb.batch();
    batch.create(ref, record);
    batch.update(orderRef, { fileCount: FieldValue.increment(1) });
    writeChange(batch, orderRef, {
      action:  'event',
      summary: `Added a file: ${name} (${ORDER_FILE_KIND_LABEL[kind]})`,
    }, actorOf(caller));
    await batch.commit();

    const saved = await ref.get();
    return NextResponse.json({ file: await toOrderFile(fileId, saved.data() ?? record) });
  } catch (e) {
    // create() on an id already taken lands here as ALREADY_EXISTS.
    if ((e as { code?: number }).code === 6) {
      return NextResponse.json({ error: 'That file is already on a load' }, { status: 409 });
    }
    return fail(e);
  }
}
