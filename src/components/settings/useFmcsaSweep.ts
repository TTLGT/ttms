'use client';

import { useCallback, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import type { SweepItem, SweepResult } from '@/lib/fmcsaSweep';

/** Mirror of SWEEP_BATCH in src/lib/fmcsaSweep.ts — that module pulls in the Admin SDK. */
const BATCH = 20;

export interface SweepState {
  running: boolean;
  total: number;
  done: number;
  items: SweepItem[];
  error: string;
  /** Stopped by the person, not finished. */
  stopped: boolean;
}

const IDLE: SweepState = { running: false, total: 0, done: 0, items: [], error: '', stopped: false };

/**
 * Drives `POST /api/admin/carriers/fmcsa-sweep` a batch at a time. Each batch
 * is written before the next is asked for, so stopping or closing the tab
 * keeps everything already checked; "Check carriers not yet checked" finds
 * the rest because they still have no check on them.
 */
export function useFmcsaSweep(user: User | null) {
  const [state, setState] = useState<SweepState>(IDLE);
  const stopRef = useRef(false);

  const call = useCallback(async (init?: RequestInit) => {
    if (!user) throw new Error('Not signed in');
    const res = await fetch('/api/admin/carriers/fmcsa-sweep', {
      ...init,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await user.getIdToken()}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'The FMCSA check failed.');
    return data;
  }, [user]);

  /**
   * Check `ids`, plus every carrier never checked. The union is what an import
   * wants: the carriers it just wrote — whose phone or address BATS may have
   * blanked again — and any left over from a run that was stopped.
   */
  const start = useCallback(async (ids: string[] = []) => {
    stopRef.current = false;
    setState({ ...IDLE, running: true });
    try {
      const pending = (await call()) as { ids: string[] };
      const queue = [...new Set([...ids, ...pending.ids])];
      setState((s) => ({ ...s, total: queue.length }));

      while (queue.length && !stopRef.current) {
        const batch = queue.splice(0, BATCH);
        const result = (await call({ method: 'POST', body: JSON.stringify({ ids: batch }) })) as SweepResult;
        // Ran out of time on the server: back on the front of the queue.
        queue.unshift(...result.unprocessed);
        setState((s) => ({ ...s, items: [...s.items, ...result.items], done: s.done + result.items.length }));
      }
      setState((s) => ({ ...s, running: false, stopped: stopRef.current }));
    } catch (e) {
      setState((s) => ({ ...s, running: false, error: e instanceof Error ? e.message : 'The FMCSA check failed.' }));
    }
  }, [call]);

  const stop = useCallback(() => { stopRef.current = true; }, []);

  return { state, start, stop };
}
