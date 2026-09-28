'use client';

import { useEffect, useRef, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import { getAppSettings } from './appSettings';
import { sendBeat } from './attendance';
import {
  PRESENCE_COLLECTION,
  PRESENCE_HEARTBEAT_MS,
  type Presence,
} from '@/types/presence';

/**
 * Online status and the attendance heartbeat: sending your own, and watching
 * somebody else's.
 *
 * Sending goes through POST /api/attendance/beat — the server writes both the
 * presence document and the day's active or idle minutes. Watching is a live
 * read of one colleague's presence document, like chat.
 */

/**
 * Whether the company has the heartbeat switched on (Settings → Online
 * Status).
 *
 * `null` until the settings have loaded, so nothing is sent or watched on a
 * guess. A failed load counts as off: this costs money per write, and a
 * failure should not be what spends it.
 *
 * Read once per page session, so switching it off takes effect for each
 * person the next time they load or refresh TTMS.
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
 * localStorage. That sharing is most of the saving: without it each open tab
 * would beat on its own clock, and every reload would beat again at once.
 */
const lastBeatKey = (uid: string) => `ttms.presence.lastBeat.${uid}`;
let lastBeatInMemory = 0;

function lastBeat(uid: string): number {
  try {
    return Number(window.localStorage.getItem(lastBeatKey(uid))) || 0;
  } catch {
    return lastBeatInMemory;
  }
}

function markBeat(uid: string, at: number) {
  lastBeatInMemory = at;
  try {
    window.localStorage.setItem(lastBeatKey(uid), String(at));
  } catch {
    // The in-memory copy still stops this tab repeating itself.
  }
}

/** Input any more often than this is the same activity, not new activity. */
const INPUT_THROTTLE_MS = 15_000;

/** How often the beat is considered between input events. Costs nothing. */
const CHECK_EVERY_MS = 60_000;

/** Input shared across tabs, so a busy chat tab makes the orders tab's beat active. */
const LAST_INPUT_KEY = 'ttms.presence.lastInput';

/**
 * At most one beat every five minutes per browser.
 *
 * - **Active** — a click, key, scroll or mouse move since the last beat, in
 *   any TTMS tab. Shows as Online and counts as active minutes.
 * - **Idle** — no input, but clocked in. Sent anyway, so the day records idle
 *   minutes and colleagues see Away rather than a stale Online. Not sent at
 *   all when clocked out: an idle browser outside working hours costs nothing.
 *
 * `hidden` is the person's own "hide my last seen": the server then leaves
 * presence alone and records the day only.
 */
export function usePresenceHeartbeat(
  uid: string | null | undefined,
  enabled: boolean | null,
  opts: { clockedIn: boolean; hidden: boolean },
) {
  // Read through refs so clocking in does not tear the listeners down and
  // lose the input that has been seen so far.
  const optsRef = useRef(opts);
  optsRef.current = opts;

  useEffect(() => {
    if (!uid || !enabled) return;

    let lastInputLocal = 0;
    const lastInput = () => {
      let shared = 0;
      try { shared = Number(window.localStorage.getItem(LAST_INPUT_KEY)) || 0; } catch { /* private window */ }
      return Math.max(shared, lastInputLocal);
    };

    const beat = () => {
      const now = Date.now();
      const since = lastBeat(uid);
      if (now - since < PRESENCE_HEARTBEAT_MS) return; // this or another tab already did

      const active = now - lastInput() <= PRESENCE_HEARTBEAT_MS;
      const { clockedIn, hidden } = optsRef.current;
      if (!active && !clockedIn) return;

      // Claimed before the send, so a second tab checking meanwhile does not
      // send one too. Not retried early on failure: a failing beat retried on
      // every mouse move is a flood.
      markBeat(uid, now);
      sendBeat({ active, clockedIn, hidden }).catch((e) => console.warn('[presence] heartbeat failed', e));
    };

    const onActivity = () => {
      const now = Date.now();
      if (now - lastInputLocal < INPUT_THROTTLE_MS) return;
      lastInputLocal = now;
      try { window.localStorage.setItem(LAST_INPUT_KEY, String(now)); } catch { /* memory only */ }
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
 * One colleague's presence, live, plus a clock to judge it against. `now`
 * ticks on its own because going offline is not an event — nothing is
 * written when somebody stops.
 *
 * One listener, on one document, while the conversation is open. Each of
 * their heartbeats is one read here; nothing at all when switched off.
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
