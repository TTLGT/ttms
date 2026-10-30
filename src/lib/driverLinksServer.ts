import { randomBytes } from 'crypto';
import { Resend } from 'resend';
import { FieldValue, Timestamp, type WriteBatch } from 'firebase-admin/firestore';
import { adminDb, adminStorage } from './firebase-admin';
import { writeChange, type ChangeActor } from './recordHistory';
import { postOrderAlert, statusAlert } from './chatAlerts';
import { driverUrl } from './appUrl';
import { deletePhotoFiles, savePhotoFiles } from './loadPhotosServer';
import { settlementStatus } from './orderPaymentsServer';
import { phoneKeysFor, phoneSearchKeys } from '@/types/party';
import { STATUS_LABEL, STATUS_RANK, orderDisplayNumber, type OrderStatus } from '@/types/order';
import { phoneRegionOf } from '@/lib/phone';
import {
  DRIVER_LINKS_COLLECTION,
  DRIVER_LINK_DAYS,
  DRIVER_STEP_LABEL,
  MIN_LOCATION_GAP_MS,
  STEP_PHOTO,
  mapsUrl,
  statusForStep,
  type DriverLinkInfo,
  type DriverPoint,
  type DriverStep,
  type DriverStepMark,
} from '@/types/driverLink';
import {
  LOAD_PHOTOS_COLLECTION,
  MAX_CAPTION,
  MAX_PHOTOS_PER_ORDER,
  commodityKey,
  photoLocationChoices,
  type PhotoStage,
} from '@/types/loadPhoto';
import {
  MAX_FILES_PER_ORDER,
  ORDER_FILES_COLLECTION,
  orderFilePath,
} from '@/types/orderFile';
import { isCodLoad, type PaymentMark, type PaymentMarkKey } from '@/types/orderPayment';
import type { Order } from '@/types/order';

/**
 * Server side of the driver's link — see src/types/driverLink.ts for what it
 * is and why it is shaped like the signing link.
 *
 * Everything a driver does lands on the order through here, with the Admin
 * SDK, in one batch with its change-log entry (`via: 'driver'`). A line in
 * the load's room follows, best-effort, like every other alert.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Data = Record<string, any>;

/** The cookies that let a browser in once the driver has typed their number. */
export const DRIVER_PAGE_COOKIE = 'ttms_driver_page';
export const DRIVER_API_COOKIE  = 'ttms_driver_access';

export function driverAccessCookies(token: string): { name: string; path: string }[] {
  // Two names for two paths, for the reason given on SIGN_PAGE_COOKIE: a
  // response keeps one cookie per name.
  return [
    { name: DRIVER_PAGE_COOKIE, path: `/driver/${token}` },
    { name: DRIVER_API_COOKIE,  path: `/api/driver/${token}` },
  ];
}

/** Tokens are 48 hex characters; anything else is refused before a read. */
export const DRIVER_TOKEN_RE = /^[a-f0-9]{48}$/;

export const driverLinkRef = (token: string) => adminDb.collection(DRIVER_LINKS_COLLECTION).doc(token);

function millis(v: unknown): number {
  const t = v as { toMillis?: () => number } | null | undefined;
  return typeof t?.toMillis === 'function' ? t.toMillis() : 0;
}

/**
 * The live link for a load, or null. One equality filter and the rest in
 * memory, so no composite index; a load has a handful of links at most.
 */
export async function currentDriverLink(orderId: string): Promise<{ id: string; data: Data } | null> {
  const snap = await adminDb.collection(DRIVER_LINKS_COLLECTION).where('orderId', '==', orderId).get();
  const live = snap.docs
    .map((d) => ({ id: d.id, data: d.data() }))
    .filter(({ data }) => !data.revokedAt)
    .sort((a, b) => millis(b.data.createdAt) - millis(a.data.createdAt));
  return live[0] ?? null;
}

