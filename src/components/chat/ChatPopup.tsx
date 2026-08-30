'use client';

import { usePathname } from 'next/navigation';
import { Maximize2, MessageCircle, X } from 'lucide-react';
import Link from 'next/link';
import { useChat } from '@/context/ChatContext';
import ChatPanel from './ChatPanel';

/**
 * Chat over whatever you are working on.
 *
 * The reason it exists next to the full page: the questions people ask each
 * other are nearly always about the record already on screen — "did the carrier
 * on 41207 ever sign?" — and having to leave the order to ask means losing
 * what you were doing. The page is for reading a conversation back; this is
 * for a quick word without moving.
 *
 * Hidden on the chat page itself, where a floating copy of the same thing over
 * the real one would just be confusing.
 */
export default function ChatPopup() {
  const pathname = usePathname();
  const { popupOpen, setPopupOpen, unreadBadge } = useChat();

  if (pathname.startsWith('/dashboard/chat')) return null;

  if (!popupOpen) {
    return (
      <button
        type="button"
        onClick={() => setPopupOpen(true)}
        title="Chat"
        className="fixed bottom-5 right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-brand-500 text-white shadow-lg transition hover:bg-brand-600"
      >
        <MessageCircle size={20} />
        {unreadBadge && (
          /* Messages waiting, and the @ if one of them named you — the same
             string the nav item shows, built once in ChatContext. */
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-[20px] items-center justify-center rounded-full border-2 border-white bg-amber-400 px-1 text-[10px] font-bold tabular-nums text-brand-900">
            {unreadBadge}
          </span>
        )}
      </button>
    );
  }

  return (
    // Sized to sit clear of the sidebar and clear of the bottom of a laptop
    // screen. Fixed rather than resizable on purpose — this is the quick view,
    // and someone who wants room for it has the page a click away.
    <div className="fixed bottom-5 right-5 z-40 flex h-[560px] max-h-[calc(100vh-2.5rem)] w-[380px] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl">
      <div className="flex flex-shrink-0 items-center justify-between border-b border-gray-200 bg-brand-900 px-3 py-2.5 text-white">
        <span className="text-sm font-semibold">Chat</span>
        <div className="flex items-center gap-1">
          <Link
            href="/dashboard/chat"
            title="Open the full page"
            onClick={() => setPopupOpen(false)}
            className="rounded p-1 text-blue-200 transition hover:bg-brand-700 hover:text-white"
          >
            <Maximize2 size={14} />
          </Link>
          <button
            type="button"
            onClick={() => setPopupOpen(false)}
            title="Close"
            className="rounded p-1 text-blue-200 transition hover:bg-brand-700 hover:text-white"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <ChatPanel compact />
      </div>
    </div>
  );
}
