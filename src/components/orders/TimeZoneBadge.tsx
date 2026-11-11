'use client';

import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import type { Address } from '@/types/order';
import { toDate, type DateLike } from '@/lib/dateFormat';
import {
  isDaylightSaving, localTime, timeZoneForAddress, versusOffice, zoneAbbreviation, zoneName,
} from '@/lib/timeZones';

/**
 * The stop's own clock: "2:14 PM CST", with the zone, daylight saving and the
 * difference from the office on hover. Draws nothing when the address does not
 * name a state we can place.
 *
 * `on` is the stop's date, when it has one. If the zone will be on a different
 * footing that day — a pickup booked in October for a day after the clocks go
 * back — the badge says so, because "they open at 7" means 7 on *that* day's
 * clock, and the office is an hour closer to or further from it than today.
 */
export default function TimeZoneBadge({ address, on, className = '' }: {
  address: Partial<Address> | null | undefined;
  on?: DateLike;
  className?: string;
}) {
  // Null until mounted so the server render and the first client render agree,
  // then ticks every 30 seconds — often enough that the minute is never more
  // than half a minute stale.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const zone = timeZoneForAddress(address);
  if (!zone || !now) return null;

  const abbr = zoneAbbreviation(zone, now);
  const dst = isDaylightSaving(zone, now);
  const footing = dst === null ? 'no daylight saving' : dst ? 'daylight saving time' : 'standard time';

  // Noon on the stop's day sidesteps the 2am change itself.
  const day = toDate(on ?? null);
  const onDay = day ? new Date(day.getFullYear(), day.getMonth(), day.getDate(), 12) : null;
  const abbrThen = onDay ? zoneAbbreviation(zone, onDay) : abbr;
  // Only a stop still ahead gets the note. It exists to warn that a time
  // agreed today will be on a different clock when the truck gets there; on a
  // stop already past there is nothing left to arrange, and the note only
  // read as a warning about a day that had gone.
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  const ahead = onDay !== null && onDay >= today;
  const changes = ahead && abbrThen !== abbr;

  const title = [
    `${zoneName(zone)} — ${footing} (${abbr}) now`,
    versusOffice(zone, now),
    changes && onDay ? `On the stop's date it will be ${abbrThen}: ${versusOffice(zone, onDay).toLowerCase()}` : '',
  ].filter(Boolean).join('\n');

  return (
    <span
      title={title}
      data-learn-skip
      className={`inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-700 whitespace-nowrap ${className}`}
    >
      <Clock className="w-3 h-3 text-gray-500" aria-hidden />
      <span>{localTime(zone, now)} {abbr}</span>
      {changes ? <span className="text-amber-700">· {abbrThen} that day</span> : null}
    </span>
  );
}
