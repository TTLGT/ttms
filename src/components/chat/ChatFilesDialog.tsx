'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import {
  CornerUpRight, Download, FileText, Image as ImageIcon, Link2, X,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useChat } from '@/context/ChatContext';
import { listSharedItems } from '@/lib/chat';
import { readableSize } from '@/lib/chatUploads';
import { useDateFormatters } from '@/lib/useDateFormatters';
import { useStorageUrl } from '@/lib/useStorageUrl';
import { Lightbox } from './MessageAttachments';
import {
  conversationTitle,
  type Attachment,
  type Conversation,
  type SharedItem,
  type SharedKind,
} from '@/types/conversation';

/**
 * Everything a conversation has been sent, in one place.
 *
 * The question this answers is "somebody sent me that rate sheet weeks ago",
 * which until now meant scrolling a room until it appeared — and the scroll is
 * paged, so a file from March was minutes of work to find. Search does not
 * help: it matches file names, and nobody remembers what a scan was called.
 *
 * Three tabs rather than one list, because the three are looked for
 * differently. A photo is recognised by seeing it, so media is a grid of the
 * pictures themselves. A document is recognised by its name, so documents are
 * rows. A link is neither — it is an address somebody pasted, and what makes it
 * findable again is the sentence it was pasted in, so that is shown with it.
 *
 * **Every row is a way back to the message it came from.** A file on its own is
 * usually not the answer; the answer is the conversation around it, and the
 * arrow on each row opens the room where it was said.
 *
 * Read on demand, one tab at a time, and kept once read — see listSharedItems.
 * Nothing here is watched: this is history, and it does not move while somebody
 * is looking at it.
 */
