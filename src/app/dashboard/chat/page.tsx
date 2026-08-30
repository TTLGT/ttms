'use client';

import ChatPanel from '@/components/chat/ChatPanel';

/**
 * Chat, full width.
 *
 * Everything about it lives in ChatPanel, which the floating popup renders too
 * — the page is the same chat with room to read it in. Both draw from
 * ChatProvider in the dashboard layout, so opening a conversation in one and
 * switching to the other lands you in the same place.
 *
 * No access check here beyond being signed in. Chat crosses none of the
 * ownership boundaries that orders and parties are gated by: everyone who can
 * reach this page is on the allowlist, and everyone on the allowlist is staff.
 */
export default function ChatPage() {
  return (
    // h-full with the shell locked to the viewport: the thread scrolls inside
    // itself, the way the sidebar nav does, rather than scrolling the page and
    // carrying the composer off the bottom of the screen.
    <div className="h-full">
      <ChatPanel />
    </div>
  );
}
