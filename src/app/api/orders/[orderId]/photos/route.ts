import { NextRequest, NextResponse } from 'next/server';
import { adminDb, AdminAuthError, FieldValue } from '@/lib/firebase-admin';
import { requireCaller } from '@/lib/partyAccess';
import { getVisibleOrder } from '@/lib/orderAccess';
import { actorOf, writeChange } from '@/lib/recordHistory';
import { deletePhotoFiles, lineOf, listOrderPhotos, readPhotoUpload, savePhotoFiles, toLoadPhoto } from '@/lib/loadPhotosServer';
import {
  LOAD_PHOTOS_COLLECTION,
  MAX_CAPTION,
  MAX_PHOTO_COMMODITY,
  MAX_PHOTO_LOCATION,
  MAX_PHOTOS_PER_ORDER,
  commodityKey,
  hasRoute,
  isPhotoStage,
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
    const photos = await listOrderPhotos(orderId, order);
    return NextResponse.json({
      photos,
      coverPhotoId: typeof order.coverPhotoId === 'string' ? order.coverPhotoId : null,
    });
  } catch (e) {
    return fail(e);
  }
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

    const form   = await req.formData().catch(() => null);
    const upload = await readPhotoUpload(form);
    if ('error' in upload) return NextResponse.json({ error: upload.error }, { status: upload.status });
    const { full, thumb, width, height } = upload;

    const stageRaw  = form?.get('stage');
    const stage     = isPhotoStage(stageRaw) ? stageRaw : 'other';
    const caption   = String(form?.get('caption') ?? '').trim().slice(0, MAX_CAPTION);
    // A commodity picture added from its freight line carries the line's
    // id. Kept only when it names a line this load really has, and then the
    // line's own description is the label — never one taken from the form.
    const line = stage === 'commodity'
      ? lineOf(order, String(form?.get('commodityItemId') ?? ''))
      : null;
    const commodity = (line?.description.trim()
      || String(form?.get('commodity') ?? '').trim()
      || String(order.commodity ?? '')).slice(0, MAX_PHOTO_COMMODITY);
    // A label, not a link — see `location` on LoadPhoto — so it is trimmed and
    // kept rather than checked against the load's current stops.
    const label = (key: string) => String(form?.get(key) ?? '').trim().slice(0, MAX_PHOTO_LOCATION);
    // A commodity says where it is picked up and where it goes; every other
    // type has the one stop. The other boxes are not stored, so a picture
    // never carries a tag its type does not show.
    const route     = hasRoute(stage);
    const location  = route ? '' : label('location');
    const pickupAt  = route ? label('pickupAt') : '';
    const deliverTo = route ? label('deliverTo') : '';
    // (A picture linked to a freight line is shown with the line's own stops
    // whatever is stored here — see toLoadPhoto().)

    const current = Number(order.photoCount) || 0;
    if (current >= MAX_PHOTOS_PER_ORDER) {
      return NextResponse.json(
        { error: `A load can hold at most ${MAX_PHOTOS_PER_ORDER} pictures` },
        { status: 409 },
      );
    }

    const ref = adminDb.collection(LOAD_PHOTOS_COLLECTION).doc();
    await savePhotoFiles(orderId, ref.id, full, thumb);

    const record = {
      orderId,
      caption,
      stage,
      commodity,
      commodityKey:   commodityKey(commodity),
      commodityItemId: line?.id ?? '',
      location,
      pickupAt,
      deliverTo,
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
      photo:        await toLoadPhoto(ref.id, saved.data() ?? record, order),
      coverPhotoId: hasCover ? order.coverPhotoId : ref.id,
    });
  } catch (e) {
    return fail(e);
  }
}
