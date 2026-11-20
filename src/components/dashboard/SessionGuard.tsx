'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { LogOut } from 'lucide-react';
import { useAuth, type SignOutReason } from '@/context/AuthContext';
import { getAppSettingsOrDefaults } from '@/lib/appSettings';
import { readLastActive, writeLastActive } from '@/lib/sessionActivity';
import {
  IDLE_WARNING_MS,
  sessionEndsAt,
  type SessionPolicy,
} from '@/types/sessionPolicy';
import { Bi } from '@/components/spanish/Es';

/**
 * Signs the browser out after the company's idle limit, and when a sign-in
 * reaches its maximum age — see src/types/sessionPolicy.ts for the why.
 *
 * Mounted once in the dashboard layout, below the auth gate. Draws nothing
 * until a warning is due.
 *
 * How "idle" is judged:
 *
 * - Activity is a click, key, scroll, touch or mouse move in any TTMS tab,
 *   shared through localStorage (src/lib/sessionActivity.ts). Written at most
 *   every 15 seconds, so a mouse move is not a storage write.
 * - The sign-in itself counts as activity (`authTime`), so a stale time from
 *   last week cannot sign somebody straight back out after they sign in.
 * - **Nothing is marked until the policy and the sign-in time are known.** A
 *   laptop opened in the morning sees a mouse move within milliseconds; if that
 *   counted before the first check, the overnight gap would be erased and the
 *   sleeping laptop would never be caught. The same reason `markActive` checks
 *   the gap before it records anything: timers do not run while a computer
 *   sleeps, so the first sign of life after waking is often a mouse move.
 *
 * The maximum age gets a five-minute warning rather than one, and cannot be
 * put off: it is meant to end the session whatever happens. Five minutes is
 * time to save a half-typed order; "Keep working" hides the card for that,
 * but the deadline stands.
 */
const WRITE_EVERY_MS  = 15_000;
const CHECK_EVERY_MS  = 5_000;
const EXPIRY_WARNING_MS = 5 * 60_000;
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'mousemove', 'scroll'] as const;

type Warning = { kind: SignOutReason; at: number };

