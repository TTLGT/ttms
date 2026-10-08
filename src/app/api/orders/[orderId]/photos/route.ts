import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminStorage, AdminAuthError, FieldValue } from '@/lib/firebase-admin';
import { requireCaller } from '@/lib/partyAccess';
import { getVisibleOrder } from '@/lib/orderAccess';
import { actorOf, writeChange } from '@/lib/recordHistory';
import { deletePhotoFiles, listOrderPhotos, toLoadPhoto } from '@/lib/loadPhotosServer';
import {
  LOAD_PHOTOS_COLLECTION,
  MAX_CAPTION,
  MAX_PHOTO_BYTES,
  MAX_PHOTO_COMMODITY,
  MAX_PHOTOS_PER_ORDER,
  MAX_THUMB_BYTES,
  commodityKey,
  isPhotoStage,
  loadPhotoPath,
} from '@/types/loadPhoto';

type RouteContext = { params: Promise<{ orderId: string }> };

// Two files into the bucket and one batch into Firestore. Well inside the
// default on a warm function; the headroom is for a slow phone connection.
export const maxDuration = 30;

function fail(e: unknown) {
  if (e instanceof AdminAuthError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  throw e;
}

/**
 * A load's pictures, oldest first, with signed links and which one is the
 * load's profile picture. Same boundary as the order itself — see
 * src/types/loadPhoto.ts for why these are not readable from the bucket.
 */
export async function GET(req: NextRequest, { params }: RouteContext) {
  const { orderId } = await params;
  try {
    const caller = await requireCaller(req);
    const order  = await getVisibleOrder(caller, orderId);
    const photos = await listOrderPhotos(orderId);
    return NextResponse.json({
      photos,
      coverPhotoId: typeof order.coverPhotoId === 'string' ? order.coverPhotoId : null,
    });
  } catch (e) {
    return fail(e);
  }
}

/** True when the bytes open like a JPEG. The browser re-encodes every upload to one. */
async function isJpeg(file: File): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 3).arrayBuffer());
  return head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
}

/**
 * Adds one picture to a load.
 *
 * Uploaded through here with the Admin SDK rather than straight from the
 * browser into the bucket, which is how the POD goes. That is a deliberate
 * difference: a POD path is written onto the order afterwards and nothing is
 * checked on the way in, whereas here the server can refuse a load the caller
 * cannot see before anything lands, name the file itself so no request can
 * choose a path, and keep `load-photos/` with no storage rule at all.
 *
 * The browser sends two JPEGs it has already shrunk — the picture and its
 * thumbnail — because a Vercel function will not accept a request body over
 * 4.5 MB and this project has no image library on the server.
 *
 * The first picture a load gets becomes its profile picture, so a load that
 * has pictures always has one to be recognised by without anybody choosing.
 */
export async function POST(req: NextRequest, { params }: RouteContext) {
  const { orderId } = await params;
  try {
    const caller = await requireCaller(req);
    const order  = await getVisibleOrder(caller, orderId);

    const form  = await req.formData().catch(() => null);
    const full  = form?.get('photo');
    const thumb = form?.get('thumb');
    if (!(full instanceof File) || !(thumb instanceof File)) {
      return NextResponse.json({ error: 'Send the picture and its thumbnail' }, { status: 400 });
    }
    if (full.size > MAX_PHOTO_BYTES || thumb.size > MAX_THUMB_BYTES) {
      return NextResponse.json({ error: 'That picture is too large' }, { status: 413 });
    }
    // Checked by content, not by the type the browser declared: the bucket
    // serves these back with image/jpeg, and anything else under that label
    // is something nobody meant to upload.
    if (!(await isJpeg(full)) || !(await isJpeg(thumb))) {
      return NextResponse.json({ error: 'Pictures must be sent as JPEG' }, { status: 400 });
    }

    const stageRaw  = form?.get('stage');
    const stage     = isPhotoStage(stageRaw) ? stageRaw : 'other';
    const caption   = String(form?.get('caption') ?? '').trim().slice(0, MAX_CAPTION);
    const commodity = (String(form?.get('commodity') ?? '').trim()
      || String(order.commodity ?? '')).slice(0, MAX_PHOTO_COMMODITY);
    const width     = Math.max(0, Math.round(Number(form?.get('width')) || 0));
    const height    = Math.max(0, Math.round(Number(form?.get('height')) || 0));

    const current = Number(order.photoCount) || 0;
    if (current >= MAX_PHOTOS_PER_ORDER) {
      return NextResponse.json(
        { error: `A load can hold at most ${MAX_PHOTOS_PER_ORDER} pictures` },
        { status: 409 },
      );
    }

    const ref    = adminDb.collection(LOAD_PHOTOS_COLLECTION).doc();
    const bucket = adminStorage.bucket();
    // `private` so no shared cache keeps a copy; a day because the object
    // never changes under its name — a replaced picture is a new id.
    const metadata = { contentType: 'image/jpeg', cacheControl: 'private, max-age=86400' };
    await Promise.all([
      bucket.file(loadPhotoPath(orderId, ref.id, 'full'))
        .save(Buffer.from(await full.arrayBuffer()), { metadata, resumable: false }),
      bucket.file(loadPhotoPath(orderId, ref.id, 'thumb'))
        .save(Buffer.from(await thumb.arrayBuffer()), { metadata, resumable: false }),
    ]);

    const record = {
      orderId,
      caption,
      stage,
      commodity,
      commodityKey:   commodityKey(commodity),
      width,
      height,
      uploadedByUid:  caller.uid,
      uploadedByName: caller.displayName,
      createdAt:      FieldValue.serverTimestamp(),
    };

    const hasCover = typeof order.coverPhotoId === 'string' && order.coverPhotoId !== '';
    const batch = adminDb.batch();
    batch.set(ref, record);
    batch.update(adminDb.collection('orders').doc(orderId), {
      photoCount: FieldValue.increment(1),
      ...(hasCover ? {} : { coverPhotoId: ref.id }),
    });
    writeChange(batch, adminDb.collection('orders').doc(orderId), {
      action:  'event',
      summary: caption ? `Added a picture: ${caption}` : 'Added a picture',
    }, actorOf(caller));
    try {
      await batch.commit();
    } catch (err) {
      // Nothing points at the files yet, so leaving them would be storage
      // nobody can ever reach or remove.
      await deletePhotoFiles(orderId, ref.id).catch(() => {});
      throw err;
    }

    const saved = await ref.get();
    return NextResponse.json({
      photo:        await toLoadPhoto(ref.id, saved.data() ?? record),
      coverPhotoId: hasCover ? order.coverPhotoId : ref.id,
    });
  } catch (e) {
    return fail(e);
  }
}
