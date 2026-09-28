'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { LoadPhoto } from '@/types/loadPhoto';
import { CoverMark, StageBadge } from './PhotoBits';

interface Props {
  photos: LoadPhoto[];
  coverPhotoId: string | null;
  onOpen: (index: number) => void;
  /** Tile height in px. Width follows each picture's own shape. */
  height?: number;
}

/**
 * A load's pictures in a row, sliding left to right, oldest first — the order
 * they were taken in, so the reel reads as the load's story from dock to door.
 *
 * Native horizontal scrolling with snap points rather than a carousel library:
 * a trackpad, a shift-wheel, a finger and the two arrow buttons all move it,
 * and none of them fight each other. Tiles keep each picture's own shape
 * instead of cropping to a square, because the edge of a photo is often the
 * part that shows how the freight was strapped.
 */
export default function PhotoReel({ photos, coverPhotoId, onOpen, height = 176 }: Props) {
  const track = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd]     = useState(true);

  function measure() {
    const el = track.current;
    if (!el) return;
    setAtStart(el.scrollLeft <= 2);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 2);
  }

  useEffect(() => {
    measure();
    const el = track.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [photos.length]);

  function slide(direction: 1 | -1) {
    const el = track.current;
    if (!el) return;
    // Most of a screenful, so the last tile of this view is still in sight
    // after the move and the reader does not lose their place.
    el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: 'smooth' });
  }

  return (
    <div className="relative group">
      <div
        ref={track}
        onScroll={measure}
        className="flex gap-3 overflow-x-auto snap-x snap-mandatory scroll-smooth pb-2 tab-scroll"
      >
        {photos.map((p, i) => {
          const ratio = p.width && p.height ? p.width / p.height : 4 / 3;
          // Clamped so a panorama does not fill the whole strip and a tall
          // shot of a label does not become a sliver.
          const width = Math.round(height * Math.min(Math.max(ratio, 0.6), 2));
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onOpen(i)}
              style={{ width, height }}
              className="relative flex-shrink-0 snap-start rounded-lg overflow-hidden bg-gray-100 border border-gray-200 hover:ring-2 hover:ring-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500 transition"
              title={p.caption || 'Open picture'}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- signed link to a private bucket */}
              <img src={p.thumbUrl} alt={p.caption} loading="lazy" className="w-full h-full object-cover" />
              <span className="absolute left-1.5 bottom-1.5"><StageBadge stage={p.stage} /></span>
              {p.id === coverPhotoId && <CoverMark className="absolute right-1.5 top-1.5 w-5 h-5" />}
            </button>
          );
        })}
      </div>

      {!atStart && (
        <button type="button" onClick={() => slide(-1)} aria-label="Previous pictures"
          className="absolute left-1 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/90 border border-gray-200 shadow flex items-center justify-center text-gray-700 hover:bg-white">
          <ChevronLeft className="w-5 h-5" />
        </button>
      )}
      {!atEnd && (
        <button type="button" onClick={() => slide(1)} aria-label="More pictures"
          className="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/90 border border-gray-200 shadow flex items-center justify-center text-gray-700 hover:bg-white">
          <ChevronRight className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}
