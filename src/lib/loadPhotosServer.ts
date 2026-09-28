import { adminDb, adminStorage } from './firebase-admin';
import {
  LOAD_PHOTOS_COLLECTION,
  isPhotoStage,
  loadPhotoPath,
  type LoadPhoto,
} from '@/types/loadPhoto';

/**
 * Server side of load pictures: reading the records and signing their links.
 * Everything that calls this has already decided the caller may see the order
 * — these helpers do not check, in the same way the bucket calls in the
 * document route do not.
 */

/**
 * When a signed link should expire: two to three hours from now, rounded to
 * the hour.
 *
 * Rounded so that the link is the same string for everybody who asks within
 * that hour. getSignedUrl signs v2 by default, and a v2 signature covers only
 * the path and the expiry — so a fixed expiry gives a fixed URL, and a browser
 * that has already fetched a thumbnail draws it from its cache instead of
 * downloading it again every time the orders list or the reel is opened. A
 * fresh `Date.now() + 2h` would make every link unique and every image a miss.
 *
 * Two hours at the least, matching the document route: long enough to leave a
 * gallery open and come back to it, short enough that a link pasted into an
 * email stops working well before the load closes out.
 */
function stableExpiry(): number {
  const hour = 60 * 60 * 1000;
  return (Math.floor(Date.now() / hour) + 3) * hour;
}

async function sign(path: string): Promise<string> {
  const [url] = await adminStorage.bucket().file(path).getSignedUrl({
    action:  'read',
    expires: stableExpiry(),
  });
  return url;
}

export async function signPhoto(orderId: string, photoId: string): Promise<{ url: string; thumbUrl: string }> {
  const [url, thumbUrl] = await Promise.all([
    sign(loadPhotoPath(orderId, photoId, 'full')),
    sign(loadPhotoPath(orderId, photoId, 'thumb')),
  ]);
  return { url, thumbUrl };
}

/** Just the thumbnail — the orders list and the order header need no more. */
export function signCoverThumb(orderId: string, photoId: string): Promise<string> {
  return sign(loadPhotoPath(orderId, photoId, 'thumb'));
}

/**
 * Adds `coverThumbUrl` to every order that has a profile picture.
 *
 * Signing is done locally with the service account's key — no request to
 * Storage and no Firestore read — so a page of fifty orders costs nothing but
 * a few milliseconds. The path comes from loadPhotoPath(), never from a field
 * on the order, so a `coverPhotoId` somebody wrote by hand can only ever name
 * a file in that order's own folder.
 */
export async function withCoverThumbs<T extends Record<string, unknown>>(orders: T[]): Promise<T[]> {
  return Promise.all(orders.map(async (o) => {
    const id    = o.id;
    const cover = o.coverPhotoId;
    if (typeof id !== 'string' || typeof cover !== 'string' || !cover) return o;
    return { ...o, coverThumbUrl: await signCoverThumb(id, cover) };
  }));
}

function millis(value: unknown): number {
  const v = value as { toMillis?: () => number } | null | undefined;
  return typeof v?.toMillis === 'function' ? v.toMillis() : 0;
}

/** A stored record as the browser receives it, links and all. */
export async function toLoadPhoto(
  id: string,
  d: FirebaseFirestore.DocumentData,
): Promise<LoadPhoto> {
  const orderId = String(d.orderId ?? '');
  return {
    id,
    orderId,
    caption:        String(d.caption ?? ''),
    stage:          isPhotoStage(d.stage) ? d.stage : 'other',
    commodity:      String(d.commodity ?? ''),
    width:          Number(d.width) || 0,
    height:         Number(d.height) || 0,
    uploadedByUid:  String(d.uploadedByUid ?? ''),
    uploadedByName: String(d.uploadedByName ?? ''),
    createdAt:      millis(d.createdAt),
    ...(await signPhoto(orderId, id)),
  };
}

/**
 * One order's pictures, oldest first — the order they were taken in, which is
 * the order a reel should run.
 *
 * Sorted here rather than in the query: `orderId ==` alone is served by the
 * automatic single-field index, while adding an orderBy would need a composite
 * index that has to be deployed by hand. One load's pictures are a handful.
 */
export async function listOrderPhotos(orderId: string): Promise<LoadPhoto[]> {
  const snap = await adminDb.collection(LOAD_PHOTOS_COLLECTION)
    .where('orderId', '==', orderId)
    .get();
  const photos = await Promise.all(snap.docs.map((doc) => toLoadPhoto(doc.id, doc.data())));
  return photos.sort((a, b) => a.createdAt - b.createdAt);
}

/** Removes a picture's two files. Missing files are not an error. */
export async function deletePhotoFiles(orderId: string, photoId: string): Promise<void> {
  const bucket = adminStorage.bucket();
  await Promise.all((['full', 'thumb'] as const).map((size) =>
    bucket.file(loadPhotoPath(orderId, photoId, size)).delete({ ignoreNotFound: true }),
  ));
}
