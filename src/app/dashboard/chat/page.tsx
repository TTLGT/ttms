'use client';

import { Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import ChatPanel from '@/components/chat/ChatPanel';
import { useChat } from '@/context/ChatContext';

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
      {/* useSearchParams has to sit inside a Suspense boundary or it opts the
          whole page out of being prerendered. The chat itself does not wait on
          it — a link with no parameters renders exactly as before. */}
      <Suspense fallback={null}>
        <OpenFromLink />
      </Suspense>
      <ChatPanel />
    </div>
  );
}

/**
 * Follows a link to one message: `?c=<conversation>&m=<message>`.
 *
 * It only asks for the conversation to be opened and the message to be marked
 * for jumping to. Whether that message is still within the loaded window is the
 * thread's business — and when it is not, the conversation opens anyway, which
 * is most of what the link was for.
 *
 * Renders nothing. It exists to turn a URL into state exactly once.
 */
function OpenFromLink() {
  const params = useSearchParams();
  const { setActiveId, setFocusMessageId } = useChat();

  const conversationId = params.get('c');
  const messageId      = params.get('m');

  useEffect(() => {
    if (!conversationId) return;
    setActiveId(conversationId);
    setFocusMessageId(messageId);
  }, [conversationId, messageId, setActiveId, setFocusMessageId]);

  return null;
}
