'use client';

import { Truck } from 'lucide-react';
import { clock } from '@/lib/chatFormat';
import type { ChatMessage } from '@/types/conversation';

/**
 * A line from TTMS itself — "Carrier signed", "BOL added".
 *
 * A centred line rather than a bubble, and that is the whole design of it.
 * These sit among messages from colleagues, and an automated notice drawn like
 * a person saying something is a notice people answer, argue with, and
 * eventually stop reading. Shaped like the day divider above it instead, which
 * the room already reads as "the room telling you something" rather than as
 * somebody speaking.
 *
 * Inert by consequence: no arrow menu, no reactions, no thread. Anything worth
 * saying about an alert is said in the room under it, by a person, in a
 * bubble.
 */
export default function SystemMessage({ message }: { message: ChatMessage }) {
  return (
    <div className="flex justify-center py-1.5">
      <span className="flex max-w-[85%] items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[11px] text-gray-600 shadow-sm">
        <Truck size={11} className="flex-shrink-0 text-brand-500" />
        <span className="truncate">{message.text}</span>
        <span className="flex-shrink-0 text-gray-400">{clock(message)}</span>
      </span>
    </div>
  );
}
