'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useStorageUrl } from '@/lib/useStorageUrl';
import type { StickerRef } from '@/types/sticker';
import StickerLibraryMenu from './StickerLibraryMenu';

/** Longest side of a sticker drawn in the thread. */
const SHOWN_EDGE = 144;

/**
 * A sticker somebody sent, drawn in the thread.
 *
 * Clicking it opens the favourites-and-folders menu, which is how a sticker
 * spreads: somebody sends one, somebody else stars it. Removing it from the
 * company set is not offered here — that belongs in the picker, where the
 * shelf is what is being looked at, and not on a message that stays sent
 * either way.
 */
export default function StickerMessage({ sticker }: { sticker: StickerRef }) {
  const url = useStorageUrl(sticker.path);
  const [menuAt, setMenuAt] = useState<DOMRect | null>(null);

  // The space is held from the stored size before the picture arrives, so the
  // thread does not jump as each one loads.
  const scale  = Math.min(1, SHOWN_EDGE / Math.max(sticker.width || 1, sticker.height || 1));
  const width  = Math.round((sticker.width || SHOWN_EDGE) * scale);
  const height = Math.round((sticker.height || SHOWN_EDGE) * scale);

  return (
    <>
      <button
        type="button"
        title={`${sticker.name} — click to save it`}
        onClick={(e) => setMenuAt(e.currentTarget.getBoundingClientRect())}
        style={{ width, height }}
        className="block transition hover:opacity-90"
      >
        {url ? (
          <Image src={url} alt={sticker.name} width={width} height={height} unoptimized className="h-full w-full object-contain" />
        ) : (
          <span className="block h-full w-full animate-pulse rounded-lg bg-black/5" />
        )}
      </button>
      {menuAt && (
        <StickerLibraryMenu stickerId={sticker.id} anchor={menuAt} onClose={() => setMenuAt(null)} />
      )}
    </>
  );
}