export function toDriverLinkInfo(id: string, d: Data): DriverLinkInfo {
  const expiresAt = millis(d.expiresAt);
  return {
    url:           driverUrl(id),
    driverName:    String(d.driverName ?? ''),
    driverPhone:   String(d.driverPhone ?? ''),
    createdAt:     millis(d.createdAt),
    createdByName: String(d.createdByName ?? ''),
    expiresAt,
    expired:       expiresAt <= Date.now(),
    lastSentTo:    String(d.lastSentTo ?? ''),
    lastSentAt:    millis(d.lastSentAt) || null,
    opened:        typeof d.accessKey === 'string' && d.accessKey !== '',
  };
}

/** Why a load cannot have a driver link yet, or ''. */
export function cannotMakeLink(order: Data): string {
  if (order.status === 'cancelled') return 'This load is cancelled.';
  if (typeof order.carrierId !== 'string' || !order.carrierId) return 'Add the carrier to this load first.';
  if (!String(order.driverName ?? '').trim()) return 'Add the driver’s name to this load first, in the Carrier section.';
  if (!phoneKeysFor(order.driverPhone, phoneRegionOf(order.driverPhoneRegion)).length) {
    return 'Add the driver’s phone number to this load first. The driver types it to open the link.';
  }
  return '';
}

/**
 * Makes a fresh link for the driver now on the load and switches off any
 * older one, in one batch with its change-log entry. A new link rather than
 * a reused one, so a link already sent to a driver who was replaced stops
 * working the moment somebody makes this one.
 */
export async function createDriverLink(orderId: string, order: Data, actor: ChangeActor): Promise<{ id: string; data: Data }> {
  const old = await adminDb.collection(DRIVER_LINKS_COLLECTION).where('orderId', '==', orderId).get();
  const id  = randomBytes(24).toString('hex');
  const now = Timestamp.now();
  const data: Data = {
    orderId,
    orderNumber:       orderDisplayNumber(order as Partial<Order>),
    carrierId:         order.carrierId,
    driverName:        String(order.driverName ?? '').trim(),
    driverPhone:       String(order.driverPhone ?? ''),
    driverPhoneRegion: phoneRegionOf(order.driverPhoneRegion),
    createdAt:         now,
    createdByUid:      actor.uid,
    createdByName:     actor.name,
    expiresAt:         Timestamp.fromMillis(now.toMillis() + DRIVER_LINK_DAYS * 86_400_000),
    revokedAt:         null,
    accessKey:         '',
    verifyFailures:    0,
    lastSentTo:        '',
    lastSentAt:        null,
  };
  const batch = adminDb.batch();
  for (const d of old.docs) if (!d.data().revokedAt) batch.update(d.ref, { revokedAt: now });
  batch.create(driverLinkRef(id), data);
  writeChange(batch, adminDb.collection('orders').doc(orderId), {
    action:  'event',
    summary: `Made a driver link for ${data.driverName}${old.docs.some((d) => !d.data().revokedAt) ? '; the older link stopped working' : ''}`,
  }, actor);
  await batch.commit();
  return { id, data };
}