export default function ChatFilesDialog({
  conversation,
  onClose,
}: {
  conversation: Conversation;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const { nameOf, setActiveId, setOpenThread, setFocusMessage } = useChat();
  const { formatDateTime } = useDateFormatters();

  const [tab, setTab] = useState<SharedKind>('media');
  /** What each tab holds, once it has been opened. */
  const [loaded, setLoaded] = useState<
    Partial<Record<SharedKind, { items: SharedItem[]; truncated: boolean }>>
  >({});
  const [error, setError]       = useState('');
  const [lightbox, setLightbox] = useState<Attachment | null>(null);

  useEffect(() => {
    // Already read once. A tab somebody flicks back to must not cost the room
    // a second pass over its own history.
    if (loaded[tab]) return;

    let live = true;
    setError('');
    void listSharedItems(conversation.id, tab)
      .then((result) => { if (live) setLoaded((was) => ({ ...was, [tab]: result })); })
      .catch(() => {
        // Named rather than left as an empty panel: the commonest cause is the
        // composite index this query needs not being deployed yet, and a panel
        // that silently shows nothing reads as a conversation nobody has ever
        // sent anything to. See firestore.indexes.json.
        if (live) setError('These could not be loaded. Try again in a moment.');
      });
    return () => { live = false; };
  }, [tab, conversation.id, loaded]);

  /**
   * Opens the message a row came from.
   *
   * The same two cases as a search hit, for the same reason: a file sent inside
   * a thread was never in the room, so scrolling the room to it would find
   * nothing. The thread is opened over it instead.
   */
  function goToMessage(item: SharedItem) {
    setActiveId(conversation.id);
    if (item.rootId) {
      setOpenThread({ conversationId: conversation.id, rootId: item.rootId });
      setFocusMessage({ messageId: item.rootId, at: null });
    } else {
      setFocusMessage({ messageId: item.messageId, at: item.at });
    }
    onClose();
  }

  const current = loaded[tab];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <div className="flex flex-shrink-0 items-start justify-between gap-3 border-b border-gray-200 px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-gray-900">Files and links</h2>
            <p className="mt-1 truncate text-xs text-gray-500">
              Everything sent in {conversationTitle(conversation, user?.uid ?? '', nameOf)}, newest first.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            title="Close"
            className="flex-shrink-0 text-gray-400 hover:text-gray-700"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tabs rather than three headings down one page: each list can run to
            sixty, and the reader knows which of the three they want before
            they open this. */}
        <div className="flex flex-shrink-0 border-b border-gray-200 px-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm transition ${
                tab === t.key
                  ? 'border-brand-500 font-semibold text-brand-700'
                  : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}
            >
              <t.icon size={14} />
              {t.label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {error && <p className="text-sm text-red-600">{error}</p>}

          {!error && !current && <p className="text-sm text-gray-400">Loading…</p>}

          {!error && current && current.items.length === 0 && (
            <p className="text-sm text-gray-500">{emptyLine(tab)}</p>
          )}

          {!error && current && current.items.length > 0 && (
            tab === 'media' ? (
              <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                {current.items.map((item) => (
                  <MediaTile
                    key={`${item.messageId}:${item.attachment?.path}`}
                    item={item}
                    nameOf={nameOf}
                    formatDateTime={formatDateTime}
                    onOpen={() => setLightbox(item.attachment ?? null)}
                    onGoTo={() => goToMessage(item)}
                  />
                ))}
              </div>
            ) : (
              <ul className="space-y-1">
                {current.items.map((item) => (
                  <li key={`${item.messageId}:${item.attachment?.path ?? item.url}`}>
                    {tab === 'doc' ? (
                      <DocRow
                        item={item}
                        nameOf={nameOf}
                        formatDateTime={formatDateTime}
                        onGoTo={() => goToMessage(item)}
                      />
                    ) : (
                      <LinkRow
                        item={item}
                        nameOf={nameOf}
                        formatDateTime={formatDateTime}
                        onGoTo={() => goToMessage(item)}
                      />
                    )}
                  </li>
                ))}
              </ul>
            )
          )}

          {/* Said rather than implied. The list is bounded, not paged — see
              SHARED_PAGE_SIZE — and a panel that quietly stopped at sixty
              would have somebody swearing a file is missing when it is simply
              further back than this reaches. */}
          {current?.truncated && (
            <p className="mt-4 border-t border-gray-100 pt-3 text-[11px] text-gray-400">
              The most recent ones. Anything older is still in the conversation — search
              for the file name, or scroll the room back to it.
            </p>
          )}
        </div>
      </div>

      {lightbox && <Lightbox attachment={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}

const TABS: { key: SharedKind; label: string; icon: typeof ImageIcon }[] = [
  { key: 'media', label: 'Media',     icon: ImageIcon },
  { key: 'doc',   label: 'Documents', icon: FileText },
  { key: 'link',  label: 'Links',     icon: Link2 },
];

/** What an empty tab says. Each one names what would have filled it. */
function emptyLine(kind: SharedKind): string {
  if (kind === 'media') return 'No photos have been sent here.';
  if (kind === 'doc')   return 'No documents have been sent here.';
  return 'No links have been pasted here.';
}

/** Who sent it and when, on one line — the same line under all three kinds. */
function sentLine(
  item: SharedItem,
  nameOf: (uid: string) => string,
  formatDateTime: (value: Date, fallback?: string) => string,
): string {
  const who   = item.senderName || nameOf(item.senderUid);
  const when  = item.at ? formatDateTime(new Date(item.at), '') : '';
  const where = item.rootId ? ' · in a thread' : '';
  return `${who}${when ? ` · ${when}` : ''}${where}`;
}

/* ---------------------------------------------------------------- a photo */

function MediaTile({
  item, nameOf, formatDateTime, onOpen, onGoTo,
}: {
  item: SharedItem;
  nameOf: (uid: string) => string;
  formatDateTime: (value: Date, fallback?: string) => string;
  onOpen: () => void;
  onGoTo: () => void;
}) {
  const url = useStorageUrl(item.attachment?.path);

  return (
    <div className="group relative aspect-square overflow-hidden rounded-lg bg-gray-100">
      <button
        type="button"
        onClick={onOpen}
        // Who and when on hover rather than printed under every tile: a grid
        // where every square carries two lines of grey text is no longer a
        // grid of pictures, which is the one thing this tab is for.
        title={`${item.attachment?.name ?? ''}\n${sentLine(item, nameOf, formatDateTime)}`}
        className="absolute inset-0"
      >
        {url ? (
          <Image
            src={url}
            alt={item.attachment?.name ?? ''}
            fill
            unoptimized
            sizes="160px"
            // Cropped square rather than fitted: a grid of pictures in a dozen
            // shapes does not read as a grid, and the whole picture is one
            // click away.
            className="object-cover transition group-hover:opacity-90"
          />
        ) : (
          <span className="absolute inset-0 animate-pulse bg-gray-200" />
        )}
      </button>

      <button
        type="button"
        onClick={onGoTo}
        title="Go to the message"
        className="absolute right-1 top-1 rounded-md bg-white/85 p-1 text-gray-600 opacity-0 shadow transition hover:text-brand-600 group-hover:opacity-100"
      >
        <CornerUpRight size={13} />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------- a document */

function DocRow({
  item, nameOf, formatDateTime, onGoTo,
}: {
  item: SharedItem;
  nameOf: (uid: string) => string;
  formatDateTime: (value: Date, fallback?: string) => string;
  onGoTo: () => void;
}) {
  const url = useStorageUrl(item.attachment?.path);

  return (
    <div className="flex items-center gap-3 rounded-lg px-2 py-2 transition hover:bg-gray-50">
      <FileText size={18} className="flex-shrink-0 text-gray-400" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-gray-900">{item.attachment?.name}</p>
        <p className="truncate text-[11px] text-gray-500">
          {item.attachment ? `${readableSize(item.attachment.size)} · ` : ''}
          {sentLine(item, nameOf, formatDateTime)}
        </p>
      </div>
      <a
        href={url ?? undefined}
        target="_blank"
        rel="noopener noreferrer"
        title="Open the file"
        className={`flex-shrink-0 rounded-md p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 ${
          url ? '' : 'pointer-events-none opacity-40'
        }`}
      >
        <Download size={15} />
      </a>
      <GoToButton onGoTo={onGoTo} />
    </div>
  );
}

/* ----------------------------------------------------------------- a link */

function LinkRow({
  item, nameOf, formatDateTime, onGoTo,
}: {
  item: SharedItem;
  nameOf: (uid: string) => string;
  formatDateTime: (value: Date, fallback?: string) => string;
  onGoTo: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg px-2 py-2 transition hover:bg-gray-50">
      <Link2 size={18} className="flex-shrink-0 text-gray-400" />
      <div className="min-w-0 flex-1">
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block truncate text-sm text-brand-600 hover:underline"
        >
          {item.url}
        </a>
        {/* The sentence it was pasted in. An address on its own says where it
            goes and not why anybody sent it, and why is what somebody looking
            for it a month later actually remembers. */}
        {item.text.trim() && (
          <p className="truncate text-xs text-gray-600">{item.text}</p>
        )}
        <p className="truncate text-[11px] text-gray-500">
          {sentLine(item, nameOf, formatDateTime)}
        </p>
      </div>
      <GoToButton onGoTo={onGoTo} />
    </div>
  );
}

function GoToButton({ onGoTo }: { onGoTo: () => void }) {
  return (
    <button
      type="button"
      onClick={onGoTo}
      title="Go to the message"
      className="flex-shrink-0 rounded-md p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-brand-600"
    >
      <CornerUpRight size={15} />
    </button>
  );
}
