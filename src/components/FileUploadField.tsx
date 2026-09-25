'use client';

import { useRef, useState } from 'react';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from '@/lib/firebase';

interface Props {
  /** Top-level folder in the bucket, e.g. `carrier-insurance`. Must be a prefix storage.rules knows. */
  storagePrefix: string;
  /**
   * The record the file belongs to, or null on a form for one that does not
   * exist yet — the add forms upload before the record is written, and a draft
   * key is minted for them.
   */
  recordId: string | null;
  /** The stored path, or null when nothing has been uploaded. */
  value: string | null;
  onChange: (storagePath: string | null) => void;
  uploadLabel: string;
  viewLabel: string;
  readOnly?: boolean;
  maxBytes?: number;
  accept?: string;
}

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;

/**
 * Upload, view and remove one file held as a path on a record.
 *
 * Files are filed at `{prefix}/{recordId}/{timestamp}_{name}`, and **Remove
 * only deletes the object when the path sits under this record's own folder.**
 * That rule is the whole reason this is shared rather than copied: a path can
 * be pointed at by more than one record — a driver's licence uploaded against
 * an order and later carried onto the driver's own record is the live case —
 * and deleting it from the second record would break the first. Anything
 * outside this record's folder has its reference dropped instead.
 *
 * Uploading before the record exists leaves an object nothing points at if the
 * form is then abandoned. That is deliberate: holding the bytes in memory
 * until save instead means a failed save loses the upload.
 */
export default function FileUploadField({
  storagePrefix,
  recordId,
  value,
  onChange,
  uploadLabel,
  viewLabel,
  readOnly,
  maxBytes = DEFAULT_MAX_BYTES,
  accept = 'image/*,.pdf',
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  // Minted on the first upload for a record with no id, and kept for the life
  // of the form so re-uploading does not scatter files.
  const draftKey = useRef<string>('');
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError]       = useState('');
  const [removing, setRemoving] = useState(false);

  function folder(): string {
    if (recordId) return recordId;
    if (!draftKey.current) {
      draftKey.current = `new-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    }
    return draftKey.current;
  }

  function handleFile(file: File) {
    if (!file) return;
    if (file.size > maxBytes) {
      setError(`File must be under ${Math.round(maxBytes / (1024 * 1024))} MB`);
      return;
    }
    setError('');
    const path = `${storagePrefix}/${folder()}/${Date.now()}_${file.name}`;
    const task = uploadBytesResumable(ref(storage, path), file);

    task.on(
      'state_changed',
      (snap) => setProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
      (err) => { setError(err.message); setProgress(null); },
      () => { setProgress(null); onChange(path); },
    );
  }

  async function handleRemove() {
    if (!value) return;
    setRemoving(true);
    try {
      // See the note above: only ours to delete.
      if (value.startsWith(`${storagePrefix}/${folder()}/`)) {
        await deleteObject(ref(storage, value));
      }
    } catch {
      // Ignore — the object may already be gone, and the reference should be
      // dropped either way rather than leaving a link to nothing.
    } finally {
      setRemoving(false);
      onChange(null);
    }
  }

  if (progress !== null) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex-1 bg-gray-200 rounded-full h-1.5">
          <div className="bg-brand-500 h-1.5 rounded-full transition-all" style={{ width: `${progress}%` }} />
        </div>
        <span className="text-xs text-gray-500">{progress}%</span>
      </div>
    );
  }

  if (value) {
    const name = fileNameOf(value);
    return (
      <div className="flex items-center gap-3 min-w-0">
        {name && <span className="text-sm text-gray-700 truncate min-w-0" title={name}>{name}</span>}
        <DownloadLink storagePath={value} label={viewLabel} />
        {!readOnly && (
          <button
            type="button"
            onClick={handleRemove}
            disabled={removing}
            className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
          >
            {removing ? 'Removing…' : 'Remove'}
          </button>
        )}
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    );
  }

  if (readOnly) return <p className="text-sm text-gray-400">—</p>;

  return (
    <div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="text-xs text-brand-600 hover:text-brand-700 border border-brand-200 bg-brand-50 rounded-lg px-3 py-1.5 font-medium transition hover:bg-brand-100"
      >
        {uploadLabel}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
      />
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}

/**
 * The name the file had on the uploader's computer, read back off the path —
 * the last segment is `{timestamp}_{name}` (see above), so it needs no field
 * of its own. It is what tells "COI 2026" from last year's copy without
 * opening it. '' for a path in some other shape, which then shows the link
 * alone, as before.
 */
function fileNameOf(storagePath: string): string {
  const last = storagePath.split('/').pop() ?? '';
  const m = /^\d+_(.+)$/.exec(last);
  return m ? m[1] : '';
}

function DownloadLink({ storagePath, label }: { storagePath: string; label: string }) {
  const [url, setUrl]         = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed]   = useState(false);

  async function open() {
    setLoading(true);
    setFailed(false);
    try {
      const u = await getDownloadURL(ref(storage, storagePath));
      setUrl(u);
      window.open(u, '_blank');
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={url ? () => window.open(url, '_blank') : open}
        disabled={loading}
        className="text-xs text-brand-600 hover:underline disabled:opacity-50"
      >
        {loading ? 'Loading…' : label}
      </button>
      {failed && <span className="text-xs text-red-500">Could not open the file</span>}
    </>
  );
}
