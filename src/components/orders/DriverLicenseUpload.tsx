'use client';

import { useRef, useState } from 'react';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from '@/lib/firebase';

interface Props {
  orderId: string;
  existingPath: string | null;
  onUploaded: (storagePath: string | null) => void;
  readOnly?: boolean;
}

export default function DriverLicenseUpload({ orderId, existingPath, onUploaded, readOnly }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [removing, setRemoving] = useState(false);

  async function handleFile(file: File) {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setError('File must be under 10 MB');
      return;
    }
    setError('');
    const path = `driver-licenses/${orderId}/${Date.now()}_${file.name}`;
    const storageRef = ref(storage, path);
    const task = uploadBytesResumable(storageRef, file);

    task.on(
      'state_changed',
      (snap) => setProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
      (err) => { setError(err.message); setProgress(null); },
      () => { setProgress(null); onUploaded(path); },
    );
  }

  async function handleRemove() {
    if (!existingPath) return;
    setRemoving(true);
    try {
      await deleteObject(ref(storage, existingPath));
    } catch {
      // ignore — file may already be gone
    } finally {
      setRemoving(false);
      onUploaded(null);
    }
  }

  if (existingPath && progress === null) {
    return (
      <div className="flex items-center gap-3">
        <DownloadLink storagePath={existingPath} />
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
      </div>
    );
  }

  return (
    <div>
      {progress !== null ? (
        <div className="flex items-center gap-2">
          <div className="flex-1 bg-gray-200 rounded-full h-1.5">
            <div className="bg-brand-500 h-1.5 rounded-full transition-all" style={{ width: `${progress}%` }} />
          </div>
          <span className="text-xs text-gray-500">{progress}%</span>
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="text-xs text-brand-600 hover:text-brand-700 border border-brand-200 bg-brand-50 rounded-lg px-3 py-1.5 font-medium transition hover:bg-brand-100"
          >
            Upload License
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*,.pdf"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
          />
        </>
      )}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}

function DownloadLink({ storagePath }: { storagePath: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function open() {
    setLoading(true);
    try {
      const u = await getDownloadURL(ref(storage, storagePath));
      setUrl(u);
      window.open(u, '_blank');
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={url ? () => window.open(url, '_blank') : open}
      disabled={loading}
      className="text-xs text-brand-600 hover:underline disabled:opacity-50"
    >
      {loading ? 'Loading…' : 'View License'}
    </button>
  );
}
