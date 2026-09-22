'use client';

import { PartyPopper, Truck } from 'lucide-react';
import { clock } from '@/lib/chatFormat';
import type { ChatMessage } from '@/types/conversation';

/**
 * A line from the server itself, in one of two shapes — see SystemMessageKind.
 *
 * **An alert** is "Carrier signed", "BOL added": a centred line rather than a
 * bubble, and that is the whole design of it. These sit among messages from
 * colleagues, and an automated notice drawn like a person saying something is
 * a notice people answer, argue with, and eventually stop reading. Shaped like
 * the day divider above it instead, which the room already reads as "the room
 * telling you something" rather than as somebody speaking.
 *
 * **An announcement** is the company addressing the room — today, the daily
 * birthday and work-anniversary post. It is the same idea and a different
 * size, because the alert shape would actively break it: one line, truncated
 * at the width of a pill, in 11px grey. A greeting nobody can finish reading
 * is worse than no greeting. So it keeps the centred, inert treatment — still
 * visibly not a colleague — and gains the three things it needs: the sender's
 * name written out, every line of the text, and room to breathe.
 *
 * Both are inert by consequence: no arrow menu, no reactions, no thread.
 * Anything worth saying about either is said in the room under it, by a
 * person, in a bubble. That matters more for an announcement, not less —
 * "happy birthday" belongs to colleagues, and the post exists to prompt it
 * rather than to stand in for it.
 */
export default function SystemMessage({ message }: { message: ChatMessage }) {
  if (message.systemKind === 'announcement') return <Announcement message={message} />;

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

function Announcement({ message }: { message: ChatMessage }) {
  return (
    <div className="flex justify-center px-2 py-2.5">
      <div className="w-full max-w-md rounded-xl border border-brand-100 bg-brand-50/60 px-4 py-3 text-center shadow-sm">
        <p className="flex items-center justify-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-brand-700">
          <PartyPopper size={12} className="flex-shrink-0" />
          {/* Written out rather than shortened. The name is the point: this is
              the company speaking, not the software it happens to run on. */}
          <span className="truncate">{message.senderName}</span>
        </p>
        {/* `whitespace-pre-line` because the message is built from one line per
            person and a blank line between the two kinds — collapsed, it runs
            four people into one paragraph. Never truncated. */}
        <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-gray-800">
          {message.text}
        </p>
        <p className="mt-1.5 text-[11px] text-gray-400">{clock(message)}</p>
      </div>
    </div>
  );
}
