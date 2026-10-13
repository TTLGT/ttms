'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Download, X } from 'lucide-react';

/**
 * An agreement PDF shown on screen, for reading a version without saving a
 * file. Drawn by the browser's own PDF viewer in a frame, from the same
 * render the PDF button downloads — so what is previewed is exactly the copy
 * that was sent or signed, never the order as it stands today.
 *
 * In-page rather than a new tab: the file is fetched with the ID token first,
 * and a tab opened after that wait is what pop-up blockers stop.
 *
 * Staff only. The signing link itself is never opened here, so nobody can
 * sign for a client or carrier from it.
 */
export default function AgreementPdfPreview({ url, title, onClose, onDownload }: {
  /** A `blob:` URL; the caller revokes it on close. */
  url: string;
  title: string;
  onClose: () => void;
  onDownload: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-2 sm:p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="flex h-full w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
        <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
          <h2 className="truncate text-sm font-semibold text-gray-900">{title}</h2>
          <div className="flex shrink-0 items-center gap-2">
            <button type="button" onClick={onDownload}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50">
              <Download className="h-3.5 w-3.5" /> Download
            </button>
            <button type="button" onClick={onClose} aria-label="Close preview"
              className="rounded-lg p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-900">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <iframe src={url} title={title} className="min-h-0 w-full flex-1 bg-gray-100" />
      </div>
    </div>,
    document.body,
  );
}
