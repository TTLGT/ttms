'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ExternalLink, Paperclip, Settings2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useChat } from '@/context/ChatContext';
import ChatFilesDialog from './ChatFilesDialog';
import ConversationList from './ConversationList';
import MessageThread from './MessageThread';
import NewConversationDialog from './NewConversationDialog';
import RoomSettingsDialog from './RoomSettingsDialog';
import SearchResults from './SearchResults';
import RoomAvatar from './RoomAvatar';
import ThreadList from './ThreadList';
import ThreadPanel from './ThreadPanel';
import { can } from '@/lib/accessControl';
import {
  COMPANY_CONVERSATION_ID,
  conversationTitle,
  type Conversation,
} from '@/types/conversation';

/*
 * How wide the conversation column can be dragged, and where it starts.
 *
 * The floor is about what a room row needs before names start being cut in
 * the middle; the ceiling is about the thread beside it, which stops being a
 * conversation once it is a column of three-word lines. The default is the
 * width the column used to be fixed at.
 */
const LIST_MIN_WIDTH     = 240;
const LIST_MAX_WIDTH     = 480;
const LIST_DEFAULT_WIDTH = 288;
const LIST_WIDTH_KEY     = 'ttms.chatListWidth';

const clampListWidth = (px: number) =>
  Math.min(LIST_MAX_WIDTH, Math.max(LIST_MIN_WIDTH, Math.round(px)));

/**
 * The chat itself — the list beside a thread.
 *
 * One component behind both the full page and the floating popup, because the
 * two have to agree: which conversation is open, what has been read, what is
 * still bold. Two implementations of that would drift apart within a week.
 * They differ only in `compact`, which is about how much room there is, not
 * about what the thing does.
 */
