/**
 * Any other file a load needs to keep — a lumper receipt, a scale ticket, a
 * customs entry, a permit, the client's own rate sheet, an email saved as PDF.
 *
 * The BOL, invoice, POD and licence each have one fixed slot on the order (see
 * orderDocument.ts); these are the "and everything else", any number of them,
 * any file type.
 *
 * Held to the same boundary as the BOL. A file attached to a load is
 * paperwork about whose freight it is and what it cost, so:
 *
 * - **The bucket prefix is create-only** (`order-files/` in storage.rules):
 *   the browser can put a file there and nothing else — no read, no
 *   overwrite, no delete. That is the BOL/POD arrangement, and it is used
 *   here rather than the load-photo one (uploading through a route) because
 *   a Vercel function refuses a body over 4.5 MB and a scanned customs packet
 *   is routinely bigger.
 * - **Nothing is a file of the order until the server says so.**
 *   `POST /api/orders/{id}/files` checks canSeeOrder(), checks that the object
 *   is really in that order's own folder, and only then writes the record.
 *   A file uploaded and never registered is unreachable and harmless.
 * - **Reads are signed links** from `GET /api/orders/{id}/files`, after the
 *   same check. The `orderFiles` collection is closed to the client SDK.
 *
 * Top-level rather than a subcollection of `orders` for the same reason as
 * `loadPhotos`: a future cross-load listing on the Documents screen would
 * otherwise need a collection-group index this project's service account
 * cannot create.
 */

export const ORDER_FILES_COLLECTION = 'orderFiles';

/** What the file is. Free text says the rest; this is for scanning a list. */
export const ORDER_FILE_KINDS = [
  'signed_sa', 'rate_confirmation', 'receipt', 'customs', 'permit', 'insurance', 'correspondence', 'other',
] as const;
export type OrderFileKind = (typeof ORDER_FILE_KINDS)[number];

export const ORDER_FILE_KIND_LABEL: Record<OrderFileKind, string> = {
  /**
   * The client's Shipper Agreement signed some other way — on paper, by
   * email — and scanned or saved here. It is the proof that lets staff move a
   * load to Client Signed by hand; see `signedSaProof()` in
   * src/lib/signedSaProof.ts.
   */
  signed_sa:         'Signed SA',
  rate_confirmation: 'Rate confirmation',
  receipt:           'Receipt (lumper, fuel, scale…)',
  customs:           'Customs',
  permit:            'Permit',
  insurance:         'Insurance',
  correspondence:    'Correspondence',
  other:             'Other',
};

/**
 * What the "Other files" list offers and shows. `signed_sa` is filed through
 * the same upload and the same records, but it has its own place — the Signed
 * SA slot in Client Confirmation and on the Documents tab — so it is kept out
 * of the general list rather than being one more kind among receipts.
 */
export const OTHER_FILE_KINDS = ORDER_FILE_KINDS.filter((k) => k !== 'signed_sa');

/** A signed SA can be a scan or a phone photo: PDFs and pictures only. */
export const SIGNED_SA_ACCEPT = 'application/pdf,image/*';

export function isSignedSaUpload(contentType: string): boolean {
  return contentType === 'application/pdf' || contentType.startsWith('image/');
}

export function isOrderFileKind(value: unknown): value is OrderFileKind {
  return typeof value === 'string' && (ORDER_FILE_KINDS as readonly string[]).includes(value);
}

/**
 * 25 MB. Must match the size check on `order-files/` in storage.rules, which
 * is what actually enforces it — this copy is so the browser can say so before
 * a long upload fails at the end.
 */
export const MAX_ORDER_FILE_BYTES = 25 * 1024 * 1024;
/** A guard against a runaway upload, not a quota. */
export const MAX_FILES_PER_ORDER = 100;
export const MAX_ORDER_FILE_NOTE = 300;
export const MAX_ORDER_FILE_NAME = 200;

/**
 * An id the browser makes up before uploading. Checked by the server with the
 * same pattern — it becomes part of a bucket path and a document id, so
 * anything with a slash or a dot in it is refused rather than cleaned.
 */
export const ORDER_FILE_ID_RE = /^[A-Za-z0-9_-]{16,64}$/;

/**
 * Where a file lives. Worked out from the two ids, never stored and never taken
 * from a request — the same trick as loadPhotoPath(), so a record can only ever
 * name a file inside its own order's folder.
 */
export function orderFilePath(orderId: string, fileId: string): string {
  return `order-files/${orderId}/${fileId}`;
}

/** One file, as the browser receives it. Times are epoch milliseconds. */
export interface OrderFile {
  id: string;
  orderId: string;
  /** The name it had on the uploader's computer — what the download is called. */
  name: string;
  kind: OrderFileKind;
  note: string;
  contentType: string;
  size: number;
  uploadedByUid: string;
  uploadedByName: string;
  createdAt: number;
  /** Signed, short-lived. */
  url: string;
}

/** "1.4 MB", "820 KB". */
export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}
