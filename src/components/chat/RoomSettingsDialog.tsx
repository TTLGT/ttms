'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import {
  Hash, ImagePlus, LogOut, MicOff, Search, Shield, UserMinus, Volume2, X,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useChat } from '@/context/ChatContext';
import { can } from '@/lib/accessControl';
import {
  NeedsSuccessorError, leaveConversation, listMemberEvents, updateRoom,
} from '@/lib/chat';
import { discardAttachment, uploadRoomPhoto } from '@/lib/chatUploads';
import { useDateFormatters } from '@/lib/useDateFormatters';
import { useStorageUrl } from '@/lib/useStorageUrl';
import DateField from '@/components/DateField';
import { UserAvatar } from '@/components/settings/UserAvatar';
import {
  ROOM_POLICY_SETTINGS,
  isMuted,
  isRoomAdmin,
  memberEventLine,
  mutedUntilFor,
  roomAdminUids,
  roomAllows,
  type Conversation,
  type MemberEvent,
  type RoomAudience,
  type RoomPolicy,
} from '@/types/conversation';

/**
 * What a room is called, who is in it, who runs it, and what it lets the rest
 * of them do.
 *
 * Open to any member. What they can actually change once they are in here
 * depends on what the room's admins have decided — the panel greys out what it
 * will not accept rather than hiding it, so somebody who cannot rename a room
 * finds out why instead of wondering where the box went. The server applies
 * the same tests; this is the explanation, not the gate.
 *
 * **Muting is the one thing here that is not staged behind Save.** Everything
 * else is a setting and reads as one, but a mute has a deadline attached and
 * is an act against one person rather than a property of the room — folding it
 * into the same Save would mean a date picker sitting open in the middle of a
 * form that also renames things, with no way to say which button applied it.
 */