/** Switches off the load's live link. */
export async function revokeDriverLink(orderId: string, actor: ChangeActor): Promise<boolean> {
  const link = await currentDriverLink(orderId);
  if (!link) return false;
  const batch = adminDb.batch();
  batch.update(driverLinkRef(link.id), { revokedAt: Timestamp.now() });
  writeChange(batch, adminDb.collection('orders').doc(orderId), {
    action: 'event', summary: 'Switched off the driver link',
  }, actor);
  await batch.commit();
  return true;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

/** Emails the link, in English and Spanish, and notes who it went to. */
export async function emailDriverLink(
  id: string,
  link: Data,
  to: string,
  actor: ChangeActor,
): Promise<void> {
  if (!process.env.RESEND_API_KEY) throw new Error('Email sending is not configured');
  const url = driverUrl(id);
  const number = String(link.orderNumber ?? '');
  const name = String(link.driverName ?? '');
  const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
    from:    `TTL Dispatch <${process.env.RESEND_FROM_EMAIL ?? 'noreply@totaltransportlogistics.us'}>`,
    to:      [to],
    ...(actor.email ? { replyTo: actor.email } : {}),
    subject: `Driver updates for load ${number} / Actualizaciones del chofer`,
    html: `<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;background:#f3f4f6;margin:0;padding:20px">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:10px;overflow:hidden">
    <div style="background:#1e3a5f;color:#fff;padding:24px 32px">
      <p style="margin:0;font-size:11px;font-weight:bold;letter-spacing:2px;color:#93c5fd;text-transform:uppercase">Total Transport Logistics</p>
      <h1 style="margin:4px 0 0;font-size:22px;font-weight:bold">Load ${esc(number)}</h1>
    </div>
    <div style="padding:32px;color:#374151;font-size:15px;line-height:1.5">
      <p style="margin-top:0">Hello${name ? ` ${esc(name)}` : ''},</p>
      <p>Use this link to tell us when you arrive, when you are loaded, and when you deliver, and to send pictures and your location. You will be asked for your phone number the first time.</p>
      <p style="color:#6b7280">Use este enlace para avisarnos cuando llegue, cuando esté cargado y cuando entregue, y para enviar fotos y su ubicación. La primera vez se le pedirá su número de teléfono.</p>
      <p style="text-align:center;margin:28px 0">
        <a href="${esc(url)}" style="background:#2563eb;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:bold">Open driver page / Abrir</a>
      </p>
      <p style="font-size:12px;color:#9ca3af;word-break:break-all">${esc(url)}</p>
    </div>
  </div>
</body>
</html>`,
  });
  if (error) throw new Error(error.message || 'The email could not be sent');
  const batch = adminDb.batch();
  batch.update(driverLinkRef(id), { lastSentTo: to, lastSentAt: Timestamp.now() });
  writeChange(batch, adminDb.collection('orders').doc(String(link.orderId)), {
    action: 'event', summary: `Emailed the driver link to ${to}`,
  }, actor);
  await batch.commit();
}

// ── The driver's side ───────────────────────────────────────────────────────

/** Why a link no longer opens, as a key the page words in two languages, or null. */
export type LinkProblem = 'missing' | 'revoked' | 'expired' | 'carrier_changed' | 'cancelled';

export function linkProblem(link: Data | undefined, order: Data | undefined): LinkProblem | null {
  if (!link || !order) return 'missing';
  if (link.revokedAt) return 'revoked';
  if (millis(link.expiresAt) <= Date.now()) return 'expired';
  // A different carrier means a different driver; this one's link is done.
  if (order.carrierId !== link.carrierId) return 'carrier_changed';
  if (order.status === 'cancelled') return 'cancelled';
  return null;
}

/**
 * True when what was typed is the driver's phone: the one the link was made
 * for, or the one on the load now (a corrected number should work). Same
 * readings as the party phone search — formatting ignored, with or without
 * the country code.
 */
export function driverPhoneMatches(link: Data, order: Data, typed: string): boolean {
  const onFile = new Set([
    ...phoneKeysFor(link.driverPhone, phoneRegionOf(link.driverPhoneRegion)),
    ...phoneKeysFor(order.driverPhone, phoneRegionOf(order.driverPhoneRegion)),
  ]);
  return phoneSearchKeys(typed).some((k) => onFile.has(k));
}

/** The actor every driver write is recorded under. */
export function driverActor(link: Data): ChangeActor {
  return { uid: '', name: String(link.driverName || 'Driver'), email: '', via: 'driver' };
}

function pointText(p: DriverPoint | null): string {
  return p ? ` Location: ${mapsUrl(p)}` : '';
}

/**
 * The status a step moves the load to now, or null.
 *
 * Forward only, and only once the carrier has signed: before that the load
 * has no rate confirmation, and a driver tapping "Picked up" must not walk it
 * past the carrier's signature. The step is still recorded either way, and
 * the room is told when it moved nothing.
 */
