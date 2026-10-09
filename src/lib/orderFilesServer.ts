import { adminDb, adminStorage } from './firebase-admin';
import {
  ORDER_FILES_COLLECTION,
  isOrderFileKind,
  orderFilePath,
  type OrderFile,
} from '@/types/orderFile';

/**
 * Server side of an order's other files: reading the records and signing their
 * links. Callers have already decided the caller may see the order — these do
 * not check, the same arrangement as loadPhotosServer.ts.
 */

function millis(value: unknown): number {
  const v = value as { toMillis?: () => number } | null | undefined;
  return typeof v?.toMillis === 'function' ? v.toMillis() : 0;
}

/**
 * Two hours, like every other paperwork link. The download is named after the
 * file it was uploaded as, because the bucket name is an id nobody could tell
 * apart from the next one in their Downloads folder.
 */
async function sign(orderId: string, id: string, name: string): Promise<string> {
  const safe = name.replace(/["\\\r\n]/g, '_');
  const [url] = await adminStorage.bucket().file(orderFilePath(orderId, id)).getSignedUrl({
    action: 'read',
    expires: Date.now() + 2 * 60 * 60 * 1000,
    responseDisposition: `inline; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(name)}`,
  });
  return url;
}

export async function toOrderFile(id: string, d: FirebaseFirestore.DocumentData): Promise<OrderFile> {
  const orderId = String(d.orderId ?? '');
  const name = String(d.name ?? 'file');
  return {
    id,
    orderId,
    name,
    kind:           isOrderFileKind(d.kind) ? d.kind : 'other',
    note:           String(d.note ?? ''),
    contentType:    String(d.contentType ?? ''),
    size:           Number(d.size) || 0,
    uploadedByUid:  String(d.uploadedByUid ?? ''),
    uploadedByName: String(d.uploadedByName ?? ''),
    createdAt:      millis(d.createdAt),
    url:            await sign(orderId, id, name),
  };
}

/**
 * One order's files, oldest first. Sorted here rather than in the query:
 * `orderId ==` alone needs no composite index, and one load's files are few.
 */
export async function listOrderFiles(orderId: string): Promise<OrderFile[]> {
  const snap = await adminDb.collection(ORDER_FILES_COLLECTION).where('orderId', '==', orderId).get();
  const files = await Promise.all(snap.docs.map((doc) => toOrderFile(doc.id, doc.data())));
  return files.sort((a, b) => a.createdAt - b.createdAt);
}
