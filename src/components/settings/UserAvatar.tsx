'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { X } from 'lucide-react';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from '@/lib/firebase';

/**
 * Profile photos for the access list.
 *
 * What is stored on the user is the storage path, never the download URL: URLs
 * carry a token and can be regenerated, so a saved one goes stale. The path is
 * resolved to a URL at render time and cached here, because the list renders
 * every row on each keystroke in the editor and a fetch per render would be
 * both slow and pointless.
 */
const urlCache = new Map<string, string>();

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

function usePhotoUrl(photoPath: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(() =>
    photoPath ? urlCache.get(photoPath) ?? null : null,
  );

  useEffect(() => {
    if (!photoPath) {
      setUrl(null);
      return;
    }

    const cached = urlCache.get(photoPath);
    if (cached) {
      setUrl(cached);
      return;
    }

    let live = true;
    getDownloadURL(ref(storage, photoPath))
      .then((resolved) => {
        urlCache.set(photoPath, resolved);
        if (live) setUrl(resolved);
      })
      // A missing file just falls back to the initial — it is not worth an error.
      .catch(() => {});

    return () => { live = false; };
  }, [photoPath]);

  return url;
}

/**
 * The photo at full size, over the page.
 *
 * A directory circle is big enough to recognise someone and too small to see
 * them, which is the whole reason this exists. Closes on Escape, on the
 * backdrop and on the button — three ways out, because a picture covering the
 * screen with no visible exit is alarming.
 */
function PhotoLightbox({
  url,
  name,
  onClose,
}: {
  url: string;
  name: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={name ? `Photo of ${name}` : 'Photo'}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
    >
      {/* The click that closes belongs to the backdrop alone — clicking the
          photo itself must not dismiss the thing you just opened. */}
      <div className="relative" onClick={(e) => e.stopPropagation()}>
        <Image
          src={url}
          alt={name}
          width={720}
          height={720}
          unoptimized
          className="h-auto max-h-[80vh] w-auto max-w-full rounded-xl object-contain shadow-2xl"
        />
        {name && <p className="mt-3 text-center text-sm text-white">{name}</p>}
        <button
          type="button"
          onClick={onClose}
          title="Close"
          className="absolute -right-3 -top-3 rounded-full bg-white p-1.5 text-gray-500 shadow-lg transition hover:text-gray-900"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

/** The circle at the head of each row: the photo, or the initial as before. */
export function UserAvatar({
  photoPath,
  fallback,
  muted,
  size = 36,
  expandable,
  name,
}: {
  photoPath: string | null | undefined;
  /** Shown when there is no photo — the first letter of the name or email. */
  fallback: string;
  muted?: boolean;
  size?: number;
  /** Click the circle to see the photo full size. */
  expandable?: boolean;
  /** Captions the enlarged photo, and names it for a screen reader. */
  name?: string;
}) {
  const url = usePhotoUrl(photoPath);
  const [open, setOpen] = useState(false);

  if (url) {
    const circle = (
      <Image
        src={url}
        alt=""
        width={size}
        height={size}
        unoptimized
        className={`rounded-full object-cover flex-shrink-0 ${muted ? 'opacity-50 grayscale' : ''}`}
        style={{ width: size, height: size }}
      />
    );

    // Only a real photo is worth enlarging. An initial is the same initial at
    // any size, so that circle stays a plain, unclickable one.
    if (!expandable) return circle;

    return (
      <>
        <button
          type="button"
          onClick={() => setOpen(true)}
          title={name ? `See ${name}'s photo full size` : 'See the photo full size'}
          className="flex-shrink-0 cursor-zoom-in rounded-full focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-2"
        >
          {circle}
        </button>
        {open && (
          <PhotoLightbox url={url} name={name ?? ''} onClose={() => setOpen(false)} />
        )}
      </>
    );
  }

  return (
    <div
      // The initial is sized off the circle rather than fixed, so the same
      // component reads right at 36px in a settings row and at 64px on a
      // directory card. A fixed `text-sm` left a large circle looking empty.
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
      className={`rounded-full flex items-center justify-center font-semibold flex-shrink-0 ${
        muted ? 'bg-gray-200 text-gray-400' : 'bg-brand-100 text-brand-700'
      }`}
    >
      {fallback}
    </div>
  );
}

/**
 * Upload and remove controls. Both take effect immediately rather than waiting
 * for the editor's Save — the file is already in Storage by then, and leaving
 * the record out of step with the bucket is how orphans happen.
 */
export function AvatarUploader({
  email,
  photoPath,
  onChange,
  disabled,
}: {
  email: string;
  photoPath: string | null | undefined;
  onChange: (photoPath: string | null) => Promise<void>;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleFile(file: File) {
    if (!file.type.startsWith('image/')) {
      setError('Choose an image file.');
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setError('Image must be under 5 MB.');
      return;
    }

    setError('');
    const extension = file.name.includes('.') ? file.name.split('.').pop() : 'jpg';
    const path = `avatars/${email}/${Date.now()}.${extension}`;
    const task = uploadBytesResumable(ref(storage, path), file);

    task.on(
      'state_changed',
      (snap) => setProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
      (err) => { setError(err.message); setProgress(null); },
      async () => {
        setProgress(null);
        const previous = photoPath;
        try {
          await onChange(path);
          // Only once the record points at the new file — deleting first would
          // strand the row on a file that is already gone if the save fails.
          if (previous) await deleteObject(ref(storage, previous)).catch(() => {});
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Could not save the photo.');
        }
      },
    );
  }

  async function handleRemove() {
    if (!photoPath) return;
    setBusy(true);
    setError('');
    try {
      await onChange(null);
      await deleteObject(ref(storage, photoPath)).catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove the photo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <UserAvatar photoPath={photoPath} fallback={email.charAt(0).toUpperCase()} size={48} />

      <div className="min-w-0">
        {progress !== null ? (
          <div className="flex items-center gap-2 w-40">
            <div className="flex-1 bg-gray-200 rounded-full h-1.5">
              <div
                className="bg-brand-500 h-1.5 rounded-full transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-xs text-gray-500">{progress}%</span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={disabled || busy}
              className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-100 transition disabled:opacity-50"
            >
              {photoPath ? 'Replace photo' : 'Upload photo'}
            </button>
            {photoPath && (
              <button
                type="button"
                onClick={handleRemove}
                disabled={disabled || busy}
                className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
              >
                {busy ? 'Removing…' : 'Remove'}
              </button>
            )}
          </div>
        )}

        <p className="text-[11px] text-gray-400 mt-1">
          JPG or PNG, under 5 MB. Saved as soon as it uploads.
        </p>
        {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.target.value = '';
        }}
      />
    </div>
  );
}
