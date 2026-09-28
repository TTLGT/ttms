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
    clockIn:    () => run(() => clock('in')),
    clockOut:   () => run(() => clock('out')),
    startBreak: (kind) => run(() => clock('breakStart', kind)),
    endBreak:   () => run(() => clock('breakEnd')),
    setStatus:  (status, note = '') => run(async () => {
      await saveStatus(status, note);
      setState((s) => (s ? { ...s, status, statusNote: status ? note : '' } : s));
    }),
    setHideLastSeen: (hide) => run(async () => (await saveHideLastSeen(hide)).state),
    refresh,
  }), [state, seesOthers, manages, busy, error, run, refresh]);

  return <AttendanceContext.Provider value={value}>{children}</AttendanceContext.Provider>;
}

export function useAttendance(): AttendanceContextValue {
  const ctx = useContext(AttendanceContext);
  if (!ctx) throw new Error('useAttendance must be used inside AttendanceProvider');
  return ctx;
}