export default function ChatPanel({ compact = false }: { compact?: boolean }) {
  const { user, profile } = useAuth();
  const {
    conversations, activeId, setActiveId, nameOf, error, loading, openThread, setOpenThread,
    search, clearSearch,
  } = useChat();

  const [newOpen, setNewOpen]           = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Separate from the settings, and offered on every kind of conversation:
  // unlike a name, a membership or a policy, what has been sent somewhere is
  // something a direct thread and a load room have as much as a named room
  // does.
  const [filesOpen, setFilesOpen]       = useState(false);
  // Which list the left column is showing. Local rather than in ChatContext:
  // the page and the popup are two different places to be looking, and having
  // one flip the other to a list the reader did not ask for is worse than
  // letting each remember its own.
  const [showThreads, setShowThreads]   = useState(false);

  /*
   * How wide the left column is, and it is the reader who says.
   *
   * At a fixed 288px the same column has to serve somebody with a dozen lists,
   * who wants the chips on one line and load numbers whole, and somebody deep
   * in one thread, who wants the list out of the way. The width is kept in
   * this browser rather than on the person's record for the same reason the
   * sound setting is: it is about the screen in front of them.
   */
  const [listWidth, setListWidth] = useState(LIST_DEFAULT_WIDTH);
  const listWidthRef = useRef(LIST_DEFAULT_WIDTH);

  const applyWidth = useCallback((px: number, remember: boolean) => {
    const width = clampListWidth(px);
    listWidthRef.current = width;
    setListWidth(width);
    if (!remember) return;
    try {
      window.localStorage.setItem(LIST_WIDTH_KEY, String(width));
    } catch {
      // Storage off, or private browsing. The width still holds for now.
    }
  }, []);

  // Read in an effect, not in useState: the server renders this page too and
  // has no localStorage, so a width read during the first render would have
  // the two disagreeing about the markup.
  useEffect(() => {
    try {
      const saved = Number(window.localStorage.getItem(LIST_WIDTH_KEY));
      if (Number.isFinite(saved) && saved > 0) applyWidth(saved, false);
    } catch {
      // Nothing saved that can be read: the default is a fine place to start.
    }
  }, [applyWidth]);

  /** Dragging the divider. Written to storage on release, not per pixel. */
  const startResize = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // Otherwise the drag selects the conversation names it passes over.
    e.preventDefault();
    const startX     = e.clientX;
    const startWidth = listWidthRef.current;
    const body       = document.body;
    const priorCursor = body.style.cursor;
    const priorSelect = body.style.userSelect;
    body.style.cursor     = 'col-resize';
    body.style.userSelect = 'none';

    const onMove = (ev: PointerEvent) => applyWidth(startWidth + ev.clientX - startX, false);
    const onUp   = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      body.style.cursor     = priorCursor;
      body.style.userSelect = priorSelect;
      applyWidth(listWidthRef.current, true);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [applyWidth]);

  const myUid  = user?.uid ?? '';
  const active = conversations.find((c) => c.id === activeId) ?? null;

  /*
   * Which conversations have a settings panel worth opening.
   *
   * A named room always does — anybody in it can at least read who is in it
   * and what it allows. The Everyone room does too, but only for the people
   * who could change the one thing it has: whether it is open to everyone or
   * turned down to announcements. For anybody else there is nothing on that
   * page they could act on, so the gear is not offered.
   *
   * A direct thread and a record room have nothing to settle either way.
   */
  const hasSettings = active !== null && (
    active.kind === 'group'
    || (active.kind === 'company' && can(profile, 'chat.announce'))
  );

  // Guarded against the conversation rather than trusted on its own: the
  // provider clears a thread when its room closes, but this renders in the
  // frame before that effect runs, and a thread panel reading out of a room
  // that is no longer on screen is a permissions error waiting to happen.
  const thread = openThread && active && openThread.conversationId === active.id
    ? openThread
    : null;

  // Open on the company room the first time, so chat is never an empty screen
  // with nothing to click. Only when nothing is selected — this must not drag
  // someone out of a conversation when the list re-sorts under them.
  useEffect(() => {
    if (loading || activeId) return;
    if (compact) return; // The popup opens on the list; see below.
    const company = conversations.find((c) => c.id === COMPANY_CONVERSATION_ID);
    if (company) setActiveId(company.id);
  }, [loading, activeId, compact, conversations, setActiveId]);

  /**
   * A conversation you have just left, or been removed from, stops arriving in
   * the list. Without this the thread would stay on screen showing whatever it
   * had already loaded.
   *
   * Given a moment before it acts, which matters for the opposite case: a room
   * opened by Discuss, or a direct thread created by replying privately, is
   * selected the instant the server says yes — and is not in the list until
   * the snapshot listener catches up a fraction of a second later. Clearing on
   * the first render that cannot find it would drop the reader back on the
   * conversation list every time, and only on the rooms they had just asked
   * for. The timer is cancelled by the snapshot that brings the room in.
   */
  useEffect(() => {
    if (!activeId || loading) return;
    if (conversations.some((c) => c.id === activeId)) return;
    const timer = window.setTimeout(() => setActiveId(null), 4000);
    return () => window.clearTimeout(timer);
  }, [activeId, conversations, loading, setActiveId]);

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="max-w-sm text-center text-sm text-gray-500">{error}</p>
      </div>
    );
  }

  // Narrow: one thing at a time, with a way back. Side by side in a 380px
  // popup would leave a thread about 200px wide, which is not a chat.
  if (compact) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        {/* One thing at a time here too: an open thread replaces the room
            rather than sitting beside it, and closing it comes straight back.
            Its own header carries the way out. */}
        {search ? (
          <SearchResults myUid={myUid} onClose={clearSearch} />
        ) : active && thread ? (
          <ThreadPanel
            conversation={active}
            rootId={thread.rootId}
            onClose={() => setOpenThread(null)}
          />
        ) : active ? (
          <>
            <Header
              conversation={active}
              myUid={myUid}
              nameOf={nameOf}
              onBack={() => setActiveId(null)}
              onSettings={hasSettings ? () => setSettingsOpen(true) : undefined}
              onFiles={() => setFilesOpen(true)}
            />
            <div className="min-h-0 flex-1">
              <MessageThread conversation={active} />
            </div>
          </>
        ) : showThreads ? (
          <ThreadList onBack={() => setShowThreads(false)} />
        ) : (
          <ConversationList onNew={() => setNewOpen(true)} onShowThreads={() => setShowThreads(true)} />
        )}

        {newOpen && <NewConversationDialog onClose={() => setNewOpen(false)} />}
        {settingsOpen && active && hasSettings && (
          <RoomSettingsDialog
            conversation={active}
            onClose={() => setSettingsOpen(false)}
            onShowFiles={() => { setSettingsOpen(false); setFilesOpen(true); }}
          />
        )}
        {filesOpen && active && (
          <ChatFilesDialog conversation={active} onClose={() => setFilesOpen(false)} />
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      <div style={{ width: listWidth }} className="min-w-0 flex-shrink-0 bg-white">
        {showThreads ? (
          <ThreadList onBack={() => setShowThreads(false)} />
        ) : (
          <ConversationList onNew={() => setNewOpen(true)} onShowThreads={() => setShowThreads(true)} />
        )}
      </div>

      {/* The divider between the two is the handle, which is why resizing
          costs the layout nothing: the edge had to be drawn anyway, and it is
          where somebody reaches when they want the column wider. The line
          stays a hairline; the pseudo-element around it is what the pointer
          actually has to hit. Double-click puts it back to 288. */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize the conversation list"
        aria-valuenow={listWidth}
        aria-valuemin={LIST_MIN_WIDTH}
        aria-valuemax={LIST_MAX_WIDTH}
        tabIndex={0}
        onPointerDown={startResize}
        onDoubleClick={() => applyWidth(LIST_DEFAULT_WIDTH, true)}
        onKeyDown={(e) => {
          if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
          e.preventDefault();
          applyWidth(listWidthRef.current + (e.key === 'ArrowLeft' ? -16 : 16), true);
        }}
        title="Drag to resize — double-click to reset"
        className="relative z-10 w-px flex-shrink-0 cursor-col-resize bg-gray-200 transition hover:bg-brand-400 focus:bg-brand-500 focus:outline-none after:absolute after:inset-y-0 after:-left-1 after:-right-1 after:content-['']"
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-white">
        {/* Over the room rather than beside it. Every result is somewhere to
            go, and going there replaces what is on screen anyway — so a third
            column would be one the reader has to close again the moment they
            use it. Closing comes straight back to the room. */}
        {search ? (
          <SearchResults myUid={myUid} onClose={clearSearch} />
        ) : active ? (
          <>
            <Header
              conversation={active}
              myUid={myUid}
              nameOf={nameOf}
              onSettings={hasSettings ? () => setSettingsOpen(true) : undefined}
              onFiles={() => setFilesOpen(true)}
            />
            <div className="min-h-0 flex-1">
              <MessageThread conversation={active} />
            </div>
          </>
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-gray-400">Pick a conversation on the left.</p>
          </div>
        )}
      </div>

      {/* A column beside the room, not over it. The reason a thread exists is
          that the room carries on without it, and a panel covering the room
          would take that away at the moment it is most wanted — somebody
          answering one question while watching for the next. */}
      {!search && active && thread && (
        <div className="w-[360px] flex-shrink-0 border-l border-gray-200 xl:w-[420px]">
          <ThreadPanel
            conversation={active}
            rootId={thread.rootId}
            onClose={() => setOpenThread(null)}
          />
        </div>
      )}

      {newOpen && <NewConversationDialog onClose={() => setNewOpen(false)} />}
      {settingsOpen && active && hasSettings && (
        <RoomSettingsDialog
          conversation={active}
          onClose={() => setSettingsOpen(false)}
          onShowFiles={() => { setSettingsOpen(false); setFilesOpen(true); }}
        />
      )}
      {filesOpen && active && (
        <ChatFilesDialog conversation={active} onClose={() => setFilesOpen(false)} />
      )}
    </div>
  );
}

function Header({
  conversation, myUid, nameOf, onBack, onSettings, onFiles,
}: {
  conversation: Conversation;
  myUid: string;
  nameOf: (uid: string) => string;
  onBack?: () => void;
  /** Absent on the conversations that have nothing this reader could change. */
  onSettings?: () => void;
  /** Every conversation has been sent something, or could have been. */
  onFiles: () => void;
}) {
  return (
    <div className="flex flex-shrink-0 items-center gap-2 border-b border-gray-200 px-4 py-3">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          title="Back to conversations"
          className="-ml-1 rounded-lg p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
        >
          <ArrowLeft size={16} />
        </button>
      )}

      {/* The picture and the name open the settings on a named room, because
          that is where people go looking for them — a gear in the far corner
          is the second place you try. Only a named room has anything to
          change, so on every other kind this stays plain text rather than
          becoming a button that does nothing. */}
      <Identity
        conversation={conversation}
        myUid={myUid}
        nameOf={nameOf}
        onSettings={onSettings}
      />

      {/* The record this room is about, one click away. A conversation about a
          load is only worth having here if the load is always to hand — the
          alternative is somebody reading four messages about a pickup date and
          then searching for the order to check it. Record rooms are never
          renamed, so there is no settings gear beside it. */}
      {conversation.kind === 'record' && conversation.recordId && (
        <Link
          href={`/dashboard/orders/${conversation.recordId}`}
          title="Open this order"
          className="flex flex-shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-brand-600 transition hover:bg-brand-50"
        >
          Open order
          <ExternalLink size={12} />
        </Link>
      )}

      {/* Offered everywhere, unlike the gear beside it: a direct thread and a
          load room both collect photos and rate sheets, and the reason this
          exists is that finding one by scrolling is minutes of work. */}
      <button
        type="button"
        onClick={onFiles}
        title="Files and links"
        className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
      >
        <Paperclip size={16} />
      </button>

      {/* A named room always has something to change. The Everyone room has one
          switch, and only for the people who can flip it. A direct thread is
          defined by its two people and a record room is titled by its record,
          so neither ever gets a gear. */}
      {onSettings && (
        <button
          type="button"
          onClick={onSettings}
          title="Room settings"
          className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
        >
          <Settings2 size={16} />
        </button>
      )}
    </div>
  );
}

