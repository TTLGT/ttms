'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AtSign, Building2, MessageCircle, Phone } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useChat } from '@/context/ChatContext';
import { openDirectConversation } from '@/lib/chat';
import { listSites } from '@/lib/sites';
import { listTeams } from '@/lib/teams';
import { UserAvatar } from '@/components/settings/UserAvatar';

/**
 * The card behind a name in a message.
 *
 * Clicking @Maria in a thread should answer the two questions that follow it —
 * who is that, and how do I reach them — without leaving the conversation to
 * go and look. The message button is the point: a mention is usually the exact
 * moment somebody realises they need a word with that person directly.
 *
 * **It shows only what the Directory shows everyone.** Name, company email, US
 * work line, extension, office and team. Not the second phone number: the
 * Directory holds that back from brokers as an editorial call — it is usually
 * a personal mobile — and a card that quietly showed it would undo that
 * decision everywhere a name appears. See the note at the top of
 * lib/directory.ts before adding a field here.
 */

/** Sites and teams are small, static reference data, so one fetch per session
 *  is plenty — and it only happens the first time anyone opens a card. */
const referenceCache: { sites?: Map<string, string>; teams?: Map<string, string> } = {};

const CARD_WIDTH = 268;

export default function PersonCard({
  uid,
  anchor,
  onClose,
}: {
  uid: string;
  /** Where the clicked name sits on screen, so the card can hang off it. */
  anchor: DOMRect;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const { profileOf, nameOf, setActiveId } = useChat();
  const card = useRef<HTMLDivElement>(null);

  const [names, setNames] = useState<{ site?: string; team?: string }>({});
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState('');
  const [placement, setPlacement] = useState<{ left: number; top: number } | null>(null);

  const person = profileOf(uid);
  const isMe   = uid === user?.uid;

  // Measured, then placed: the card is positioned against the viewport rather
  // than inside the thread, because the thread scrolls and clips and a popover
  // anchored inside it would be cut off at the edges.
  useLayoutEffect(() => {
    const el = card.current;
    if (!el) return;
    const height = el.offsetHeight;
    const margin = 8;

    let left = anchor.left;
    if (left + CARD_WIDTH > window.innerWidth - margin) {
      left = window.innerWidth - CARD_WIDTH - margin;
    }
    left = Math.max(margin, left);

    // Below the name by default, flipped above when there is no room — which
    // is most of the time in the floating panel, where the thread sits low on
    // the screen.
    let top = anchor.bottom + 6;
    if (top + height > window.innerHeight - margin) {
      top = Math.max(margin, anchor.top - height - 6);
    }

    setPlacement({ left, top });
  }, [anchor]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!card.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    // Captured, so the card closes even when the click lands on something that
    // stops the event on its way up.
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  // Office and team names, fetched the first time a card is opened in this
  // session and then reused. Loading them with the chat would be two requests
  // on every dashboard page for something most people never open.
  useEffect(() => {
    let live = true;
    const resolve = (sites: Map<string, string>, teams: Map<string, string>) => {
      if (!live) return;
      setNames({
        site: person?.siteId ? sites.get(person.siteId) : undefined,
        team: person?.teamId ? teams.get(person.teamId) : undefined,
      });
    };

    if (referenceCache.sites && referenceCache.teams) {
      resolve(referenceCache.sites, referenceCache.teams);
      return;
    }
    void Promise.all([listSites(), listTeams()])
      .then(([sites, teams]) => {
        referenceCache.sites = new Map(sites.map((s) => [s.id, s.name]));
        referenceCache.teams = new Map(teams.map((t) => [t.id, t.name]));
        resolve(referenceCache.sites, referenceCache.teams);
      })
      // A card without an office line is still a useful card.
      .catch(() => {});
    return () => { live = false; };
  }, [person?.siteId, person?.teamId]);

  async function message() {
    setOpening(true);
    setError('');
    try {
      setActiveId(await openDirectConversation(uid));
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open that conversation.');
      setOpening(false);
    }
  }

  const displayName = person?.displayName || nameOf(uid);
  const where = [names.site, names.team].filter(Boolean).join(' · ');

  return (
    <div
      ref={card}
      role="dialog"
      aria-label={displayName}
      style={{
        left: placement?.left ?? anchor.left,
        top:  placement?.top ?? anchor.bottom + 6,
        width: CARD_WIDTH,
        // Hidden for the single frame between mounting and being measured, so
        // it does not flash in the wrong place first.
        visibility: placement ? 'visible' : 'hidden',
      }}
      className="fixed z-50 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl"
    >
      <div className="flex items-center gap-3 border-b border-gray-100 px-4 py-3.5">
        <UserAvatar
          photoPath={person?.photoPath}
          fallback={displayName.charAt(0).toUpperCase()}
          size={44}
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-900">{displayName}</p>
          {where && <p className="truncate text-xs text-gray-500">{where}</p>}
        </div>
      </div>

      <div className="flex flex-col gap-1.5 px-4 py-3">
        {person?.email && (
          <a
            href={`mailto:${person.email}`}
            className="flex items-center gap-2 text-xs text-gray-600 transition hover:text-brand-600"
          >
            <AtSign size={13} className="flex-shrink-0 text-gray-400" />
            <span className="truncate">{person.email}</span>
          </a>
        )}
        {person?.phone && (
          <a
            href={`tel:${person.phone}`}
            className="flex items-center gap-2 text-xs text-gray-600 transition hover:text-brand-600"
          >
            <Phone size={13} className="flex-shrink-0 text-gray-400" />
            <span className="truncate">
              {person.phone}
              {person.extension && (
                <span className="text-gray-400"> ext. {person.extension}</span>
              )}
            </span>
          </a>
        )}
        {!person && (
          // The uid is on the message but no profile came back for it — someone
          // removed from the system since they were named.
          <p className="flex items-center gap-2 text-xs text-gray-400">
            <Building2 size={13} className="flex-shrink-0" />
            No longer in TTMS
          </p>
        )}
      </div>

      {error && <p className="px-4 pb-2 text-xs text-red-500">{error}</p>}

      {/* No button for yourself — a thread with one person in it is not a
          conversation, and the server refuses it anyway. */}
      {!isMe && person && (
        <div className="border-t border-gray-100 p-2">
          <button
            type="button"
            onClick={() => void message()}
            disabled={opening}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-500 px-3 py-2 text-xs font-medium text-white transition hover:bg-brand-600 disabled:opacity-50"
          >
            <MessageCircle size={13} />
            {opening ? 'Opening…' : `Message ${displayName.split(' ')[0]}`}
          </button>
        </div>
      )}
    </div>
  );
}
