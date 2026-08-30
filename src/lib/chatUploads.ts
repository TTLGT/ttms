'use client';

import { deleteObject, getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import { storage } from './firebase';
import { MAX_ATTACHMENT_BYTES, type Attachment } from '@/types/conversation';

/**
 * Photos and files sent in a conversation.
 *
 * ## What protects these files, and what does not
 *
 * Storage rules cannot read Firestore — that limit is documented at the top of
 * storage.rules — so they cannot ask whether the person fetching a file is in
 * the room it was sent to. The bucket is gated on the `ttlAccess` claim and
 * nothing finer, which means **any signed-in TTMS user who knows a file's exact
 * path can fetch it**, private room or not.
 *
 * Two things stand between that and a real leak, and it is worth being precise
 * about which is which:
 *
 *  - The path is the only way in, and it is only written on the message
 *    document, which Firestore *does* gate on room membership. Somebody outside
 *    the room has no way to learn the path.
 *  - Every path carries a random id, so it cannot be guessed or walked from a
 *    conversation id.
 *
 * That is the same posture the BOLs, invoices and driver's licences in this app
 * have had since long before chat existed, so this adds no new class of
 * exposure. It is still weaker than the Firestore side, and the fix, if it is
 * ever wanted, is to serve attachments through an API route that checks
 * membership with the Admin SDK and hands back a short-lived signed URL.
 *
 * The size cap below is enforced here and not in the rules, for the same reason
 * — tightening the blanket bucket rule would touch every other upload in the
 * app. It stops accidents, not determined people.
 */

/** Where one conversation's files live. The random id is load-bearing — see above. */
function attachmentPath(conversationId: string, fileName: string): string {
  const id = crypto.randomUUID();
  // Anything that would change the shape of the path, or confuse a download
  // filename, is flattened. The original name is kept on the message.
  const safe = fileName.replace(/[^\w.\- ]+/g, '_').slice(-80);
  return `chat/${conversationId}/${id}-${safe}`;
}

export interface UploadHandle {
  /** Cancels an upload in flight. Safe to call after it has finished. */
  cancel: () => void;
}

/**
 * Uploads one file, reporting progress, and resolves to the attachment record
 * to hang on the message.
 */
export function uploadAttachment(
  conversationId: string,
  file: File,
  onProgress: (percent: number) => void,
): { promise: Promise<Attachment>; handle: UploadHandle } {
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return {
      promise: Promise.reject(
        new Error(`${file.name} is larger than 25 MB. Send it as a link instead.`),
      ),
      handle: { cancel: () => {} },
    };
  }

  const path = attachmentPath(conversationId, file.name);
  const task = uploadBytesResumable(ref(storage, path), file, {
    contentType: file.type || 'application/octet-stream',
  });

  const promise = new Promise<Attachment>((resolve, reject) => {
    task.on(
      'state_changed',
      (snap) => onProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
      (err) => reject(err),
      () => resolve({
        path,
        name:        file.name,
        contentType: file.type || 'application/octet-stream',
        size:        file.size,
        isImage:     file.type.startsWith('image/'),
      }),
    );
  });

  return { promise, handle: { cancel: () => task.cancel() } };
}

/**
 * Removes a file from the bucket.
 *
 * Called when somebody attaches a photo and then thinks better of it before
 * sending. Without this, every abandoned draft leaves a file nothing points at
 * and nothing will ever clean up.
 */
export async function discardAttachment(path: string): Promise<void> {
  await deleteObject(ref(storage, path)).catch(() => {
    // Already gone, or never finished uploading. Either way there is nothing
    // to do and nothing worth telling anyone about.
  });
}

/** A one-off URL, for opening a file that is not rendered inline. */
export async function attachmentUrl(path: string): Promise<string> {
  return getDownloadURL(ref(storage, path));
}

/** `184 KB`, `2.3 MB` — a size somebody can read at a glance. */
export function readableSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
