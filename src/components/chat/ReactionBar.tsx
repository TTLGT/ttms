'use client';

import { useState } from 'react';
import { SmilePlus } from 'lucide-react';
import { useChat } from '@/context/ChatContext';
import { REACTIONS, reactionGlyph } from '@/types/conversation';

/**
 * The reactions under a message, and the way to add one.
 *
 * A reaction exists so that "got it" does not have to be a message. Twelve
 * people acknowledging a dispatch note is twelve lines of noise in a room, or
 * one row of small counts under the note itself.
 *
 * The palette is fixed and short — see REACTIONS. A picker with three thousand
 * faces in it is not faster than typing "ok", which would defeat the point.
 */
export default function ReactionBar({
  reactions,
  myUid,
  onToggle,
}: {
  reactions: Record<string, string[]> | undefined;
  myUid: string;
  onToggle: (key: string, add: boolean) => void;
}) {
  const { nameOf } = useChat();
  const [pickerOpen, setPickerOpen] = useState(false);

  // Empty keys are left behind by arrayRemove taking out the last person, so
  // the map holds `{ up: [] }` rather than dropping the key. Filtered here
  // rather than cleaned up in the database: a write to tidy the shape would
  // cost more than skipping an empty array on render.
  const present = Object.entries(reactions ?? {}).filter(([, uids]) => uids.length > 0);

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      {present.map(([key, uids]) => {
        const mine = uids.includes(myUid);
        return (
          <button
            key={key}
            type="button"
            onClick={() => onToggle(key, !mine)}
            // Naming everyone who reacted is the difference between a count and
            // a signal you can act on — "who has actually seen this?"
            title={uids.map((u) => (u === myUid ? 'You' : nameOf(u))).join(', ')}
            className={`flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] leading-none transition ${
              mine
                ? 'border-brand-400 bg-brand-50 text-brand-800'
                : 'border-transparent bg-black/[0.06] text-gray-600 hover:bg-black/[0.1]'
            }`}
          >
            <span className="text-[13px] leading-none">{reactionGlyph(key)}</span>
            <span className="font-semibold tabular-nums">{uids.length}</span>
          </button>
        );
      })}

      <div className="relative">
        <button
          type="button"
          onClick={() => setPickerOpen((was) => !was)}
          title="React to this"
          className="flex items-center rounded-full p-1 text-gray-400 opacity-0 transition hover:bg-black/[0.06] hover:text-gray-700 focus-visible:opacity-100 group-hover:opacity-100"
        >
          <SmilePlus size={13} />
        </button>

        {pickerOpen && (
          <>
            {/* A full-screen catcher rather than a document listener: the
                picker is small and short-lived, and this closes it on the
                first click anywhere without racing the button's own handler. */}
            <div className="fixed inset-0 z-30" onClick={() => setPickerOpen(false)} />
            <div className="absolute bottom-full left-0 z-40 mb-1 flex gap-0.5 rounded-full border border-gray-200 bg-white px-1.5 py-1 shadow-xl">
              {REACTIONS.map(({ key, glyph, label }) => (
                <button
                  key={key}
                  type="button"
                  title={label}
                  onClick={() => {
                    onToggle(key, !(reactions?.[key] ?? []).includes(myUid));
                    setPickerOpen(false);
                  }}
                  className="rounded-full px-1 py-0.5 text-base leading-none transition hover:scale-125"
                >
                  {glyph}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
