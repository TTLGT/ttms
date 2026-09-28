'use client';

import { Package, Star } from 'lucide-react';
import { PHOTO_STAGE_LABEL, type PhotoStage } from '@/types/loadPhoto';

/** Small pieces shared by every picture view. */

export const STAGE_COLOR: Record<PhotoStage, string> = {
  pickup:     'bg-blue-50 text-blue-700 border-blue-200',
  in_transit: 'bg-amber-50 text-amber-700 border-amber-200',
  delivery:   'bg-green-50 text-green-700 border-green-200',
  // Red because a damage photo is the one somebody will be looking for.
  damage:     'bg-red-50 text-red-700 border-red-200',
  other:      'bg-gray-100 text-gray-600 border-gray-200',
};

export function StageBadge({ stage }: { stage: PhotoStage }) {
  return (
    <span className={`inline-flex items-center text-[11px] font-medium border rounded-full px-2 py-0.5 whitespace-nowrap ${STAGE_COLOR[stage]}`}>
      {PHOTO_STAGE_LABEL[stage]}
    </span>
  );
}

/** The mark on a load's profile picture wherever pictures are listed. */
export function CoverMark({ className = '' }: { className?: string }) {
  return (
    <span title="Profile picture"
      className={`inline-flex items-center justify-center rounded-full bg-amber-400 text-white shadow ${className}`}>
      <Star className="w-3 h-3" fill="currentColor" />
    </span>
  );
}

/**
 * A load's profile picture, or a plain box when it has none.
 *
 * The box is drawn rather than nothing so that a column of order numbers stays
 * lined up whether or not each load has a picture.
 */
export function OrderCoverThumb(
  { url, size = 32, className = '', alt = '' }:
  { url: string | null | undefined; size?: number; className?: string; alt?: string },
) {
  const style = { width: size, height: size };
  if (!url) {
    return (
      <span style={style}
        className={`inline-flex items-center justify-center rounded-md bg-gray-100 text-gray-400 flex-shrink-0 ${className}`}>
        <Package style={{ width: size * 0.5, height: size * 0.5 }} />
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a signed link to a private bucket; next/image would proxy and cache it server-side
    <img src={url} alt={alt} style={style} loading="lazy"
      className={`rounded-md object-cover bg-gray-100 flex-shrink-0 ${className}`} />
  );
}
