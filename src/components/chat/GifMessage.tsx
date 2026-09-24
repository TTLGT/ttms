'use client';

import { useState } from 'react';
import { gifItem } from '@/types/sticker';
import type { GifRef } from '@/types/gif';
import StickerLibraryMenu from './StickerLibraryMenu';

/** Longest side of a GIF drawn in the thread. Wider than a sticker: a GIF is a scene. */
const SHOWN_EDGE = 240;

/**
 * A GIF somebody sent, drawn in the thread, straight from Klipy.
 *
 * Clicking it opens the favourites-and-folders menu, like a sticker. A plain
 * <img> rather than next/image: the file is Klipy's, and there is nothing for
 * Next to optimise in an animation it would only flatten.
 *
 * One Klipy has since removed shows its title in a grey box rather than a
 * broken-image icon — see "Why a message stores the address" in
 * src/types/gif.ts.
 */
export default function GifMessage({ gif }: { gif: GifRef }) {
  const [menuAt, setMenuAt] = useState<DOMRect | null>(null);
  const [broken, setBroken] = useState(false);

  const scale  = Math.min(1, SHOWN_EDGE / Math.max(gif.width || 1, gif.height || 1));
  const width  = Math.round((gif.width || SHOWN_EDGE) * scale);
  const height = Math.round((gif.height || SHOWN_EDGE) * scale);

  return (
    <>
      <button
        type="button"
        title={`${gif.title || 'GIF'} — click to save it`}
        onClick={(e) => setMenuAt(e.currentTarget.getBoundingClientRect())}
        style={{ width, height }}
        className="relative block overflow-hidden rounded-lg bg-black/5 transition hover:opacity-90"
      >
        {broken ? (
          <span className="flex h-full w-full items-center justify-center p-2 text-center text-xs text-gray-500">
            {gif.title || 'GIF'} (no longer available)
          </span>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={gif.url}
            alt={gif.title || 'GIF'}
            width={width}
            height={height}
            loading="lazy"
            // Klipy has no need to know which of our pages a GIF was seen on.
            referrerPolicy="no-referrer"
            onError={() => setBroken(true)}
            className="h-full w-full object-cover"
          />
        )}
        <span className="pointer-events-none absolute bottom-1 left-1 rounded bg-black/50 px-1 text-[9px] font-bold leading-tight text-white">
          GIF
        </span>
      </button>
      {menuAt && (
        <StickerLibraryMenu item={gifItem(gif.id)} gif={gif} anchor={menuAt} onClose={() => setMenuAt(null)} />
      )}
    </>
  );
}