function stepStatus(step: DriverStep, current: OrderStatus): OrderStatus | null {
  const target = statusForStep(step);
  if (!target || current === 'cancelled' || current === 'completed') return null;
  const rank = STATUS_RANK[current as Exclude<OrderStatus, 'cancelled'>] ?? 0;
  if (rank < STATUS_RANK.carrier_signed) return null;
  return STATUS_RANK[target as Exclude<OrderStatus, 'cancelled'>] > rank ? target : null;
}

export class DriverActionError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

interface PhotoInput {
  full: File;
  thumb: File;
  width: number;
  height: number;
  stage: PhotoStage;
  caption: string;
  location: string;
}

/**
 * Queues a picture's record and returns the order fields that go with it.
 * The files must already be in the bucket (savePhotoFiles()).
 */
function queuePhoto(batch: WriteBatch, orderId: string, order: Data, photoId: string, input: PhotoInput, link: Data) {
  const commodity = String(order.commodity ?? '').slice(0, 120);
  batch.set(adminDb.collection(LOAD_PHOTOS_COLLECTION).doc(photoId), {
    orderId,
    caption:        input.caption.slice(0, MAX_CAPTION),
    stage:          input.stage,
    commodity,
    commodityKey:   commodityKey(commodity),
    location:       input.location,
    width:          input.width,
    height:         input.height,
    uploadedByUid:  '',
    uploadedByName: `${String(link.driverName || 'Driver')} (driver)`,
    uploadedVia:    'driver',
    createdAt:      FieldValue.serverTimestamp(),
  });
  const hasCover = typeof order.coverPhotoId === 'string' && order.coverPhotoId !== '';
  return {
    photoCount: FieldValue.increment(1),
    ...(hasCover ? {} : { coverPhotoId: photoId }),
  };
}

function photoRoom(order: Data): void {
  if ((Number(order.photoCount) || 0) >= MAX_PHOTOS_PER_ORDER) {
    throw new DriverActionError(`This load already has ${MAX_PHOTOS_PER_ORDER} pictures, the most it can hold.`, 409);
  }
}

/** The first pickup or delivery stop's label, for a step's proof picture. */
function stopLabel(order: Data, stop: 'pickup' | 'delivery'): string {
  return photoLocationChoices(order as Order, [stop])[0] ?? '';
}

/**
 * One step of the trip. A step already recorded is not recorded again — the
 * driver tapping twice in a yard with one bar of signal is the normal case.
 * The steps in `STEP_PHOTO` (picked up, delivered) need their picture; it is
 * filed as a Proof picture at that stop and is what the step points at.
 * Proof, not Commodity, because it is usually the signed BOL — paperwork,
 * which clientPhotoId() keeps off client documents.
 *
 * A step sent with a picture it does not need still files it, against the
 * delivery stop as before.
 */
