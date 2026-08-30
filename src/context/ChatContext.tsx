'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from './AuthContext';
import {
  ensureChatReady,
  markConversationRead,
  millis,
  unreadConversationIds,
  unreadMentionIds,
  watchConversations,
  watchReads,
} from '@/lib/chat';
import {
  DEFAULT_NOTIFY_PREFS,
  loadNotifyPrefs,
  playChime,
  saveNotifyPrefs,
  setUnreadTitle,
  showMessageNotification,
  type NotifyPrefs,
} from '@/lib/chatNotify';
import { listUserProfiles } from '@/lib/userProfiles';
import { conversationTitle, type Conversation, type MessageQuote } from '@/types/conversation';
import type { UserProfile } from '@/types/userProfile';

/**
 * A quote on its way to a conversation that is not open yet.
 *
 * Replying privately to something said in a room means switching conversation
 * and taking the quote with you. The thread component is torn down and rebuilt
 * by that switch, so the quote cannot wait there — it waits here until the
 * destination thread mounts and claims it.
 */
export interface PendingReply {
  conversationId: string;
  quote: MessageQuote;
}

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
  /** The subset of those where this user was named with an @. */
  mentionIds: string[];
  /**
   * Each conversation's read mark, in millis. Exposed so a thread can show the
   * "new messages" line where the reader actually left off.
   */
  lastReadAt: Record<string, number>;
  /** Which conversation both views are showing. */
  activeId: string | null;
  setActiveId: (id: string | null) => void;
  /** Whether the floating panel is open. The page ignores this. */
  popupOpen: boolean;
  setPopupOpen: (open: boolean) => void;
  /** Clears the badge for one conversation. Safe to call repeatedly. */
  markRead: (conversationId: string) => void;
  /** A quote waiting for its destination thread to open. See PendingReply. */
  pendingReply: PendingReply | null;
  setPendingReply: (reply: PendingReply | null) => void;
  /**
   * A message to scroll to and ring once its thread is open, set by following
   * a link to one message. Claimed and cleared by the thread, like a pending
   * reply — the conversation has to switch before anything can scroll.
   */
  focusMessageId: string | null;
  setFocusMessageId: (messageId: string | null) => void;
  /** Desktop notification and sound settings, per browser. */
  notifyPrefs: NotifyPrefs;
  setNotifyPrefs: (prefs: NotifyPrefs) => void;
  /** Set when the listeners themselves fail — almost always undeployed rules. */
  error: string;
  loading: boolean;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const router   = useRouter();
  const uid      = user?.uid ?? null;

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [people, setPeople]               = useState<UserProfile[]>([]);
  const [lastReadAt, setLastReadAt]       = useState<Record<string, number>>({});
  const [activeId, setActiveId]           = useState<string | null>(null);
  const [popupOpen, setPopupOpen]         = useState(false);
  const [error, setError]                 = useState('');
  const [loading, setLoading]             = useState(true);
  const [notifyPrefs, setPrefs]           = useState<NotifyPrefs>(DEFAULT_NOTIFY_PREFS);
  const [pendingReply, setPendingReply]   = useState<PendingReply | null>(null);
  const [focusMessageId, setFocusMessageId] = useState<string | null>(null);

  // Read in an effect, not in useState: the server renders this too and has no
  // localStorage, so reading during the first render would make the server and
  // the browser disagree about the markup.
  useEffect(() => { setPrefs(loadNotifyPrefs()); }, []);

  const setNotifyPrefs = useCallback((next: NotifyPrefs) => {
    setPrefs(next);
    saveNotifyPrefs(next);
  }, []);

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

  const mentionIds = useMemo(
    () => (uid ? unreadMentionIds(conversations, lastReadAt, uid) : []),
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

  /* ------------------------------------------------------- notifications */

  /**
   * The newest message this browser has already announced, per conversation.
   *
   * Seeded from the first snapshot without notifying anything. Without that,
   * every page load would fire a notification for every conversation that has
   * ever had a message in it — which is how a new feature gets switched off on
   * the first morning.
   */
  const announced = useRef<Map<string, number> | null>(null);

  // Held in a ref so the effect below can read the current preferences and the
  // current conversation without re-running — and re-announcing — each time
  // either of them changes.
  const latest = useRef({ notifyPrefs, activeId, uid, nameOf });
  latest.current = { notifyPrefs, activeId, uid, nameOf };

  useEffect(() => {
    if (!uid) return;

    if (announced.current === null) {
      announced.current = new Map(conversations.map((c) => [c.id, millis(c.lastMessage?.at)]));
      return;
    }

    const seen = announced.current;
    for (const c of conversations) {
      const last = c.lastMessage;
      const at   = millis(last?.at);
      const previous = seen.get(c.id) ?? 0;
      seen.set(c.id, at);

      if (!last || at <= previous) continue;
      if (last.senderUid === latest.current.uid) continue;
      // You are looking straight at it. Announcing a message already on screen
      // is how people learn to ignore notifications.
      if (c.id === latest.current.activeId && document.visibilityState === 'visible') continue;

      const title = conversationTitle(c, uid, latest.current.nameOf);
      if (latest.current.notifyPrefs.desktop) {
        showMessageNotification({
          // Room name first for a room, because "Dispatch" is what you need to
          // decide whether to look; a direct thread is already titled with the
          // person, so repeating their name in the body would be redundant.
          title: c.kind === 'direct' ? title : `${last.senderName} in ${title}`,
          body:  last.text || 'Message deleted',
          tag:   c.id,
          onClick: () => {
            setActiveId(c.id);
            router.push('/dashboard/chat');
          },
        });
      }
      if (latest.current.notifyPrefs.sound) playChime();
    }
  }, [conversations, uid, router]);

  // The count in front of the browser tab title, so a glance at the tab strip
  // is enough. Cleared on unmount or the title keeps a stale count on a page
  // that no longer has chat on it.
  useEffect(() => {
    setUnreadTitle(unreadIds.length);
    return () => setUnreadTitle(0);
  }, [unreadIds.length]);

  const value = useMemo(
    () => ({
      conversations, people, nameOf, profileOf, unreadIds, mentionIds, lastReadAt,
      activeId, setActiveId, popupOpen, setPopupOpen, markRead,
      pendingReply, setPendingReply, focusMessageId, setFocusMessageId,
      notifyPrefs, setNotifyPrefs, error, loading,
    }),
    [
      conversations, people, nameOf, profileOf, unreadIds, mentionIds, lastReadAt,
      activeId, popupOpen, markRead, pendingReply, focusMessageId,
      notifyPrefs, setNotifyPrefs, error, loading,
    ],
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
 * This is overwhelmingly the first thing anyone will hit after a chat change,
 * because the rules that allow it do not go live by being committed — they
 * have to be uploaded with scripts/deploy-rules.js. Saying so here saves the
 * next person a long afternoon.
 */
function chatError(err: Error): string {
  return /permission/i.test(err.message)
    ? 'Chat is not switched on yet — the security rules for it have not been published. An admin needs to run the rules deploy.'
    : 'Chat could not load. Refresh the page to try again.';
}
