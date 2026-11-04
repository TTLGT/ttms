'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { FileText, Loader2, Paperclip, X, AlertCircle } from 'lucide-react';
import { uploadItFile, type UploadedFile } from '@/lib/itTickets';
import { formatFileSize } from '@/types/orderFile';
import { MAX_ATTACHMENTS_PER_MESSAGE } from '@/types/itTicket';

/**
 * Files being attached to a ticket or a reply.
 *
 * Each file starts uploading the moment it is added — picked, pasted or
 * dropped — so pressing Send only has to wait for whatever is still going.
 * A pasted screenshot is the common case and the one this is shaped around:
 * people press Print Screen and Ctrl+V far more readily than they save a file
 * and go looking for it.
 */

interface DraftFile {
  key: string;
  file: File;
  preview: string | null;
  progress: number;
  done: UploadedFile | null;
  error: string;
}

export interface AttachmentDraft {
  items: DraftFile[];
  add: (files: FileList | File[]) => void;
  remove: (key: string) => void;
  clear: () => void;
  busy: boolean;
  failed: boolean;
  /** Everything that finished, in the order it was added. */
  uploaded: () => UploadedFile[];
  /** For a textarea: pasting an image attaches it. */
  onPaste: (e: React.ClipboardEvent) => void;
}

export function useAttachmentDraft(): AttachmentDraft {
  const [items, setItems] = useState<DraftFile[]>([]);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  // Object URLs for the thumbnails are released when the draft goes away.
  useEffect(() => () => {
    for (const i of itemsRef.current) if (i.preview) URL.revokeObjectURL(i.preview);
  }, []);

  const patch = (key: string, p: Partial<DraftFile>) =>
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...p } : i)));

  const add = useCallback((list: FileList | File[]) => {
    const room = MAX_ATTACHMENTS_PER_MESSAGE - itemsRef.current.length;
    const files = Array.from(list).slice(0, Math.max(0, room));
    const fresh = files.map((file): DraftFile => ({
      key: crypto.randomUUID(),
      file,
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
      progress: 0,
      done: null,
      error: '',
    }));
    setItems((prev) => [...prev, ...fresh]);
    for (const d of fresh) {
      uploadItFile(d.file, (pct) => patch(d.key, { progress: pct }))
        .then((done) => patch(d.key, { done, progress: 100 }))
        .catch((e: Error) => patch(d.key, { error: e.message }));
    }
  }, []);

  const remove = useCallback((key: string) => {
    setItems((prev) => {
      const gone = prev.find((i) => i.key === key);
      if (gone?.preview) URL.revokeObjectURL(gone.preview);
      return prev.filter((i) => i.key !== key);
    });
  }, []);

  const clear = useCallback(() => {
    setItems((prev) => {
      for (const i of prev) if (i.preview) URL.revokeObjectURL(i.preview);
      return [];
    });
  }, []);

  const onPaste = useCallback((e: React.ClipboardEvent) => {
    const files = Array.from(e.clipboardData.files ?? []);
    if (files.length === 0) return;
    e.preventDefault();
    add(files);
  }, [add]);

  return {
    items,
    add,
    remove,
    clear,
    busy: items.some((i) => !i.done && !i.error),
    failed: items.some((i) => i.error !== ''),
    uploaded: () => items.filter((i) => i.done).map((i) => i.done as UploadedFile),
    onPaste,
  };
}

/** The paperclip button. */
export function AttachButton({ draft, label = 'Attach files' }: { draft: AttachmentDraft; label?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const full = draft.items.length >= MAX_ATTACHMENTS_PER_MESSAGE;
  return (
    <>
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={full}
        title={full ? `At most ${MAX_ATTACHMENTS_PER_MESSAGE} files at a time` : 'Pictures, PDFs, documents — up to 25 MB each'}
        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
      >
        <Paperclip size={15} />
        {label}
      </button>
      <input
        ref={input}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) draft.add(e.target.files);
          e.target.value = '';
        }}
      />
    </>
  );
}

/** What has been attached so far, with progress and a way to take each back. */
export function AttachmentTray({ draft }: { draft: AttachmentDraft }) {
  if (draft.items.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-2">
      {draft.items.map((i) => (
        <li
          key={i.key}
          className={`relative flex w-44 items-center gap-2 rounded-lg border bg-white p-1.5 pr-7 text-xs ${
            i.error ? 'border-red-300' : 'border-gray-200'
          }`}
        >
          {i.preview ? (
            // eslint-disable-next-line @next/next/no-img-element -- a local object URL, nothing to optimise
            <img src={i.preview} alt="" className="h-9 w-9 flex-shrink-0 rounded object-cover" />
          ) : (
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded bg-gray-100 text-gray-500">
              <FileText size={16} />
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium text-gray-800" title={i.file.name}>{i.file.name}</span>
            {i.error ? (
              <span className="flex items-center gap-1 text-red-600" title={i.error}>
                <AlertCircle size={11} /> Failed
              </span>
            ) : i.done ? (
              <span className="text-gray-500">{formatFileSize(i.file.size)}</span>
            ) : (
              <span className="flex items-center gap-1 text-gray-500">
                <Loader2 size={11} className="animate-spin" /> {i.progress}%
              </span>
            )}
          </span>
          <button
            type="button"
            onClick={() => draft.remove(i.key)}
            aria-label={`Remove ${i.file.name}`}
            className="absolute right-1 top-1 rounded p-0.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
          >
            <X size={13} />
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * Wraps an area so files dropped anywhere on it are attached, with an
 * outline while something is being dragged over.
 */
export function DropZone({ draft, children, className = '' }: {
  draft: AttachmentDraft;
  children: React.ReactNode;
  className?: string;
}) {
  const [over, setOver] = useState(false);
  return (
    <div
      className={`${className} ${over ? 'ring-2 ring-brand-400 ring-offset-2' : ''} rounded-xl transition`}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={(e) => {
        if (e.dataTransfer.files.length === 0) return;
        e.preventDefault();
        setOver(false);
        draft.add(e.dataTransfer.files);
      }}
    >
      {children}
    </div>
  );
}
