import { adminDb, adminStorage } from './firebase-admin';
import {
  LOAD_PHOTOS_COLLECTION,
  MAX_PHOTO_BYTES,
  MAX_THUMB_BYTES,
  loadPhotoPath,
  normalizeStage,
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
    stage:          normalizeStage(d.stage),
    commodity:      String(d.commodity ?? ''),
    location:       String(d.location ?? ''),
    width:         Number(d.width) || 0,
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

/**
 * The picture a client document — the quote and the SA — shows for this load,
 * or null. Commodity pictures only, since 2026-11-10, like the Dispatch Sheet
 * and the BOL: the client sees their freight, never the carrier's truck (who
 * carries the load is not the client's business), a proof picture, or a
 * location or other picture that was made the load's profile picture. Kept as
 * its own name so the client's documents can part ways with the carrier's
 * again without touching their callers.
 */
export function clientPhotoId(orderId: string, coverPhotoId: unknown): Promise<string | null> {
  return commodityPhotoId(orderId, coverPhotoId);
}

/**
 * The picture the carrier's Dispatch Sheet and the BOL show for this load, or
 * null (2026-11-10). Commodity pictures only — the freight as it is, which is
 * what the driver checks at the dock — never a truck, a location or proof:
 * the BOL is emailed to every party on the load, and the carrier has its own
 * truck. The profile picture when it is a commodity one, otherwise the
 * earliest commodity picture. One single-field query, as clientPhotoId().
 */
export async function commodityPhotoId(orderId: string, coverPhotoId: unknown): Promise<string | null> {
  const snap = await adminDb.collection(LOAD_PHOTOS_COLLECTION).where('orderId', '==', orderId).get();
  const commodity = snap.docs
    .filter((d) => d.data().stage !== 'signed_sa' && normalizeStage(d.data().stage) === 'commodity')
    .map((d) => ({ id: d.id, at: millis(d.data().createdAt) }));
  if (typeof coverPhotoId === 'string' && commodity.some((p) => p.id === coverPhotoId)) return coverPhotoId;
  commodity.sort((a, b) => a.at - b.at);
  return commodity[0]?.id ?? null;
}

/**
 * A picture's thumbnail as a JPEG data URL, for drawing into a PDF — or null
 * if the file is gone. The thumbnail (480 px) rather than the full picture:
 * it is drawn about three inches wide, where 480 px is still sharp, and these
 * PDFs are emailed — the full one would add megabytes to every attachment.
 *
 * The path comes from loadPhotoPath(), never from a stored field, so an id
 * can only ever name a file in that order's own folder.
 */
export async function photoDataUrl(orderId: string, photoId: string): Promise<string | null> {
  try {
    const [buf] = await adminStorage.bucket().file(loadPhotoPath(orderId, photoId, 'thumb')).download();
    return `data:image/jpeg;base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

/** True when the bytes open like a JPEG. The browser re-encodes every upload to one. */
async function isJpeg(file: File): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 3).arrayBuffer());
  return head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
}

/**
 * The picture and thumbnail out of an upload form, checked, or the sentence
 * and status to refuse it with. Shared by the staff route and the driver's
 * link, so a picture is held to the same limits whoever sends it.
 *
 * Checked by content, not by the type the browser declared: the bucket
 * serves these back with image/jpeg, and anything else under that label is
 * something nobody meant to upload.
 */
export async function readPhotoUpload(
  form: FormData | null,
  names: { photo: string; thumb: string } = { photo: 'photo', thumb: 'thumb' },
): Promise<{ full: File; thumb: File; width: number; height: number } | { error: string; status: number }> {
  const full  = form?.get(names.photo);
  const thumb = form?.get(names.thumb);
  if (!(full instanceof File) || !(thumb instanceof File)) {
    return { error: 'Send the picture and its thumbnail', status: 400 };
  }
  if (full.size > MAX_PHOTO_BYTES || thumb.size > MAX_THUMB_BYTES) {
    return { error: 'That picture is too large', status: 413 };
  }
  if (!(await isJpeg(full)) || !(await isJpeg(thumb))) {
    return { error: 'Pictures must be sent as JPEG', status: 400 };
  }
  return {
    full,
    thumb,
    width:  Math.max(0, Math.round(Number(form?.get('width')) || 0)),
    height: Math.max(0, Math.round(Number(form?.get('height')) || 0)),
  };
}

/** Puts a picture's two files in the bucket, under the name loadPhotoPath() gives them. */
export async function savePhotoFiles(orderId: string, photoId: string, full: File, thumb: File): Promise<void> {
  const bucket = adminStorage.bucket();
  // `private` so no shared cache keeps a copy; a day because the object
  // never changes under its name — a replaced picture is a new id.
  const metadata = { contentType: 'image/jpeg', cacheControl: 'private, max-age=86400' };
  await Promise.all([
    bucket.file(loadPhotoPath(orderId, photoId, 'full'))
      .save(Buffer.from(await full.arrayBuffer()), { metadata, resumable: false }),
    bucket.file(loadPhotoPath(orderId, photoId, 'thumb'))
      .save(Buffer.from(await thumb.arrayBuffer()), { metadata, resumable: false }),
  ]);
}
