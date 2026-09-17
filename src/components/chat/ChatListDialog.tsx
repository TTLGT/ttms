'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { CHAT_LIST_NAME_MAX, MAX_CHAT_LISTS } from '@/types/conversation';

/**
 * Naming a filter group — making one, or renaming one that exists.
 *
 * One dialog for both, because they ask the same single question and a second
 * component would be the same twenty lines with a different heading.
 *
 * Making a list asks for nothing but a name. Chats go in from the menu on each
 * row, which is where somebody already is when they think "this one belongs
 * with those" — a picker here would mean choosing, up front, out of a list of
 * rooms shown without the unread marks and previews that tell them apart.
 */
export default function ChatListDialog({
  mode, initialName = '', atCap = false, onSubmit, onClose,
}: {
  mode: 'create' | 'rename';
  initialName?: string;
  /** True when this person already has the most lists they may keep. */
  atCap?: boolean;
  onSubmit: (name: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initialName);
  const clean = name.trim();
  const blocked = mode === 'create' && atCap;

  function save() {
    if (!clean || blocked) return;
    onSubmit(clean.slice(0, CHAT_LIST_NAME_MAX));
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-900">
            {mode === 'create' ? 'New list' : 'Rename list'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-4 py-4">
          {blocked ? (
            <p className="text-sm text-gray-600">
              You already have {MAX_CHAT_LISTS} lists, which is the most one person can keep.
              Delete one you no longer use and this will let you make another.
            </p>
          ) : (
            <>
              <input
                autoFocus
                value={name}
                maxLength={CHAT_LIST_NAME_MAX}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
                placeholder="Dispatch, My team, Night shift…"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
              <p className="mt-2 text-xs text-gray-500">
                A list is yours alone. Nobody else sees it, and putting a chat in one
                changes nothing for the people in that chat.
              </p>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-200 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-100"
          >
            {blocked ? 'Close' : 'Cancel'}
          </button>
          {!blocked && (
            <button
              type="button"
              onClick={save}
              disabled={!clean}
              className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-600 disabled:opacity-40"
            >
              {mode === 'create' ? 'Create' : 'Save'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