export default function SessionGuard() {
  const { user, logout } = useAuth();
  const [policy, setPolicy]         = useState<SessionPolicy | null>(null);
  const [signedInAt, setSignedInAt] = useState<number | null>(null);
  const [warning, setWarning]       = useState<Warning | null>(null);
  const [now, setNow]               = useState(() => Date.now());

  // Refs, because the activity listener fires far too often to be re-bound on
  // every render, and must always see the current values.
  const lastActive = useRef(0);
  const lastWrite  = useRef(0);
  const ending     = useRef(false);
  const expiryDismissed = useRef(false);
  const ready      = useRef<{ policy: SessionPolicy; signedInAt: number } | null>(null);

  useEffect(() => {
    let live = true;
    getAppSettingsOrDefaults().then((res) => { if (live) setPolicy(res.settings.sessionPolicy); });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (!user) return;
    let live = true;
    user.getIdTokenResult()
      .then((r) => Date.parse(r.authTime))
      // Without the token's own time, fall back to what the account reports,
      // and failing that to now — which only means this tab cannot catch a
      // stale gap on this one load. Never 0: that would treat a fresh sign-in
      // as idle since 1970.
      .catch(() => Date.parse(user.metadata.lastSignInTime ?? ''))
      .then((t) => { if (live) setSignedInAt(Number.isFinite(t) && t > 0 ? t : Date.now()); });
    return () => { live = false; };
  }, [user]);

  const end = useCallback((reason: SignOutReason) => {
    if (ending.current) return;
    ending.current = true;
    void logout(reason);
  }, [logout]);

  /** The latest activity anywhere in this browser, sign-in included. */
  const lastSeen = useCallback((signedIn: number) => {
    const last = Math.max(lastActive.current, readLastActive(), signedIn);
    lastActive.current = last;
    return last;
  }, []);

  /** Signs out if a limit has passed; otherwise works out the warning. */
  const check = useCallback(() => {
    const r = ready.current;
    if (!r || ending.current) return;
    const t = Date.now();
    const idleMs = r.policy.idleMinutes * 60_000;
    const endsAt = sessionEndsAt(r.signedInAt, r.policy);
    const last   = lastSeen(r.signedInAt);

    if (endsAt !== null && t >= endsAt) return end('expired');
    if (idleMs > 0 && t - last >= idleMs) return end('idle');

    if (endsAt !== null && endsAt - t <= EXPIRY_WARNING_MS && !expiryDismissed.current) {
      setWarning({ kind: 'expired', at: endsAt });
    } else if (idleMs > 0 && last + idleMs - t <= IDLE_WARNING_MS) {
      setWarning({ kind: 'idle', at: last + idleMs });
    } else {
      setWarning(null);
    }
    setNow(t);
  }, [end, lastSeen]);

  const markActive = useCallback((force = false) => {
    const r = ready.current;
    if (!r || ending.current) return;
    const t = Date.now();
    // A long gap since this tab last saw anything — a sleeping laptop, most
    // often. Check before recording, or the wake-up itself erases the gap.
    if (r.policy.idleMinutes > 0 && t - lastActive.current >= IDLE_WARNING_MS) {
      check();
      if (ending.current) return;
    }
    lastActive.current = t;
    if (force || t - lastWrite.current >= WRITE_EVERY_MS) {
      lastWrite.current = t;
      writeLastActive(t);
    }
  }, [check]);

  // Start once both answers are in: check first, then listen.
  useEffect(() => {
    if (!policy || signedInAt === null) return;
    ready.current = { policy, signedInAt };
    if (policy.idleMinutes === 0 && policy.maxDays === 0) { setWarning(null); return; }

    check();

    const onActivity = () => markActive();
    for (const e of ACTIVITY_EVENTS) {
      window.addEventListener(e, onActivity, { passive: true, capture: true });
    }
    // A tab coming back into view — or a computer waking — is checked at once
    // rather than on the next tick.
    const onWake = () => check();
    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('focus', onWake);
    const timer = setInterval(check, CHECK_EVERY_MS);

    return () => {
      for (const e of ACTIVITY_EVENTS) window.removeEventListener(e, onActivity, { capture: true });
      document.removeEventListener('visibilitychange', onWake);
      window.removeEventListener('focus', onWake);
      clearInterval(timer);
    };
  }, [policy, signedInAt, check, markActive]);

  // A one-second countdown only while a warning is on screen.
  useEffect(() => {
    if (!warning) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [warning]);

  if (!warning) return null;

  const left = Math.max(0, warning.at - now);
  const mm = Math.floor(left / 60_000);
  const ss = String(Math.floor((left % 60_000) / 1000)).padStart(2, '0');
  const countdown = `${mm}:${ss}`;
  const idle = warning.kind === 'idle';

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="session-guard-title"
    >
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl">
        <div className="flex items-center gap-2">
          <LogOut size={18} className="text-brand-600" />
          <h2 id="session-guard-title" data-es className="text-base font-semibold text-gray-900">
            {idle ? 'Still there?' : 'Time to sign in again'}
          </h2>
        </div>
        <p className="mt-3 text-sm text-gray-600">
          {idle
            ? <Bi>TTMS has not been used for a while, so it will sign you out to keep the company&apos;s data safe.</Bi>
            : <Bi>For security, TTMS asks everybody to sign in again every few days. Save what you are working on.</Bi>}
        </p>
        <p className="mt-4 text-center font-[family-name:var(--font-rajdhani)] text-4xl font-bold tabular-nums text-gray-900"
           aria-live="polite">
          {countdown}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          {idle ? (
            <button
              type="button"
              data-es
              onClick={() => { markActive(true); setWarning(null); }}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700"
            >
              Stay signed in
            </button>
          ) : (
            <>
            {/* Hides the card so they can finish and save; it cannot move the
                deadline, which still signs out at zero. */}
            <button
              type="button"
              data-es
              onClick={() => { expiryDismissed.current = true; setWarning(null); }}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
            >
              Keep working
            </button>
            <button
              type="button"
              data-es
              onClick={() => end('expired')}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700"
            >
              Sign in again now
            </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
