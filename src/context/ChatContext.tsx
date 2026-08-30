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
  countUnreadMessages,
  ensureChatReady,
  markConversationRead,
  markThreadRead,
  millis,
  unreadConversationIds,
  unreadMentionIds,
  unreadThreadIds,
  watchConversations,
  watchMyThreads,
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
import {
  conversationTitle,
  reactionGlyph,
  type Conversation,
  type MessageQuote,
  type ThreadEntry,
} from '@/types/conversation';
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
 * The thread on screen, if one is open.
 *
 * The conversation is carried with the message id because a thread outlives
 * the room it was opened from being scrolled: the panel has to be able to say
 * which conversation to read replies out of without asking what is currently
 * selected, and closing a room must close its thread rather than leave the
 * panel pointed at a message in a room nobody is looking at.
 */
export interface OpenThread {
  conversationId: string;
  rootId: string;
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
   * The badge text for chat as a whole — '', '7' or '@7' — for the nav item
   * and the popup bubble, which must never disagree with each other.
   */
  unreadBadge: string;
  /**
   * How many messages are waiting in each unread conversation, by id. Only
   * unread conversations appear, and a conversation whose count has not come
   * back yet is simply absent — a badge should fall back to a plain mark
   * rather than flash a zero.
   */
  unreadCounts: Record<string, number>;
  /** The subset holding a thread that has been answered for this user. */
  threadIds: string[];
  /**
   * Every thread this user is in, across every room, newest reply first.
   *
   * Read from its own small collection rather than worked out from the rooms —
   * see CHAT_THREADS_COLLECTION for why that question cannot be asked as a
   * query. Rows naming a room the user can no longer open are dropped where
   * the list is drawn, not here, because this has no opinion about rooms.
   */
  myThreads: ThreadEntry[];
  /**
   * Each conversation's read mark, in millis. Exposed so a thread can show the
   * "new messages" line where the reader actually left off.
   */
  lastReadAt: Record<string, number>;
  /**
   * Each thread's read mark, keyed by the message it hangs under. Its own mark
   * rather than the room's, so an answer survives a glance at the room — see
   * ChatReads.
   */
  threadReadAt: Record<string, number>;
  /** The thread on screen, in both views at once. Null when none is open. */
  openThread: OpenThread | null;
  setOpenThread: (thread: OpenThread | null) => void;
  /** Clears the mark on one thread. Safe to call repeatedly. */
  markThreadSeen: (rootId: string) => void;
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
  const [threadReadAt, setThreadReadAt]   = useState<Record<string, number>>({});
  const [activeId, setActiveId]           = useState<string | null>(null);
  const [openThread, setOpenThread]       = useState<OpenThread | null>(null);
  const [popupOpen, setPopupOpen]         = useState(false);
  const [error, setError]                 = useState('');
  const [loading, setLoading]             = useState(true);
  const [notifyPrefs, setPrefs]           = useState<NotifyPrefs>(DEFAULT_NOTIFY_PREFS);
  const [pendingReply, setPendingReply]   = useState<PendingReply | null>(null);
  const [focusMessageId, setFocusMessageId] = useState<string | null>(null);
  const [myThreads, setMyThreads]         = useState<ThreadEntry[]>([]);

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
        stopReads = watchReads(uid, (marks) => {
          setLastReadAt(marks.lastReadAt);
          setThreadReadAt(marks.threadReadAt);
        }, () => {
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

  // Its own listener rather than a branch of the conversations one: this reads
  // a different collection, and a thread row arriving is unrelated to a room
  // changing. A failure here is deliberately quiet — the threads list is a
  // shortcut to conversations that are all still reachable in their rooms, so
  // losing it is not worth the banner that a broken room list earns.
  useEffect(() => {
    if (!uid) return;
    return watchMyThreads(uid, setMyThreads, 50, () => setMyThreads([]));
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

  const threadIds = useMemo(
    () => (uid ? unreadThreadIds(conversations, threadReadAt, uid) : []),
    [conversations, threadReadAt, uid],
  );

  /**
   * The counts behind the badges, refreshed only when they can have changed.
   *
   * Keyed on each unread conversation, its newest message and the reader's own
   * read mark: anything else moving in the snapshot — somebody reacting, a
   * conversation being renamed, a typo corrected — must not spend a count.
   * Conversations already read are not counted at all, since their answer is
   * zero by definition.
   */
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});

  const countTargets = useMemo(
    () => conversations
      .filter((c) => unreadIds.includes(c.id))
      .map((c) => ({ id: c.id, since: lastReadAt[c.id] ?? 0, at: millis(c.lastMessage?.at) })),
    [conversations, unreadIds, lastReadAt],
  );
  // Held in a ref so the effect can depend on the signature alone. Depending on
  // the array itself would re-count on every snapshot, because a new array is a
  // new object even when it describes exactly the same unread conversations.
  const targetsRef = useRef(countTargets);
  targetsRef.current = countTargets;
  const countKey = countTargets.map((t) => `${t.id}:${t.since}:${t.at}`).join('|');

  useEffect(() => {
    const targets = targetsRef.current;
    if (targets.length === 0) { setUnreadCounts({}); return; }

    let live = true;
    void Promise.all(
      targets.map(async (t) => [t.id, await countUnreadMessages(t.id, t.since).catch(() => 0)] as const),
    ).then((rows) => {
      // A count that failed comes back 0 and is dropped, which leaves the badge
      // as a plain mark. An unread conversation showing "0" would be worse than
      // one showing no number at all.
      if (live) setUnreadCounts(Object.fromEntries(rows.filter(([, n]) => n > 0)));
    });

    return () => { live = false; };
  }, [countKey]);

  /**
   * One badge string for every "you have chat waiting" mark in the app.
   *
   * Messages, not conversations, so it agrees with the numbers on the
   * conversations themselves — two badges counting different things is how
   * somebody ends up opening chat to find four messages behind a badge that
   * said two. Until the counts land it falls back to the number of
   * conversations, which is never larger and is right within a second. The @
   * says one of them named you by name, which is worth interrupting yourself
   * for in a way that three routine ones are not.
   */
  const unreadBadge = useMemo(() => {
    if (unreadIds.length === 0) return '';
    const waiting = Object.values(unreadCounts).reduce((sum, n) => sum + n, 0);
    const text = waiting > 99 ? '99+' : String(waiting > 0 ? waiting : unreadIds.length);
    return mentionIds.length > 0 ? `@${text}` : text;
  }, [unreadIds, mentionIds, unreadCounts]);

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

  const markThreadSeen = useCallback(
    (rootId: string) => {
      if (!uid) return;
      void markThreadRead(uid, rootId).catch(() => {});
    },
    [uid],
  );

  // Reading a conversation clears it as you watch, without a second click.
  useEffect(() => {
    if (!activeId) return;
    if (!unreadIds.includes(activeId)) return;
    markRead(activeId);
  }, [activeId, unreadIds, markRead]);

  // A thread belongs to the room it was opened from. Switching rooms — or
  // being removed from one — has to take the panel with it, or the reader is
  // left answering inside a conversation they are no longer looking at.
  useEffect(() => {
    if (openThread && openThread.conversationId !== activeId) setOpenThread(null);
  }, [activeId, openThread]);

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

  /** The same, for reactions left on this user's own messages. */
  const announcedPings = useRef<Map<string, number> | null>(null);

  /** The same, for replies in threads this user is in. */
  const announcedThreads = useRef<Map<string, number> | null>(null);

  // Held in a ref so the effect below can read the current preferences and the
  // current conversation without re-running — and re-announcing — each time
  // either of them changes.
  const latest = useRef({ notifyPrefs, activeId, uid, nameOf, openThread });
  latest.current = { notifyPrefs, activeId, uid, nameOf, openThread };

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

  /**
   * Somebody reacted to something you said.
   *
   * Its own pass rather than a branch of the one above, because it answers a
   * different question — the loop above asks "has this conversation had a new
   * message", this one asks "has anything of mine been reacted to" — and
   * because the two are independent: a reaction and a message can land in the
   * same snapshot and both deserve to be announced.
   *
   * Quiet by design compared with a message: it never marks the conversation
   * unread and never bolds it in the list. A thumbs-up is an acknowledgement,
   * not something waiting for you to do anything about.
   */
  useEffect(() => {
    if (!uid) return;

    // Seeded silently on the first snapshot, for the same reason as messages:
    // otherwise opening TTMS would replay every reaction anyone has ever left.
    if (announcedPings.current === null) {
      announcedPings.current = new Map(
        conversations.map((c) => [c.id, millis(c.reactionPings?.[uid]?.at)]),
      );
      return;
    }

    const seen = announcedPings.current;
    for (const c of conversations) {
      const ping = c.reactionPings?.[uid];
      const at   = millis(ping?.at);
      const previous = seen.get(c.id) ?? 0;
      seen.set(c.id, at);

      if (!ping || at <= previous) continue;
      // Reacting to your own message writes no ping at all, so this only
      // catches the pass where a slot is rewritten by its own owner.
      if (ping.byUid === latest.current.uid) continue;
      // Already on screen — the reaction appeared under the message as they
      // watched, and a notification for it would be telling them twice.
      if (c.id === latest.current.activeId && document.visibilityState === 'visible') continue;

      const where = conversationTitle(c, uid, latest.current.nameOf);
      if (latest.current.notifyPrefs.desktop) {
        showMessageNotification({
          title: `${ping.byName} reacted ${reactionGlyph(ping.key)}`,
          // Your own words back at you, which is the fastest way to know which
          // message this is about without opening anything.
          body:  ping.text ? `“${ping.text}” · ${where}` : where,
          // A tag of its own, so a reaction does not replace the notification
          // for an unread message in the same conversation.
          tag:   `${c.id}:reaction`,
          onClick: () => {
            setActiveId(c.id);
            // A reaction on a thread reply opens the thread. Jumping to the
            // reply in the room would find nothing — it was never in the room.
            if (ping.rootId) setOpenThread({ conversationId: c.id, rootId: ping.rootId });
            else setFocusMessageId(ping.messageId);
            router.push('/dashboard/chat');
          },
        });
      }
      if (latest.current.notifyPrefs.sound) playChime();
    }
  }, [conversations, uid, router]);

  /**
   * Somebody answered in a thread you are in.
   *
   * A third pass rather than a branch of either above, for the same reason
   * they are separate from each other: it asks a different question, and a
   * message, a reaction and a thread reply can all land in the same snapshot
   * and all three deserve to be announced.
   *
   * A thread reply is the one kind of new message that never bolds its room,
   * never counts towards the badge, and never moves the room up the list. This
   * is the whole of how anybody who is not looking at the thread finds out —
   * that, and the reply count under the message, which everyone in the room
   * can see.
   */
  useEffect(() => {
    if (!uid) return;

    // Seeded silently on the first snapshot, for the same reason as the other
    // two: otherwise opening TTMS replays every thread reply ever written.
    if (announcedThreads.current === null) {
      announcedThreads.current = new Map(
        conversations.map((c) => [c.id, millis(c.threadPings?.[uid]?.at)]),
      );
      return;
    }

    const seen = announcedThreads.current;
    for (const c of conversations) {
      const ping = c.threadPings?.[uid];
      const at   = millis(ping?.at);
      const previous = seen.get(c.id) ?? 0;
      seen.set(c.id, at);

      if (!ping || at <= previous) continue;
      // Your own reply marks the thread read as it is sent, so this only
      // catches a slot rewritten by its own owner.
      if (ping.byUid === latest.current.uid) continue;
      // Already open, and being watched. Announcing a reply that appeared
      // under their eyes is how people learn to ignore notifications.
      if (
        latest.current.openThread?.rootId === ping.rootId
        && document.visibilityState === 'visible'
      ) continue;

      const where = conversationTitle(c, uid, latest.current.nameOf);
      if (latest.current.notifyPrefs.desktop) {
        showMessageNotification({
          // Named as a reply, not as a message, because it is not in the room
          // and looking for it there is the first thing somebody would do.
          title: ping.mention
            ? `${ping.byName} mentioned you in a thread · ${where}`
            : `${ping.byName} replied in a thread · ${where}`,
          // The message being replied under, so it says which thread, then the
          // reply itself. In that order: which conversation this is about is
          // the thing that decides whether to go and look.
          body: ping.rootText ? `On “${ping.rootText}”: ${ping.text}` : ping.text,
          // Its own tag, so a thread reply does not replace the notification
          // for an unread message in the same room.
          tag: `${c.id}:thread`,
          onClick: () => {
            setActiveId(c.id);
            setOpenThread({ conversationId: c.id, rootId: ping.rootId });
            router.push('/dashboard/chat');
          },
        });
      }
      if (latest.current.notifyPrefs.sound) playChime();
    }
  }, [conversations, uid, router]);

  // The count in front of the browser tab title, so a glance at the tab strip
  // is enough. Messages, like every other badge — the tab saying (2) beside a
  // nav item saying 5 is the kind of small contradiction that makes people
  // stop trusting both. Cleared on unmount or the title keeps a stale count on
  // a page that no longer has chat on it.
  const titleCount = Object.values(unreadCounts).reduce((sum, n) => sum + n, 0) || unreadIds.length;
  useEffect(() => {
    setUnreadTitle(titleCount);
    return () => setUnreadTitle(0);
  }, [titleCount]);

  const value = useMemo(
    () => ({
      conversations, people, nameOf, profileOf, unreadIds, mentionIds, threadIds,
      myThreads,
      unreadCounts, unreadBadge, lastReadAt, threadReadAt,
      activeId, setActiveId, popupOpen, setPopupOpen, markRead,
      openThread, setOpenThread, markThreadSeen,
      pendingReply, setPendingReply, focusMessageId, setFocusMessageId,
      notifyPrefs, setNotifyPrefs, error, loading,
    }),
    [
      conversations, people, nameOf, profileOf, unreadIds, mentionIds, threadIds,
      myThreads,
      unreadCounts, unreadBadge, lastReadAt, threadReadAt,
      activeId, popupOpen, markRead, openThread, markThreadSeen,
      pendingReply, focusMessageId,
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
