'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { Hash, ImagePlus, LogOut, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useChat } from '@/context/ChatContext';
import { leaveConversation, listMemberEvents, updateGroupConversation } from '@/lib/chat';
import { discardAttachment, uploadRoomPhoto } from '@/lib/chatUploads';
import { useDateFormatters } from '@/lib/useDateFormatters';
import { useStorageUrl } from '@/lib/useStorageUrl';
import { UserAvatar } from '@/components/settings/UserAvatar';
import { memberEventLine, type Conversation, type MemberEvent } from '@/types/conversation';

/**
 * Renaming a room, giving it a picture, and changing who is in it.
 *
 * Open to any member, not only whoever created it. A room is a working space,
 * not an owned record — the person who happened to open it is often not the
 * one still running it a month later, and there is no admin layer here to
 * appeal to. The server applies the same test.
 */
export default function RoomSettingsDialog({
  conversation,
  onClose,
}: {
  conversation: Conversation;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const { people, setActiveId } = useChat();
  const myUid = user?.uid ?? '';

  const [name, setName]       = useState(conversation.name);
  const [members, setMembers] = useState<string[]>(conversation.memberUids);
  const [photo, setPhoto]     = useState<string | null>(conversation.photoPath ?? null);
  const [busy, setBusy]       = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError]     = useState('');

  const picker = useRef<HTMLInputElement>(null);
  const photoUrl = useStorageUrl(photo);

  const [history, setHistory] = useState<MemberEvent[] | null>(null);
  const { formatDateTime } = useDateFormatters();

  /*
   * The history is read once, when the dialog opens.
   *
   * Not refreshed after a save, and deliberately: saving closes the dialog, so
   * the only way to see the entry a change just wrote is to open it again —
   * where it is read fresh. A listener would cost a read per room for a panel
   * that is shut almost all of the time.
   */
  useEffect(() => {
    let live = true;
    void listMemberEvents(conversation.id)
      .then((rows) => { if (live) setHistory(rows); })
      // An empty list rather than an error: the history is the least important
      // thing in this dialog, and a room that cannot show it is still a room
      // that can be renamed and have its members changed.
      .catch(() => { if (live) setHistory([]); });
    return () => { live = false; };
  }, [conversation.id]);

  /**
   * Every picture uploaded while this dialog has been open.
   *
   * A picture is in the bucket the moment it is chosen, but the room does not
   * point at it until Save. Without this list, choosing three pictures before
   * settling on one would leave two files nothing points at and nothing will
   * ever clean up — the same bookkeeping the composer does for attachments.
   */
  const uploaded = useRef<string[]>([]);

  /** Deletes every uploaded file except the one the room ends up wearing. */
  function tidyUp(keep: string | null) {
    const original = conversation.photoPath ?? null;
    for (const path of uploaded.current) {
      if (path !== keep) void discardAttachment(path);
    }
    // The picture being replaced, once the replacement is safely stored.
    if (original && keep !== original) void discardAttachment(original);
    uploaded.current = [];
  }

  async function pick(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const path = await uploadRoomPhoto(conversation.id, file);
      uploaded.current.push(path);
      setPhoto(path);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not upload that picture.');
    } finally {
      setUploading(false);
    }
  }

  const others = useMemo(
    () => people
      .filter((p) => p.uid !== myUid)
      .sort((a, b) => (a.displayName || a.email).localeCompare(b.displayName || b.email)),
    [people, myUid],
  );

  async function save() {
    setBusy(true);
    setError('');
    try {
      await updateGroupConversation(conversation.id, {
        name: name.trim(), memberUids: members, photoPath: photo,
      });
      // Only after the room is pointing at the new picture: deleting the old
      // one first would leave the room showing a broken image if the save
      // then failed.
      tidyUp(photo);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save those changes.');
      setBusy(false);
    }
  }

  async function leave() {
    setBusy(true);
    setError('');
    try {
      await leaveConversation(conversation.id);
      // Anything picked and not saved goes with them — they are leaving.
      tidyUp(conversation.photoPath ?? null);
      // Cleared before closing: the conversation is about to vanish from the
      // list, and a panel still pointing at it would sit there on a thread the
      // rules have just stopped allowing.
      setActiveId(null);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not leave the room.');
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-full w-full max-w-md flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
        <div className="flex flex-shrink-0 items-start justify-between border-b border-gray-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Room settings</h2>
            <p className="mt-1 text-xs text-gray-500">
              Anyone in the room can rename it, give it a picture, or change who is in it.
            </p>
          </div>
          <button
            type="button"
            onClick={() => { tidyUp(conversation.photoPath ?? null); onClose(); }}
            title="Close"
            className="text-gray-400 hover:text-gray-700"
          >
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {/* The picture and the name together: they are the two halves of
              what a room is recognised by in the list, and a picker parked at
              the bottom of the dialog reads as an afterthought. */}
          <p className="mb-1 text-xs font-medium text-gray-600">Picture</p>
          <div className="mb-4 flex items-center gap-3">
            <span className="relative flex h-14 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-100 text-brand-700">
              {photoUrl
                ? <Image src={photoUrl} alt="" fill unoptimized sizes="56px" className="object-cover" />
                : <Hash size={22} />}
            </span>

            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => picker.current?.click()}
                  disabled={uploading || busy}
                  className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
                >
                  <ImagePlus size={14} />
                  {uploading ? 'Uploading…' : photo ? 'Replace' : 'Add a picture'}
                </button>

                {photo && !uploading && (
                  <button
                    type="button"
                    onClick={() => setPhoto(null)}
                    disabled={busy}
                    className="text-sm text-gray-500 transition hover:text-red-600 disabled:opacity-50"
                  >
                    Remove
                  </button>
                )}
              </div>
              <p className="text-[11px] text-gray-400">
                Shown instead of the # beside the room. Everyone in the room sees it.
              </p>
            </div>

            <input
              ref={picker}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                void pick(e.target.files?.[0]);
                // Cleared so choosing the same file twice in a row still fires.
                e.target.value = '';
              }}
            />
          </div>

          <label className="mb-1 block text-xs font-medium text-gray-600">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mb-4 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
          />

          <p className="mb-2 text-xs font-medium text-gray-600">Who is in it</p>
          {others.map((p) => {
            const inRoom = members.includes(p.uid);
            return (
              <button
                key={p.uid}
                type="button"
                onClick={() =>
                  setMembers((was) =>
                    was.includes(p.uid) ? was.filter((u) => u !== p.uid) : [...was, p.uid],
                  )
                }
                className={`mb-0.5 flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-gray-50 ${
                  inRoom ? 'bg-brand-50' : ''
                }`}
              >
                <UserAvatar
                  photoPath={p.photoPath}
                  fallback={(p.displayName || p.email || '?').charAt(0).toUpperCase()}
                  size={32}
                />
                <span className="min-w-0 flex-1 truncate text-sm text-gray-900">
                  {p.displayName || p.email}
                </span>
                <span
                  aria-hidden
                  className={`h-4 w-4 flex-shrink-0 rounded border ${
                    inRoom ? 'border-brand-500 bg-brand-500' : 'border-gray-300'
                  }`}
                />
              </button>
            );
          })}

          {/* Taking somebody out does not take their messages out. Said plainly
              here because the opposite is a reasonable thing to assume, and
              finding out afterwards is the wrong time. */}
          <p className="mt-3 text-[11px] text-gray-400">
            Removing someone stops them seeing the room from now on. What they already
            wrote stays in it.
          </p>

          {/* Who has been in the room and who put them there. Anybody in a room
              can change who else is in it, so the answer to "who took Tom out
              of this?" has to be somewhere, and this is it. */}
          <p className="mb-2 mt-5 border-t border-gray-100 pt-4 text-xs font-medium text-gray-600">
            History
          </p>

          {history === null ? (
            <p className="text-[11px] text-gray-400">Loading…</p>
          ) : history.length === 0 ? (
            // Said rather than left blank: every room that existed before this
            // was recorded shows nothing here, and an empty panel with no
            // explanation reads as a room nobody has ever touched.
            <p className="text-[11px] text-gray-400">
              Nothing recorded yet. Changes to who is in the room show here from now on.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {history.map((event) => (
                <li key={event.id} className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="min-w-0 text-gray-700">{memberEventLine(event)}</span>
                  <span className="flex-shrink-0 text-[11px] text-gray-400">
                    {formatDateTime(event.at, '')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {error && <p className="flex-shrink-0 px-5 text-xs text-red-500">{error}</p>}

        <div className="flex flex-shrink-0 items-center justify-between border-t border-gray-200 px-5 py-4">
          <button
            type="button"
            onClick={() => void leave()}
            disabled={busy}
            className="flex items-center gap-1.5 text-sm text-red-500 transition hover:text-red-700 disabled:opacity-50"
          >
            <LogOut size={14} /> Leave room
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy || uploading || !name.trim() || members.length === 0}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-600 disabled:opacity-40"
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
