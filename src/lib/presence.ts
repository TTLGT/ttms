'use client';

import { useEffect, useState } from 'react';
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { getAppSettings } from './appSettings';
import {
  PRESENCE_COLLECTION,
  PRESENCE_HEARTBEAT_MS,
  type Presence,
} from '@/types/presence';

/**
 * Online status: sending your own, and watching somebody else's.
 *
 * Read and written straight from the browser, like chat, and for the same
 * reason it is safe: the document is addressed by uid, the rules let each
 * person write only their own, and there is no query for a rule to fail to
 * express. See `Presence` in src/types/presence.ts.
 */

/**
 * Whether the company has online status switched on.
 *
 * `null` until the settings have loaded, so nothing is written or watched on
 * a guess. A settings load that fails counts as off: this feature costs money
 * per write, and a failure should not be the thing that spends it.
 *
 * The settings are read once per page session (see getAppSettings), so
 * switching this off takes effect for each person the next time they load or
 * refresh TTMS — not instantly in a tab they already have open.
 */
export function usePresenceEnabled(): boolean | null {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    getAppSettings()
      .then((res) => { if (live) setEnabled(res.settings.presence); })
      .catch(() => { if (live) setEnabled(false); });
    return () => { live = false; };
  }, []);
  return enabled;
}

// ── Sending your own ─────────────────────────────────────────────────────────

/**
 * When this browser last sent a heartbeat, shared by every tab through
 * localStorage.
 *
 * That sharing is most of the saving. Without it, each open tab would write
 * on its own clock, and every full reload would write again straight away —
 * with people keeping chat in one tab and orders in two more, that is several
 * times the writes for exactly the same answer.
 */
const lastBeatKey = (uid: string) => `ttms.presence.lastBeat.${uid}`;
let lastBeatInMemory = 0;

function lastBeat(uid: string): number {
  try {
    return Number(window.localStorage.getItem(lastBeatKey(uid))) || 0;
  } catch {
    // Storage off, or private browsing: this tab keeps its own count.
    return lastBeatInMemory;
  }
}

function markBeat(uid: string, at: number) {
  lastBeatInMemory = at;
  try {
    window.localStorage.setItem(lastBeatKey(uid), String(at));
  } catch {
    // As above — the in-memory copy still stops this tab repeating itself.
  }
}

/** Input any more often than this is the same activity, not new activity. */
const INPUT_THROTTLE_MS = 15_000;

/** How often the idle check runs between input events. Costs nothing. */
const CHECK_EVERY_MS = 60_000;

/**
 * Tell colleagues you are here — at most once every five minutes, and only
 * while you are actually using TTMS.
 *
 * "Using" means the tab is visible and there has been a click, a key, a
 * scroll or a mouse move in the last five minutes. A tab left open over the
 * weekend writes nothing, so an idle browser neither shows somebody online
 * nor costs anything.
 */
export function usePresenceHeartbeat(uid: string | null | undefined, enabled: boolean | null) {
  useEffect(() => {
    if (!uid || !enabled) return;

    let lastInput = 0;

    const beat = () => {
      const now = Date.now();
      if (document.visibilityState !== 'visible') return;
      if (now - lastInput > PRESENCE_HEARTBEAT_MS) return;     // idle
      if (now - lastBeat(uid) < PRESENCE_HEARTBEAT_MS) return; // this or another tab already did

      // Claimed before the write rather than after it lands, so a second tab
      // checking in the meantime does not send one too. A write that fails is
      // not retried until the next five minutes are up: failed writes are not
      // billed, but a failing one retried on every mouse move is a flood.
      markBeat(uid, now);
      setDoc(doc(db, PRESENCE_COLLECTION, uid), { lastActiveAt: serverTimestamp() })
        .catch((e) => console.warn('[presence] heartbeat failed', e));
    };

    const onActivity = () => {
      const now = Date.now();
      if (now - lastInput < INPUT_THROTTLE_MS) return;
      lastInput = now;
      beat();
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') onActivity();
    };

    // Opening TTMS counts as using it.
    if (document.visibilityState === 'visible') onActivity();

    const events = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'] as const;
    for (const e of events) window.addEventListener(e, onActivity, { passive: true });
    window.addEventListener('focus', onActivity);
    document.addEventListener('visibilitychange', onVisibility);
    // Somebody reading a long thread moves the mouse at minute four and not
    // again until minute seven; this catches the beat that falls due at five.
    const timer = window.setInterval(beat, CHECK_EVERY_MS);

    return () => {
      for (const e of events) window.removeEventListener(e, onActivity);
      window.removeEventListener('focus', onActivity);
      document.removeEventListener('visibilitychange', onVisibility);
      window.clearInterval(timer);
    };
  }, [uid, enabled]);
}

// ── Watching somebody else's ─────────────────────────────────────────────────

/** How often the "online" judgement is redone as time passes. No reads. */
const RECHECK_MS = 30_000;

/**
 * One colleague's presence, live, plus a clock to judge it against.
 *
 * `now` ticks on its own because going offline is not an event — nothing is
 * written when somebody stops, so without the tick the header would say
 * "Online" until something else happened to re-render it.
 *
 * One listener, on one document, for as long as the conversation is open.
 * Each of their heartbeats is one read here; nothing at all when switched off.
 */
export function usePresence(uid: string | null | undefined, enabled: boolean | null): {
  presence: Presence | null;
  now: number;
} {
  const [presence, setPresence] = useState<Presence | null>(null);
  const [now, setNow]           = useState(() => Date.now());

  useEffect(() => {
    setPresence(null);
    if (!uid || !enabled) return;
    return onSnapshot(
      doc(db, PRESENCE_COLLECTION, uid),
      (snap) => setPresence(snap.exists() ? (snap.data() as Presence) : null),
      // Most likely the rules have not been deployed yet. Showing nothing is
      // the right failure: the header falls back to its old line.
      () => setPresence(null),
    );
  }, [uid, enabled]);

  useEffect(() => {
    if (!uid || !enabled) return;
    const timer = window.setInterval(() => setNow(Date.now()), RECHECK_MS);
    return () => window.clearInterval(timer);
  }, [uid, enabled]);

  return { presence, now };
}