export default function RoomSettingsDialog({
  conversation,
  onClose,
}: {
  conversation: Conversation;
  onClose: () => void;
}) {
  const { user, profile } = useAuth();
  const { people, setActiveId } = useChat();
  const myUid = user?.uid ?? '';

  const announcer = can(profile, 'chat.announce');
  const asAdmin   = { announcer };
  const iAmAdmin  = isRoomAdmin(conversation, myUid, asAdmin);

  const [name, setName]       = useState(conversation.name);
  const [members, setMembers] = useState<string[]>(conversation.memberUids);
  const [admins, setAdmins]   = useState<string[]>(roomAdminUids(conversation));
  const [policy, setPolicy]   = useState<Partial<RoomPolicy>>(conversation.policy ?? {});
  const [photo, setPhoto]     = useState<string | null>(conversation.photoPath ?? null);
  const [busy, setBusy]       = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError]     = useState('');

  const [search, setSearch]   = useState('');
  /** Whose mute panel is open, if any. Only one at a time. */
  const [muting, setMuting]   = useState<string | null>(null);
  /** Who is being offered the room when the last admin leaves. */
  const [handover, setHandover] = useState<string[] | null>(null);

  const picker = useRef<HTMLInputElement>(null);
  const photoUrl = useStorageUrl(photo);

  const [history, setHistory] = useState<MemberEvent[] | null>(null);
  const { formatDateTime } = useDateFormatters();

  const mayEditDetails    = roomAllows(conversation, 'details', myUid, asAdmin);
  const mayEditMembership = roomAllows(conversation, 'membership', myUid, asAdmin);

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

  const nameOf = (uid: string) => {
    const p = people.find((x) => x.uid === uid);
    return p?.displayName || p?.email || 'Someone';
  };

  /**
   * The people in the room, admins first and then alphabetically.
   *
   * Admins at the top because the question this list is usually opened to
   * answer is "who do I ask about this room", and an admin buried between two
   * brokers at the letter R is not an answer.
   */
  const inRoom = useMemo(() => {
    return [...members].sort((a, b) => {
      const byRole = Number(admins.includes(b)) - Number(admins.includes(a));
      return byRole !== 0 ? byRole : nameOf(a).localeCompare(nameOf(b));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members, admins, people]);

  /**
   * Who could be added, matching what has been typed.
   *
   * Nothing is offered until something is typed. The old grid listed every
   * person in the company with a tick beside them, which made the answer to
   * "who is in this room" — the thing people actually open this panel for —
   * something you had to work out by scanning forty rows for ticks.
   */
  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return people
      .filter((p) => !members.includes(p.uid))
      .filter((p) => `${p.displayName ?? ''} ${p.email ?? ''}`.toLowerCase().includes(q))
      .sort((a, b) => (a.displayName || a.email).localeCompare(b.displayName || b.email))
      .slice(0, 6);
  }, [people, members, search]);

  /* ------------------------------------------------------------- muting */

  /**
   * Applies a mute, or lifts one, straight away.
   *
   * Not staged behind Save — see the note at the top. The dialog stays open
   * afterwards, because muting somebody is very often one of two or three
   * things being done to a room in the same sitting.
   */
  async function applyMute(uid: string, until: number | null) {
    setBusy(true);
    setError('');
    try {
      await updateRoom(conversation.id, until === null ? { unmute: uid } : { mute: { uid, until } });
      setMuting(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That mute did not save.');
    } finally {
      setBusy(false);
    }
  }

  /* -------------------------------------------------------------- saving */

  async function save() {
    setBusy(true);
    setError('');
    try {
      await updateRoom(conversation.id, {
        // Only what this person is allowed to change is sent. The server
        // refuses the rest anyway, but sending a field it will refuse turns a
        // save that touched one legal thing into a 403 that saves nothing.
        ...(mayEditDetails    ? { name: name.trim(), photoPath: photo } : {}),
        ...(mayEditMembership ? { memberUids: members } : {}),
        ...(iAmAdmin          ? { adminUids: admins, policy } : {}),
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

  async function leave(successorUid?: string) {
    setBusy(true);
    setError('');
    try {
      await leaveConversation(conversation.id, successorUid);
      // Anything picked and not saved goes with them — they are leaving.
      tidyUp(conversation.photoPath ?? null);
      // Cleared before closing: the conversation is about to vanish from the
      // list, and a panel still pointing at it would sit there on a thread the
      // rules have just stopped allowing.
      setActiveId(null);
      onClose();
    } catch (e) {
      // The room would be left with nobody able to change anything about it,
      // so the answer is a question rather than an error: who takes over?
      if (e instanceof NeedsSuccessorError) {
        setHandover(e.candidates);
        setError('');
      } else {
        setError(e instanceof Error ? e.message : 'Could not leave the room.');
      }
      setBusy(false);
    }
  }

  const isCompanyRoom = conversation.kind === 'company';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-full w-full max-w-md flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
        <div className="flex flex-shrink-0 items-start justify-between border-b border-gray-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              {isCompanyRoom ? 'Everyone room' : 'Room settings'}
            </h2>
            <p className="mt-1 text-xs text-gray-500">
              {isCompanyRoom
                ? 'Everybody at Total Transport Logistics is in this room and always will be.'
                : iAmAdmin
                  ? 'You are an admin here. You can change anything on this page.'
                  : 'What you can change here is up to this room’s admins.'}
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
          {/*
            The company room has one switch and nothing else. It has no
            membership to change, no name worth changing and no picture, and
            the route reads nothing else from the body for exactly that reason.
          */}
          {isCompanyRoom ? (
            <CompanyPostSwitch
              conversation={conversation}
              announcer={announcer}
              onError={setError}
            />
          ) : (
            <>
              {/* The picture and the name together: they are the two halves of
                  what a room is recognised by in the list, and a picker parked
                  at the bottom of the dialog reads as an afterthought. */}
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
                      disabled={uploading || busy || !mayEditDetails}
                      className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
                    >
                      <ImagePlus size={14} />
                      {uploading ? 'Uploading…' : photo ? 'Replace' : 'Add a picture'}
                    </button>

                    {photo && !uploading && mayEditDetails && (
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
                    {mayEditDetails
                      ? 'Shown instead of the # beside the room. Everyone in the room sees it.'
                      : 'Only this room’s admins can change the name or the picture.'}
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
                disabled={!mayEditDetails || busy}
                className="mb-4 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 disabled:bg-gray-50 disabled:text-gray-500"
              />

              {/* ------------------------------------------------ who is in it */}

              <p className="mb-2 text-xs font-medium text-gray-600">
                Who is in it · {members.length}
              </p>

              <ul className="mb-3 space-y-0.5">
                {inRoom.map((uid) => (
                  <MemberRow
                    key={uid}
                    name={nameOf(uid)}
                    photoPath={people.find((p) => p.uid === uid)?.photoPath}
                    isMe={uid === myUid}
                    isAdmin={admins.includes(uid)}
                    mutedUntil={mutedUntilFor(conversation, uid)}
                    muted={isMuted(conversation, uid)}
                    viewerIsAdmin={iAmAdmin}
                    canRemove={mayEditMembership}
                    busy={busy}
                    muteOpen={muting === uid}
                    onToggleAdmin={() => setAdmins((was) =>
                      was.includes(uid) ? was.filter((u) => u !== uid) : [...was, uid])}
                    onRemove={() => {
                      setMembers((was) => was.filter((u) => u !== uid));
                      // Their admin goes with them, or the save would send an
                      // admin list naming somebody who is not in the room and
                      // the server would strip it silently.
                      setAdmins((was) => was.filter((u) => u !== uid));
                    }}
                    onOpenMute={() => setMuting(muting === uid ? null : uid)}
                    onMute={(until) => void applyMute(uid, until)}
                    formatDateTime={formatDateTime}
                  />
                ))}
              </ul>

              {/* Add by searching rather than by hunting through a grid of
                  everybody. The list above answers "who is in this room"; this
                  answers "put one more person in it", and mixing the two made
                  the first question unanswerable at a glance. */}
              {mayEditMembership ? (
                <div className="relative mb-2">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Add someone — type a name"
                    disabled={busy}
                    className="w-full rounded-lg border border-gray-300 py-2 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                  />

                  {search.trim() && (
                    <div className="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
                      {candidates.length === 0 ? (
                        <p className="px-3 py-2.5 text-xs text-gray-400">
                          Nobody else matches that.
                        </p>
                      ) : candidates.map((p) => (
                        <button
                          key={p.uid}
                          type="button"
                          onClick={() => {
                            setMembers((was) => [...was, p.uid]);
                            setSearch('');
                          }}
                          className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition hover:bg-brand-50"
                        >
                          <UserAvatar
                            photoPath={p.photoPath}
                            fallback={(p.displayName || p.email || '?').charAt(0).toUpperCase()}
                            size={24}
                          />
                          <span className="min-w-0 flex-1 truncate text-sm text-gray-900">
                            {p.displayName || p.email}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <p className="mb-2 text-[11px] text-gray-400">
                  Only this room’s admins can change who is in it.
                </p>
              )}

              {/* Taking somebody out does not take their messages out. Said
                  plainly here because the opposite is a reasonable thing to
                  assume, and finding out afterwards is the wrong time. */}
              <p className="mt-3 text-[11px] text-gray-400">
                Removing someone stops them seeing the room from now on. What they already
                wrote stays in it.
              </p>

              {/* ---------------------------------------------- what it allows */}

              <p className="mb-1 mt-5 border-t border-gray-100 pt-4 text-xs font-medium text-gray-600">
                What the room allows
              </p>
              <p className="mb-2.5 text-[11px] text-gray-400">
                {iAmAdmin
                  ? 'Admins can always do all of these. This is what everybody else can do.'
                  : 'Set by this room’s admins.'}
              </p>

              <div className="space-y-2">
                {ROOM_POLICY_SETTINGS.map((setting) => {
                  const value: RoomAudience = policy[setting.key] ?? 'everyone';
                  return (
                    <label
                      key={setting.key}
                      className={`flex items-start gap-2.5 ${iAmAdmin ? 'cursor-pointer' : ''}`}
                    >
                      <input
                        type="checkbox"
                        // Ticked means restricted, because the thing an admin
                        // is looking for on this page is what they have turned
                        // *off*, and a page of boxes that are all ticked by
                        // default says nothing at a glance.
                        checked={value === 'admins'}
                        disabled={!iAmAdmin || busy}
                        onChange={(e) => setPolicy((was) => ({
                          ...was, [setting.key]: e.target.checked ? 'admins' : 'everyone',
                        }))}
                        className="mt-0.5 h-4 w-4 flex-shrink-0 rounded border-gray-300 text-brand-500 focus:ring-brand-400 disabled:opacity-50"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm text-gray-900">{setting.label}</span>
                        <span className="block text-[11px] text-gray-500">
                          {value === 'admins' ? setting.restricted : 'Anybody in the room.'}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </>
          )}

          {/* Who has been in the room, who put them there, and what was
              changed. Anybody in a room can open this, which is the point:
              somebody whose composer stopped working can find out who turned
              it off and when, rather than asking around. */}
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
              Nothing recorded yet. Changes to the room show here from now on.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {history.map((event) => (
                <li key={event.id} className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="min-w-0 text-gray-700">
                    {memberEventLine(event, (ms) => formatDateTime(new Date(ms), ''))}
                  </span>
                  <span className="flex-shrink-0 text-[11px] text-gray-400">
                    {formatDateTime(event.at, '')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {error && <p className="flex-shrink-0 px-5 text-xs text-red-500">{error}</p>}

        {/*
          The handover. Shown in place of the ordinary footer, because this is
          not a warning to be read past — the room cannot be left until it is
          answered, and offering Leave again beside it would just repeat the
          refusal.
        */}
        {handover ? (
          <div className="flex-shrink-0 border-t border-gray-200 px-5 py-4">
            <p className="text-sm font-medium text-gray-900">
              You are the only admin here.
            </p>
            <p className="mb-2.5 mt-0.5 text-[11px] text-gray-500">
              Somebody has to be able to change this room after you have gone. Choose
              who takes over, and you will leave at the same time.
            </p>
            <div className="max-h-40 overflow-y-auto">
              {handover.map((uid) => (
                <button
                  key={uid}
                  type="button"
                  disabled={busy}
                  onClick={() => void leave(uid)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition hover:bg-brand-50 disabled:opacity-50"
                >
                  <UserAvatar
                    photoPath={people.find((p) => p.uid === uid)?.photoPath}
                    fallback={nameOf(uid).charAt(0).toUpperCase()}
                    size={28}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm text-gray-900">
                    {nameOf(uid)}
                  </span>
                  <span className="flex-shrink-0 text-[11px] font-medium text-brand-600">
                    Hand over and leave
                  </span>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setHandover(null)}
              className="mt-2 text-xs text-gray-500 transition hover:text-gray-800"
            >
              Stay in the room
            </button>
          </div>
        ) : (
          <div className="flex flex-shrink-0 items-center justify-between border-t border-gray-200 px-5 py-4">
            {/* The company room cannot be left — everybody is in it by
                definition — so there is nothing to offer here on it. */}
            {isCompanyRoom ? <span /> : (
              <button
                type="button"
                onClick={() => void leave()}
                disabled={busy}
                className="flex items-center gap-1.5 text-sm text-red-500 transition hover:text-red-700 disabled:opacity-50"
              >
                <LogOut size={14} /> Leave room
              </button>
            )}
            {isCompanyRoom ? <span /> : (
              <button
                type="button"
                onClick={() => void save()}
                disabled={busy || uploading || !name.trim() || members.length === 0}
                className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-600 disabled:opacity-40"
              >
                {busy ? 'Saving…' : 'Save'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- a member */

function MemberRow({
  name, photoPath, isMe, isAdmin, muted, mutedUntil, viewerIsAdmin, canRemove,
  busy, muteOpen, onToggleAdmin, onRemove, onOpenMute, onMute, formatDateTime,
}: {
  name: string;
  photoPath?: string | null;
  isMe: boolean;
  isAdmin: boolean;
  muted: boolean;
  mutedUntil: number;
  viewerIsAdmin: boolean;
  canRemove: boolean;
  busy: boolean;
  muteOpen: boolean;
  onToggleAdmin: () => void;
  onRemove: () => void;
  onOpenMute: () => void;
  onMute: (until: number | null) => void;
  formatDateTime: (value: Date, fallback?: string) => string;
}) {
  return (
    <li className="rounded-lg px-2 py-1.5 transition hover:bg-gray-50">
      <div className="flex items-center gap-2.5">
        <UserAvatar
          photoPath={photoPath}
          fallback={name.charAt(0).toUpperCase()}
          size={30}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-gray-900">
            {name}{isMe && <span className="text-gray-400"> · you</span>}
          </p>
          {muted && (
            <p className="truncate text-[11px] text-amber-600">
              Muted until {formatDateTime(new Date(mutedUntil), '')}
            </p>
          )}
        </div>

        {isAdmin && (
          <span className="flex flex-shrink-0 items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-700">
            <Shield size={10} /> Admin
          </span>
        )}

        {viewerIsAdmin && (
          <button
            type="button"
            onClick={onToggleAdmin}
            disabled={busy}
            title={isAdmin ? 'Take their admin away' : 'Make them an admin'}
            className={`flex-shrink-0 rounded p-1.5 transition disabled:opacity-40 ${
              isAdmin ? 'text-brand-500 hover:bg-brand-50' : 'text-gray-300 hover:bg-gray-100 hover:text-gray-600'
            }`}
          >
            <Shield size={14} />
          </button>
        )}

        {/* An admin is not mutable — the server refuses it, because a mute they
            can lift themselves is theatre. Nor is yourself. */}
        {viewerIsAdmin && !isMe && !isAdmin && (
          <button
            type="button"
            onClick={muted ? () => onMute(null) : onOpenMute}
            disabled={busy}
            title={muted ? 'Lift the mute' : 'Stop them writing here for a while'}
            className={`flex-shrink-0 rounded p-1.5 transition disabled:opacity-40 ${
              muted ? 'text-amber-600 hover:bg-amber-50' : 'text-gray-300 hover:bg-gray-100 hover:text-gray-600'
            }`}
          >
            {muted ? <Volume2 size={14} /> : <MicOff size={14} />}
          </button>
        )}

        {canRemove && !isMe && (
          <button
            type="button"
            onClick={onRemove}
            disabled={busy}
            title="Take them out of the room"
            className="flex-shrink-0 rounded p-1.5 text-gray-300 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
          >
            <UserMinus size={14} />
          </button>
        )}
      </div>

      {muteOpen && !muted && (
        <MutePanel name={name} busy={busy} onMute={onMute} onCancel={onOpenMute} />
      )}
    </li>
  );
}

/**
 * Setting a mute's deadline.
 *
 * **There is no "forever".** A mute with no clock on it is somebody quietly
 * silenced until an admin who may have left the company remembers to undo it,
 * and nothing in this project runs on a schedule that would ever notice. An
 * admin who wants somebody permanently unable to write in a room is describing
 * taking them out of it, which is the button next to this one.
 *
 * The date goes through DateField rather than a native date input, like every
 * other date typed in this app — a native one takes its format from the
 * browser's language, which is neither the company setting nor anything the
 * app can read. The time beside it is an ordinary time input, which has no
 * such ambiguity.
 */
function MutePanel({
  name, busy, onMute, onCancel,
}: {
  name: string;
  busy: boolean;
  onMute: (until: number) => void;
  onCancel: () => void;
}) {
  // Tomorrow at the same time, as the opening suggestion: the commonest mute
  // is "not for the rest of today", and a blank pair of boxes makes the
  // shortest path the one where somebody types a wrong year.
  const [date, setDate] = useState(() => {
    const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [time, setTime] = useState('09:00');

  // Built in the browser's own zone, which is the one the admin is reading the
  // clock in. Everyone here is in one place; a room-level timezone would be
  // machinery for a company that does not exist yet.
  const until = date ? new Date(`${date}T${time || '00:00'}`).getTime() : NaN;
  const valid = Number.isFinite(until) && until > Date.now();

  return (
    <div className="mt-1.5 rounded-lg border border-amber-200 bg-amber-50/60 px-2.5 py-2">
      <p className="mb-1.5 text-[11px] text-gray-600">
        Stop <span className="font-medium">{name}</span> writing here until:
      </p>
      <div className="flex items-center gap-1.5">
        <DateField
          value={date}
          onChange={setDate}
          disabled={busy}
          ariaLabel={`Mute ${name} until this date`}
          className="min-w-0 flex-1 rounded-lg border border-gray-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-400"
        />
        <input
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          disabled={busy}
          aria-label={`Mute ${name} until this time`}
          className="w-[86px] flex-shrink-0 rounded-lg border border-gray-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-400"
        />
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => onMute(until)}
          disabled={busy || !valid}
          className="rounded-lg bg-amber-600 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-amber-700 disabled:opacity-40"
        >
          Mute
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="text-xs text-gray-500 transition hover:text-gray-800"
        >
          Cancel
        </button>
        {/* Said here because this one button does not wait for Save, unlike
            everything else on this page. */}
        <span className="ml-auto text-[10px] text-gray-400">Applied straight away</span>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------- the company room */

/**
 * The one switch the Everyone room has.
 *
 * Separate from the policy list above because only one of the six means
 * anything here — a room everybody is in has no membership to restrict, no
 * name and no picture — and a panel of five greyed-out switches would be
 * asking the reader to work out which one was real.
 *
 * Saved on the spot rather than behind the dialog's Save button, which this
 * branch does not show: there is exactly one thing to change, so a Save button
 * would be a second click for no decision.
 */
function CompanyPostSwitch({
  conversation, announcer, onError,
}: {
  conversation: Conversation;
  announcer: boolean;
  onError: (message: string) => void;
}) {
  const restricted = (conversation.policy?.post ?? 'everyone') === 'admins';
  const [busy, setBusy] = useState(false);

  async function set(next: RoomAudience) {
    setBusy(true);
    onError('');
    try {
      await updateRoom(conversation.id, { policy: { post: next } });
    } catch (e) {
      onError(e instanceof Error ? e.message : 'That did not save.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <p className="mb-2 text-xs font-medium text-gray-600">Who can post here</p>
      <label className="flex items-start gap-2.5">
        <input
          type="checkbox"
          checked={restricted}
          disabled={!announcer || busy}
          onChange={(e) => void set(e.target.checked ? 'admins' : 'everyone')}
          className="mt-0.5 h-4 w-4 flex-shrink-0 rounded border-gray-300 text-brand-500 focus:ring-brand-400 disabled:opacity-50"
        />
        <span className="min-w-0">
          <span className="block text-sm text-gray-900">Announcements only</span>
          <span className="block text-[11px] text-gray-500">
            {restricted
              ? 'Only admins and HR can write here. Everybody can still read it.'
              : 'Anybody at the company can write here.'}
          </span>
        </span>
      </label>

      <p className="mt-3 text-[11px] text-gray-400">
        {announcer
          ? 'Anybody else who needs to post company-wide can be given “Post in the Everyone room” in Settings → People.'
          : 'Only an admin or HR can change this.'}
      </p>
    </>
  );
}
