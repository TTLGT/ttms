'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from './AuthContext';
import {
  ensureChatReady,
  markConversationRead,
  unreadConversationIds,
  watchConversations,
  watchReads,
} from '@/lib/chat';
import { listUserProfiles } from '@/lib/userProfiles';
import type { Conversation } from '@/types/conversation';
import type { UserProfile } from '@/types/userProfile';

/**
 * One set of chat listeners for the whole app.
 *
 * Chat is on screen in three places at once — the page, the popup and the
 * unread badge in the sidebar — and all three need the same conversations and
 * the same read marks. Without this they would each open their own Firestore
 * listeners: three times the reads, three times the bill, and three copies of
 * the state to drift apart. Opening a conversation in the popup and finding it
 * still bold on the page is exactly the kind of bug that follows.
 *
 * Mounted inside the dashboard layout, below the auth gate, so it never
 * subscribes for a user who has not been through the allowlist check.
 */

interface ChatContextValue {
  /** Everything the signed-in user can see, newest activity first. */
  conversations: Conversation[];
  /** Everyone who has ever signed in, for titles, avatars and the picker. */
  people: UserProfile[];
  /** A uid to a display name, falling back to something printable. */
  nameOf: (uid: string) => string;
  profileOf: (uid: string) => UserProfile | undefined;
  /** Conversations holding something this user has not seen. */
  unreadIds: string[];
  /** Which conversation both views are showing. */
  activeId: string | null;
  setActiveId: (id: string | null) => void;
  /** Whether the floating panel is open. The page ignores this. */
  popupOpen: boolean;
  setPopupOpen: (open: boolean) => void;
  /** Clears the badge for one conversation. Safe to call repeatedly. */
  markRead: (conversationId: string) => void;
  /** Set when the listeners themselves fail — almost always undeployed rules. */
  error: string;
  loading: boolean;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [people, setPeople]               = useState<UserProfile[]>([]);
  const [lastReadAt, setLastReadAt]       = useState<Record<string, number>>({});
  const [activeId, setActiveId]           = useState<string | null>(null);
  const [popupOpen, setPopupOpen]         = useState(false);
  const [error, setError]                 = useState('');
  const [loading, setLoading]             = useState(true);

  // The company room is created on demand, so the listeners have to be told to
  // wait for it — attaching first would report it missing on a database where
  // nobody has opened chat yet, and the room would never appear.
  useEffect(() => {
    if (!uid) return;
    let live = true;
    let stopConversations: (() => void) | undefined;
    let stopReads: (() => void) | undefined;

    void ensureChatReady()
      .catch(() => {
        // A failure here is not fatal: every conversation that already exists
        // still loads. Only the company room would be missing, and the next
        // page load tries again.
      })
      .then(() => {
        if (!live) return;
        stopConversations = watchConversations(
          uid,
          (rows) => { setConversations(rows); setLoading(false); },
          (err)  => { setError(chatError(err)); setLoading(false); },
        );
        stopReads = watchReads(uid, setLastReadAt, () => {
          // Read marks failing is not worth an error banner — the worst of it
          // is a badge that will not clear.
        });
      });

    return () => {
      live = false;
      stopConversations?.();
      stopReads?.();
    };
  }, [uid]);

  // Loaded once, not watched: names and photos change about as often as people
  // are hired, and a live listener on every profile in the company would be a
  // standing cost for a list that is static all day.
  useEffect(() => {
    if (!uid) return;
    let live = true;
    void listUserProfiles()
      .then((rows) => { if (live) setPeople(rows); })
      .catch(() => {});
    return () => { live = false; };
  }, [uid]);

  const byUid = useMemo(() => {
    const map = new Map<string, UserProfile>();
    for (const p of people) map.set(p.uid, p);
    return map;
  }, [people]);

  const nameOf = useCallback(
    (target: string) => byUid.get(target)?.displayName || byUid.get(target)?.email || 'Someone',
    [byUid],
  );

  const profileOf = useCallback((target: string) => byUid.get(target), [byUid]);

  const unreadIds = useMemo(
    () => (uid ? unreadConversationIds(conversations, lastReadAt, uid) : []),
    [conversations, lastReadAt, uid],
  );

  const markRead = useCallback(
    (conversationId: string) => {
      if (!uid) return;
      // Written straight through rather than only on change: the write is one
      // small merge, and skipping it when the local copy looks current is how
      // a badge ends up stuck after a listener misses a beat.
      void markConversationRead(uid, conversationId).catch(() => {});
    },
    [uid],
  );

  // Reading a conversation clears it as you watch, without a second click.
  useEffect(() => {
    if (!activeId) return;
    if (!unreadIds.includes(activeId)) return;
    markRead(activeId);
  }, [activeId, unreadIds, markRead]);

  const value = useMemo(
    () => ({
      conversations, people, nameOf, profileOf, unreadIds,
      activeId, setActiveId, popupOpen, setPopupOpen, markRead, error, loading,
    }),
    [conversations, people, nameOf, profileOf, unreadIds, activeId, popupOpen, markRead, error, loading],
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChat must be used within <ChatProvider>');
  return ctx;
}

/**
 * Firestore's permission error, in words a broker can act on.
 *
 * This is overwhelmingly the first thing anyone will hit after chat ships,
 * because the rules that allow it do not go live by being committed — they
 * have to be uploaded with scripts/deploy-rules.js. Saying so here saves the
 * next person a long afternoon.
 */
function chatError(err: Error): string {
  return /permission/i.test(err.message)
    ? 'Chat is not switched on yet — the security rules for it have not been published. An admin needs to run the rules deploy.'
    : 'Chat could not load. Refresh the page to try again.';
}