export async function recordStep(
  link: Data,
  step: DriverStep,
  point: DriverPoint | null,
  photo: Omit<PhotoInput, 'stage' | 'location'> | null,
): Promise<{ moved: OrderStatus | null; already: boolean }> {
  const orderId  = String(link.orderId);
  const orderRef = adminDb.collection('orders').doc(orderId);
  const order    = (await orderRef.get()).data() ?? {};
  if (order.driverProgress?.[step]) return { moved: null, already: true };
  const needs = STEP_PHOTO[step];
  if (needs && !photo) {
    throw new DriverActionError(step === 'picked_up'
      ? 'Take a picture of the loaded freight or the signed BOL first.'
      : 'Take a picture of the delivered freight or the signed delivery receipt first.', 400);
  }

  let photoId: string | null = null;
  if (photo) {
    photoRoom(order);
    photoId = adminDb.collection(LOAD_PHOTOS_COLLECTION).doc().id;
    await savePhotoFiles(orderId, photoId, photo.full, photo.thumb);
  }

  const now     = Timestamp.now();
  const current = String(order.status ?? '') as OrderStatus;
  const moved   = stepStatus(step, current);
  const mark: DriverStepMark = { at: now.toMillis(), point, ...(photoId ? { photoId } : {}) };

  const write: Data = { [`driverProgress.${step}`]: mark, updatedAt: now };
  if (point) write.driverLocation = { ...point, at: now.toMillis() };
  let finalStatus: OrderStatus | null = moved;
  if (moved) {
    write.status = moved;
    if (moved === 'delivered' && current !== 'delivered') {
      write.deliveredAt = now;
      // Paid before it was delivered — a prepaid load — closes now.
      if (settlementStatus({ ...order, status: 'delivered' }, order.paymentMarks ?? {}) === 'completed') {
        write.status = finalStatus = 'completed';
      }
    }
  }

  const batch = adminDb.batch();
  if (photo && photoId) {
    Object.assign(write, queuePhoto(batch, orderId, order, photoId, {
      ...photo, stage: 'proof', location: stopLabel(order, needs?.stop ?? 'delivery'),
      caption: photo.caption || (needs?.caption ?? STEP_PHOTO.delivered!.caption),
    }, link));
  }
  // `update` with a dotted path, so an order with no driverProgress map yet
  // gets one and the steps already there are left alone.
  batch.update(orderRef, write);
  writeChange(batch, orderRef, {
    action:  'event',
    summary: `Driver: ${DRIVER_STEP_LABEL[step]}${photoId ? ', with a picture' : ''}${pointText(point)}`,
    fields:  finalStatus ? [{ field: 'status', from: current, to: finalStatus }] : [],
  }, driverActor(link), now);
  try {
    await batch.commit();
  } catch (err) {
    if (photoId) await deletePhotoFiles(orderId, photoId).catch(() => {});
    throw err;
  }

  const notMoved = statusForStep(step) && !moved
    && (STATUS_RANK[current as Exclude<OrderStatus, 'cancelled'>] ?? 0) < STATUS_RANK.carrier_signed
    ? ` The status stays ${STATUS_LABEL[current] ?? current}: the carrier has not signed the Dispatch Sheet.`
    : '';
  await postOrderAlert(orderId,
    `Driver ${String(link.driverName || '')}: ${DRIVER_STEP_LABEL[step]}.${pointText(point)}${notMoved}`.replace(/\s+/g, ' ').trim(),
  ).catch(() => {});
  if (finalStatus) await postOrderAlert(orderId, statusAlert(finalStatus)).catch(() => {});
  return { moved: finalStatus, already: false };
}

/** The driver's current location, on its own. */
export async function recordLocation(link: Data, point: DriverPoint): Promise<void> {
  const orderId  = String(link.orderId);
  const orderRef = adminDb.collection('orders').doc(orderId);
  const order    = (await orderRef.get()).data() ?? {};
  const last     = Number(order.driverLocation?.at) || 0;
  if (Date.now() - last < MIN_LOCATION_GAP_MS) {
    throw new DriverActionError('Your location was just sent. Wait a moment before sending it again.', 429);
  }
  const now = Timestamp.now();
  const batch = adminDb.batch();
  batch.update(orderRef, { driverLocation: { ...point, at: now.toMillis() }, updatedAt: now });
  writeChange(batch, orderRef, {
    action: 'event', summary: `Driver shared their location.${pointText(point)}`,
  }, driverActor(link), now);
  await batch.commit();
  await postOrderAlert(orderId, `Driver ${String(link.driverName || '')} shared their location: ${mapsUrl(point)}`).catch(() => {});
}

/** A picture the driver adds from their link, outside any step. */
export async function recordDriverPhoto(link: Data, input: PhotoInput): Promise<void> {
  const orderId  = String(link.orderId);
  const orderRef = adminDb.collection('orders').doc(orderId);
  const order    = (await orderRef.get()).data() ?? {};
  photoRoom(order);
  const photoId = adminDb.collection(LOAD_PHOTOS_COLLECTION).doc().id;
  await savePhotoFiles(orderId, photoId, input.full, input.thumb);
  const batch = adminDb.batch();
  const fields = queuePhoto(batch, orderId, order, photoId, input, link);
  batch.update(orderRef, fields);
  writeChange(batch, orderRef, {
    action: 'event', summary: input.caption ? `Driver added a picture: ${input.caption}` : 'Driver added a picture',
  }, driverActor(link));
  try {
    await batch.commit();
  } catch (err) {
    await deletePhotoFiles(orderId, photoId).catch(() => {});
    throw err;
  }
}

