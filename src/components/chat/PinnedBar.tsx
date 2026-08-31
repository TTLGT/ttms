'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Pin, X } from 'lucide-react';
import { useChat } from '@/context/ChatContext';
import { pinnedMessages, unpinMessage } from '@/lib/chat';
import type { Conversation } from '@/types/conversation';

/**
 * The pinned messages, across the top of a room.
 *
 * A room's answer to the things it gets asked twice a day — the on-call
 * number, this week's priority load, the gate code at the Laredo yard. Without
 * it those live in whoever happens to be online, and get retyped every Monday.
 *
 * Collapsed to one line by default. A room with six pins would otherwise open
 * with half a screen of things somebody pinned in March above the conversation
 * people actually came to read, which is how a pin bar teaches everyone to
 * unpin everything.
 *
 * The text is read out of the pin rather than out of the message, because a
 * pinned message is very often older than the loaded window — there is nothing
 * on screen to read it off. See the `pinned` field on Conversation.
 */
export default function PinnedBar({
  conversation,
  onJump,
}: {
  conversation: Conversation;
  /** Scrolls the room to a message, when it is inside the loaded window. */
  onJump: (messageId: string) => void;
}) {
  const { setOpenThread, nameOf } = useChat();
  const [open, setOpen] = useState(false);

  const pins = pinnedMessages(conversation);
  if (pins.length === 0) return null;

  const newest = pins[0];

  return (
    <div className="flex-shrink-0 border-b border-amber-200 bg-amber-50">
      <div className="flex items-center gap-2 px-3 py-1.5">
        <Pin size={13} className="flex-shrink-0 text-amber-700" />

        <button
          type="button"
          onClick={() => setOpen((was) => !was)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span className="flex-shrink-0 text-[11px] font-semibold uppercase tracking-wide text-amber-800">
            {pins.length === 1 ? 'Pinned' : `${pins.length} pinned`}
          </span>
          {/* The newest pin's own words while the bar is shut, so a room with
              one pin needs no click at all to read it. */}
          {!open && (
            <span className="truncate text-xs text-amber-900">
              {newest.text || 'Attachment'}
            </span>
          )}
          {open ? (
            <ChevronUp size={13} className="ml-auto flex-shrink-0 text-amber-700" />
          ) : (
            <ChevronDown size={13} className="ml-auto flex-shrink-0 text-amber-700" />
          )}
        </button>
      </div>

      {open && (
        <ul className="max-h-48 overflow-y-auto border-t border-amber-200 px-2 py-1.5">
          {pins.map((pin) => (
            <li key={pin.messageId} className="group flex items-start gap-2 rounded-lg px-1.5 py-1 hover:bg-amber-100">
              <button
                type="button"
                onClick={() => {
                  // A pinned thread reply is not in the room, so jumping to it
                  // there would land on nothing. Opening the thread it lives in
                  // is the only way to reach it.
                  if (pin.rootId) setOpenThread({ conversationId: conversation.id, rootId: pin.rootId });
                  else onJump(pin.messageId);
                }}
                className="min-w-0 flex-1 text-left"
              >
                <p className="truncate text-xs text-amber-900">{pin.text || 'Attachment'}</p>
                <p className="truncate text-[10px] text-amber-700">
                  {pin.senderName}
                  {pin.rootId ? ' · in a thread' : ''}
                  {' · pinned by '}
                  {/* The name as it stands now when we know it, so a pin left
                      by somebody since renamed reads as the person you know. */}
                  {nameOf(pin.pinnedByUid) !== 'Someone' ? nameOf(pin.pinnedByUid) : pin.pinnedByName}
                </p>
              </button>

              {/* Anybody in the room may unpin, not only whoever pinned it —
                  see pinMessage. A pin nobody but its author can remove is a
                  pin that outlives them leaving the company. */}
              <button
                type="button"
                onClick={() => void unpinMessage(conversation.id, pin.messageId).catch(() => {})}
                title="Unpin"
                className="mt-0.5 flex-shrink-0 rounded p-0.5 text-amber-600 opacity-0 transition hover:bg-amber-200 focus:opacity-100 group-hover:opacity-100"
              >
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