/** The picture and the title — a button on a room you can edit, plain text otherwise. */
function Identity({
  conversation, myUid, nameOf, onSettings,
}: {
  conversation: Conversation;
  myUid: string;
  nameOf: (uid: string) => string;
  /** Absent on the kinds of conversation that have no settings to open. */
  onSettings?: () => void;
}) {
  const inside = (
    <>
      <RoomAvatar conversation={conversation} size={32} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-gray-900">
          {conversationTitle(conversation, myUid, nameOf)}
        </span>
        <span className="block truncate text-xs text-gray-500">
          {subtitle(conversation, myUid, nameOf)}
        </span>
      </span>
    </>
  );

  if (!onSettings) {
    return <div className="flex min-w-0 flex-1 items-center gap-2">{inside}</div>;
  }

  return (
    <button
      type="button"
      onClick={onSettings}
      title="Room settings"
      // Negative margin so the hover panel lines the text up exactly where it
      // sat before, rather than the header shifting when this became a button.
      className="-mx-2 flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1 text-left transition hover:bg-gray-100"
    >
      {inside}
    </button>
  );
}

/** Who is in here, in a line — the question people ask of a room they just opened. */
function subtitle(c: Conversation, myUid: string, nameOf: (uid: string) => string): string {
  if (c.kind === 'company') return 'Everyone at Total Transport Logistics';
  if (c.kind === 'direct')  return 'Just the two of you';
  // A record room says who is in it *so far*, because that is the honest
  // description: nobody was invited, and anybody who can see the order joins
  // by opening it. A count that read like a guest list would be misleading.
  if (c.kind === 'record') {
    const here = c.memberUids.length;
    return here <= 1
      ? 'About this load · you are the first one here'
      : `About this load · ${here} people here so far`;
  }

  const others = c.memberUids.filter((uid) => uid !== myUid).map(nameOf);
  if (others.length === 0) return 'Just you';
  // Past a few names the line is longer than the room name above it and stops
  // being readable, so it turns into a count.
  if (others.length > 4) return `You and ${others.length} others`;
  return `You, ${others.join(', ')}`;
}
