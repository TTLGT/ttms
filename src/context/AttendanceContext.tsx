'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import {
  clock,
  fetchMyAttendance,
  saveHideLastSeen,
  saveStatus,
} from '@/lib/attendance';
import { usePresenceEnabled, usePresenceHeartbeat } from '@/lib/presence';
import { MonitorCheck } from 'lucide-react';
import {
  idlePermission,
  requestIdlePermission,
  startSystemIdle,
  stopSystemIdle,
} from '@/lib/idleDetection';
import type { BreakKind, ClockState } from '@/types/attendance';
import type { UserStatus } from '@/types/presence';

/**
 * The signed-in person's own clock, status and "hide last seen", shared by
 * the sidebar clock, the profile page and the heartbeat.
 *
 * One provider rather than each of those fetching for itself: the heartbeat
 * needs to know whether somebody is clocked in (an idle beat is only sent
 * while they are), and a second copy of that answer in the sidebar would
 * drift the moment somebody clocked out from their profile page.
 *
 * Sits below the auth gate in the dashboard layout, like ChatProvider, so
 * nothing here runs for an account that has not been through the allowlist.
 */

interface AttendanceContextValue {
  state: ClockState | null;
  /** May see somebody else's attendance — offers the Attendance page. */
  seesOthers: boolean;
  /** `attendance.manage`. */
  manages: boolean;
  busy: boolean;
  error: string;
  clearError: () => void;
  clockIn: () => Promise<void>;
  clockOut: () => Promise<void>;
  startBreak: (kind: BreakKind) => Promise<void>;
  endBreak: () => Promise<void>;
  setStatus: (status: UserStatus | null, note?: string) => Promise<void>;
  setHideLastSeen: (hide: boolean) => Promise<void>;
  refresh: () => Promise<void>;
}

const AttendanceContext = createContext<AttendanceContextValue | null>(null);

const REFRESH_ON_RETURN_MS = 5 * 60_000;

/**
 * Must run synchronously inside a click — the browser shows its box only then.
 *
 * Asked at every clock-in until it is answered, unlike the notification prompt
 * in src/lib/chatNotify.ts, which asks once: the company wants this on for
 * everybody who is clocked in, and an unanswered box is not an answer. Chrome
 * does quietly stop showing a box somebody has closed three times, for about
 * a week; the TTMS explanation still appears, and says so.
 */
function askIdle() {
  void requestIdlePermission().then((p) => { if (p === 'granted') void startSystemIdle(); });
}

export function AttendanceProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [state, setState]           = useState<ClockState | null>(null);
  const [seesOthers, setSeesOthers] = useState(false);
  const [manages, setManages]       = useState(false);
  const [busy, setBusy]             = useState(false);
  const [error, setError]           = useState('');

  const refresh = useCallback(async () => {
    try {
      const me = await fetchMyAttendance();
      setState(me.state);
      setSeesOthers(me.seesOthers);
      setManages(me.manages);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your clock');
    }
  }, []);

  useEffect(() => { if (user) void refresh(); }, [user, refresh]);

  // Somebody who clocked out in another tab, or on their phone, should not
  // see "Clock out" here all afternoon. Re-read when the tab comes back —
  // but at most every five minutes: each read is several documents, and
  // people flick between tabs dozens of times an hour.
  const lastRefresh = useRef(0);
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastRefresh.current < REFRESH_ON_RETURN_MS) return;
      lastRefresh.current = Date.now();
      void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  const enabled = usePresenceEnabled();
  usePresenceHeartbeat(user?.uid, enabled, {
    clockedIn: state?.clockedIn ?? false,
    hidden: state?.hideLastSeen ?? false,
  });

  // Whole-computer activity, only while clocked in and only while the
  // heartbeat is on — see src/lib/idleDetection.ts. Starts by itself on a
  // browser where the permission is already granted (by the PC policy, or an
  // earlier yes); otherwise the Clock in click asks.
  const clockedIn = state?.clockedIn ?? false;
  useEffect(() => {
    if (!enabled || !clockedIn) {
      stopSystemIdle();
      return;
    }
    void startSystemIdle();
    return () => stopSystemIdle();
  }, [enabled, clockedIn]);

  // Which explanation, if any, is open: `prompt` when the browser would ask,
  // `denied` when somebody clicked Block and only they can undo it.
  const [explaining, setExplaining] = useState<'prompt' | 'denied' | null>(null);

  const run = useCallback(async (fn: () => Promise<ClockState | void>) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const next = await fn();
      if (next) setState(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work — try again.');
      // The server may know something this tab does not (clocked out
      // elsewhere), which is the usual reason for a refusal.
      await refresh();
    } finally {
      setBusy(false);
    }
  }, [busy, refresh]);

  const value = useMemo<AttendanceContextValue>(() => ({
    state, seesOthers, manages, busy, error,
    clearError: () => setError(''),
    clockIn:    async () => {
      // Every clock-in until whole-computer activity is allowed, explain
      // first: a pop-up nobody expected gets Block. Read fresh each time,
      // because the person may have changed it in the browser's settings
      // since. The explanation's own button clocks in (and, when the browser
      // can still ask, asks — its click is what lets the box appear).
      // Already allowed, or not Chrome/Edge: straight in, nothing shown.
      if (enabled) {
        const perm = await idlePermission();
        if (perm === 'prompt' || perm === 'denied') {
          setExplaining(perm);
          return;
        }
      }
      return run(() => clock('in'));
    },
    clockOut:   () => run(() => clock('out')),
    startBreak: (kind) => run(() => clock('breakStart', kind)),
    endBreak:   () => run(() => clock('breakEnd')),
    setStatus:  (status, note = '') => run(async () => {
      await saveStatus(status, note);
      setState((s) => (s ? { ...s, status, statusNote: status ? note : '' } : s));
    }),
    setHideLastSeen: (hide) => run(async () => (await saveHideLastSeen(hide)).state),
    refresh,
  }), [state, seesOthers, manages, busy, error, run, refresh, enabled]);

  return (
    <AttendanceContext.Provider value={value}>
      {children}
      {/* Here rather than beside the sidebar button: the sidebar is a
          transformed drawer on a phone, which would trap a fixed overlay
          inside it. */}
      {explaining && (
        <IdleExplainer
          blocked={explaining === 'denied'}
          onContinue={() => {
            if (explaining === 'prompt') askIdle(); // synchronously inside this click
            setExplaining(null);
            void run(() => clock('in'));
          }}
          onSkip={() => {
            setExplaining(null);
            void run(() => clock('in'));
          }}
        />
      )}
    </AttendanceContext.Provider>
  );
}