/**
 * The kinds of proof a driver may send: a picture (already shrunk to a JPEG
 * by their browser), a PNG screenshot, or a PDF. Checked by the first bytes,
 * not the declared type.
 */
async function proofType(file: File): Promise<string | null> {
  const b = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return 'application/pdf';
  return null;
}

/** Under Vercel's 4.5 MB request limit, with room for the rest of the form. */
export const MAX_DRIVER_PROOF_BYTES = 4_000_000;

/**
 * "I got paid" — or on a COD load "the client paid me in full" — with its
 * proof. The proof is filed as an ordinary `payment_proof` file on the load,
 * so staff find it on the Documents tab like any other paperwork.
 */
export async function recordDriverPaid(link: Data, key: PaymentMarkKey, file: File, note: string): Promise<{ completed: boolean }> {
  const orderId  = String(link.orderId);
  const orderRef = adminDb.collection('orders').doc(orderId);
  const order    = (await orderRef.get()).data() ?? {};
  if (order.paymentMarks?.[key]) throw new DriverActionError('That payment is already recorded.', 409);
  if (file.size > MAX_DRIVER_PROOF_BYTES) throw new DriverActionError('That file is too large. Send a picture or a smaller PDF.', 413);
  const contentType = await proofType(file);
  if (!contentType) throw new DriverActionError('Send a picture or a PDF.', 400);
  if ((Number(order.fileCount) || 0) >= MAX_FILES_PER_ORDER) {
    throw new DriverActionError('This load cannot hold any more files. Please call dispatch.', 409);
  }

  const fileId = randomBytes(12).toString('hex');
  await adminStorage.bucket().file(orderFilePath(orderId, fileId)).save(Buffer.from(await file.arrayBuffer()), {
    metadata: { contentType }, resumable: false,
  });

  const cod = isCodLoad(order);
  const now = Timestamp.now();
  const driverName = String(link.driverName || 'Driver');
  const mark: PaymentMark = { at: now.toMillis(), byUid: '', byName: driverName, via: 'driver', fileIds: [fileId], note };
  const marks = { ...(order.paymentMarks ?? {}), [key]: mark };
  const next = settlementStatus(order, marks);
  const label = key === 'clientPaid' ? 'the client paid them in full (COD)' : 'they were paid';

  const batch = adminDb.batch();
  batch.create(adminDb.collection(ORDER_FILES_COLLECTION).doc(fileId), {
    orderId,
    name:           (file.name || 'payment proof').slice(0, 200),
    kind:           'payment_proof',
    note:           `From the driver: ${label}${note ? ` — ${note}` : ''}`.slice(0, 300),
    contentType,
    size:           file.size,
    uploadedByUid:  '',
    uploadedByName: `${driverName} (driver)`,
    createdAt:      FieldValue.serverTimestamp(),
  });
  batch.update(orderRef, {
    [`paymentMarks.${key}`]: mark,
    fileCount: FieldValue.increment(1),
    updatedAt: now,
    ...(next ? { status: next } : {}),
  });
  writeChange(batch, orderRef, {
    action:  'event',
    summary: `Driver says ${label}, with proof attached${cod && key === 'clientPaid' ? '. The carrier still owes us our share' : ''}`,
    fields:  next ? [{ field: 'status', from: order.status, to: next }] : [],
  }, driverActor(link), now);
  try {
    await batch.commit();
  } catch (err) {
    await adminStorage.bucket().file(orderFilePath(orderId, fileId)).delete({ ignoreNotFound: true }).catch(() => {});
    throw err;
  }
  await postOrderAlert(orderId, `Driver ${driverName} says ${label}. The proof is on the load's Documents tab.`).catch(() => {});
  if (next) await postOrderAlert(orderId, statusAlert(next)).catch(() => {});
  return { completed: next === 'completed' };
}
