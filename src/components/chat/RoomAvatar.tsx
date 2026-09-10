'use client';

import Image from 'next/image';
import { Hash, Truck } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useChat } from '@/context/ChatContext';
import { useStorageUrl } from '@/lib/useStorageUrl';
import { UserAvatar } from '@/components/settings/UserAvatar';
import { conversationTitle, otherMemberUid, type Conversation } from '@/types/conversation';

/**
 * The circle in front of a conversation: the company logo on the everyone
 * room, a face for a direct thread, the room's own picture if it has been
 * given one, and the symbol for its kind if it has not.
 *
 * Shared by the list and the panel header rather than drawn in both, because
 * the two are read together — a room recognised by its picture in the list has
 * to be the same picture at the top of the room it opens, or the picture is
 * decoration instead of identification.
 */
export default function RoomAvatar({
  conversation, size = 32,
}: {
  conversation: Conversation;
  size?: number;
}) {
  const { user } = useAuth();
  const { profileOf, nameOf } = useChat();

  const myUid = user?.uid ?? '';
  const title = conversationTitle(conversation, myUid, nameOf);
  const other = otherMemberUid(conversation, myUid);

  const photo = useStorageUrl(conversation.kind === 'group' ? conversation.photoPath : null);

  if (conversation.kind === 'direct' && other) {
    return (
      <UserAvatar
        photoPath={profileOf(other)?.photoPath}
        fallback={title.charAt(0).toUpperCase()}
        size={size}
      />
    );
  }

  // The everyone-room wears the company logo, and it is read straight off the
  // asset in `public/` rather than uploaded and stored like a room's picture.
  // There is exactly one company room and it is the company, so the picture is
  // not something anybody should be able to change from a chat dialog — it is
  // the same file the sidebar, the login page and the PDFs use, and it moves
  // when that file does.
  if (conversation.kind === 'company') {
    return (
      <Image
        src="/logo-circle.png"
        alt=""
        width={size}
        height={size}
        className="flex-shrink-0 rounded-full"
      />
    );
  }

  if (photo) {
    return (
      <span
        className="relative flex-shrink-0 overflow-hidden rounded-full bg-gray-100"
        style={{ width: size, height: size }}
      >
        <Image
          src={photo}
          alt=""
          fill
          unoptimized
          sizes={`${size}px`}
          // Cropped to fill rather than fitted: a room picture is a badge to
          // recognise at a glance, and a letterboxed one in a list of circles
          // reads as a broken image.
          className="object-cover"
        />
      </span>
    );
  }

  return (
    <span
      className="flex flex-shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700"
      style={{ width: size, height: size }}
    >
      {/* A room about a load is not a room somebody made, and the symbol says
          so: it is the one kind of room that appears in your list without
          anybody having invited you to it. */}
      {conversation.kind === 'record'
        ? <Truck size={Math.round(size * 0.47)} />
        : <Hash size={Math.round(size * 0.47)} />}
    </span>
  );
}
