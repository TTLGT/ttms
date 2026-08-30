'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Download, FileText, X } from 'lucide-react';
import { useStorageUrl } from '@/lib/useStorageUrl';
import { readableSize } from '@/lib/chatUploads';
import type { Attachment } from '@/types/conversation';

/**
 * Photos and files hanging off a message.
 *
 * Images are drawn inline, because the whole reason a broker sends one is for
 * somebody to look at it without a round trip through a download folder. Every
 * other kind of file is a row you can click, since nothing useful can be shown
 * of a PDF in a chat bubble anyway.
 */
export default function MessageAttachments({ attachments }: { attachments: Attachment[] }) {
  const [lightbox, setLightbox] = useState<Attachment | null>(null);

  if (attachments.length === 0) return null;

  return (
    <div className="mb-1 flex flex-col gap-1.5">
      {attachments.map((a) =>
        a.isImage
          ? <InlineImage key={a.path} attachment={a} onOpen={() => setLightbox(a)} />
          : <FileRow key={a.path} attachment={a} />,
      )}
      {lightbox && <Lightbox attachment={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}

function InlineImage({
  attachment, onOpen,
}: { attachment: Attachment; onOpen: () => void }) {
  const url = useStorageUrl(attachment.path);

  if (!url) {
    // A fixed block rather than nothing, so the thread does not jump as each
    // image's URL resolves a moment after the text.
    return <div className="h-32 w-44 animate-pulse rounded-lg bg-black/10" />;
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      title={`${attachment.name} — click to see it full size`}
      className="block overflow-hidden rounded-lg transition hover:opacity-90"
    >
      <Image
        src={url}
        alt={attachment.name}
        width={320}
        height={240}
        unoptimized
        // Bounded rather than fixed: a BOL photographed in portrait and a rate
        // sheet scanned in landscape both have to sit in the same bubble.
        className="h-auto max-h-60 w-auto max-w-full object-contain"
      />
    </button>
  );
}

function FileRow({ attachment }: { attachment: Attachment }) {
  const url = useStorageUrl(attachment.path);

  return (
    <a
      href={url ?? undefined}
      target="_blank"
      rel="noopener noreferrer"
      className={`flex items-center gap-2.5 rounded-lg bg-black/[0.06] px-2.5 py-2 transition ${
        url ? 'hover:bg-black/[0.1]' : 'pointer-events-none opacity-60'
      }`}
    >
      <FileText size={18} className="flex-shrink-0 opacity-50" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium">{attachment.name}</span>
        <span className="block text-[10px] opacity-60">{readableSize(attachment.size)}</span>
      </span>
      <Download size={14} className="flex-shrink-0 opacity-40" />
    </a>
  );
}

/**
 * A photo at full size.
 *
 * A bubble is big enough to tell that a BOL is a BOL and too small to read the
 * weight on it, which is the whole reason this exists. Closes on Escape, on the
 * backdrop and on the button — three ways out, because a picture covering the
 * screen with no visible exit is alarming.
 */
function Lightbox({ attachment, onClose }: { attachment: Attachment; onClose: () => void }) {
  const url = useStorageUrl(attachment.path);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={attachment.name}
      onClick={onClose}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
    >
      <div className="relative" onClick={(e) => e.stopPropagation()}>
        {url && (
          <Image
            src={url}
            alt={attachment.name}
            width={1400}
            height={1000}
            unoptimized
            className="h-auto max-h-[80vh] w-auto max-w-full rounded-xl object-contain shadow-2xl"
          />
        )}
        <p className="mt-3 text-center text-sm text-white">{attachment.name}</p>
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