/**
 * What TTMS says before the browser's own "wants to know when you're actively
 * using this device" box. Worded as agreed with the company (2026-09-28);
 * keep it in step with AttendancePolicy.tsx if either changes.
 *
 * Shown at every clock-in until it is allowed. Both buttons clock in — the
 * clock never waits on this.
 *
 * Two versions. While the browser can still ask, the button raises its box.
 * Once somebody has clicked Block, **no website can ask again** — that is the
 * browser's rule — so this explains how they switch it back on themselves.
 * "Your device use" is what Chrome calls the permission in its site settings.
 */
function IdleExplainer({
  blocked, onContinue, onSkip,
}: {
  blocked: boolean;
  onContinue: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="idle-explainer-title"
        className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <div className="flex items-start gap-3">
          <MonitorCheck size={22} className="mt-0.5 flex-shrink-0 text-brand-600" />
          {blocked ? (
            <div>
              <h2 id="idle-explainer-title" className="text-base font-semibold text-gray-900">
                Activity checking is blocked in this browser
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-gray-600">
                Please turn it back on. TTMS only checks whether the computer is in use while you&rsquo;re
                clocked in, never what you&rsquo;re doing. Until then, only your use of TTMS itself is counted.
              </p>
              <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-gray-700">
                <li>Click the icon at the left end of the address bar, next to the TTMS address.</li>
                <li>Choose <strong>Site settings</strong>.</li>
                <li>Find <strong>Your device use</strong> and set it to <strong>Allow</strong>.</li>
                <li>Come back to TTMS and refresh the page.</li>
              </ol>
            </div>
          ) : (
            <div>
              <h2 id="idle-explainer-title" className="text-base font-semibold text-gray-900">
                Your browser is about to ask about activity
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-gray-600">
                Please click <strong>Allow</strong>. TTMS only checks whether the computer is in use while
                you&rsquo;re clocked in, never what you&rsquo;re doing.
              </p>
              <p className="mt-2 text-xs text-gray-500">
                This will show each time you clock in until it is allowed. Details are on your profile page
                under &ldquo;What TTMS records about your attendance&rdquo;.
              </p>
            </div>
          )}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          {!blocked && (
            <button type="button" onClick={onSkip}
              className="rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-100">
              Not now
            </button>
          )}
          <button type="button" onClick={onContinue} autoFocus
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
            {blocked ? 'Clock in' : 'Continue and clock in'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function useAttendance(): AttendanceContextValue {
  const ctx = useContext(AttendanceContext);
  if (!ctx) throw new Error('useAttendance must be used inside AttendanceProvider');
  return ctx;
}
