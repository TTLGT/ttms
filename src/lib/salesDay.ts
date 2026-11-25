'use client';

import { useCallback, useEffect, useState } from 'react';
import { authedFetch } from './personalTasks';
import {
  SALES_DAY_CHANGED_EVENT, type SalesDay, type SalesPerson, type SalesTargets, type TappedMetric,
} from '@/types/salesDay';

/*
 * The browser's half of a broker's daily numbers — see src/types/salesDay.ts.
 *
 * One answer per page, shared: the Today card, the counter at the foot of the
 * page and the pop-up all ask at once, and each save hands the new day to all
 * of them through SALES_DAY_CHANGED_EVENT rather than each asking again.
 */

let mine: Promise<SalesDay | null> | null = null;

function announce(day: SalesDay | null) {
  mine = Promise.resolve(day);
  window.dispatchEvent(new CustomEvent(SALES_DAY_CHANGED_EVENT, { detail: day }));
}

export function loadMySalesDay(fresh = false): Promise<SalesDay | null> {
  if (!mine || fresh) {
    mine = authedFetch<{ day: SalesDay | null }>('/api/me/sales-day')
      .then((d) => d.day ?? null)
      .catch(() => { mine = null; return null; });
  }
  return mine;
}

/** Today's numbers, kept in step with every other copy on the page. `null` = nothing to show. */
export function useMySalesDay(enabled = true): { day: SalesDay | null; loaded: boolean } {
  const [day, setDay] = useState<SalesDay | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    loadMySalesDay().then((d) => { if (live) { setDay(d); setLoaded(true); } });
    const on = (e: Event) => setDay((e as CustomEvent).detail ?? null);
    window.addEventListener(SALES_DAY_CHANGED_EVENT, on);
    return () => { live = false; window.removeEventListener(SALES_DAY_CHANGED_EVENT, on); };
  }, [enabled]);
  return { day, loaded };
}

export async function tapSales(metric: TappedMetric, delta: 1 | -1): Promise<SalesDay | null> {
  const d = await authedFetch<{ day: SalesDay | null }>('/api/me/sales-day', {
    method: 'POST', body: JSON.stringify({ action: 'tap', metric, delta }),
  });
  announce(d.day);
  return d.day;
}

export async function setTodayTargets(targets: SalesTargets): Promise<SalesDay | null> {
  const d = await authedFetch<{ day: SalesDay | null }>('/api/me/sales-day', {
    method: 'POST', body: JSON.stringify({ action: 'targets', targets }),
  });
  announce(d.day);
  return d.day;
}

export interface TeamNumbers {
  date: string;
  people: SalesPerson[];
  days: SalesDay[];
}

export async function fetchTeamNumbers(date: string): Promise<TeamNumbers> {
  return authedFetch<TeamNumbers>(`/api/sales/daily?date=${encodeURIComponent(date)}`);
}

export async function saveStandingTargets(uid: string, targets: SalesTargets): Promise<SalesTargets> {
  const d = await authedFetch<{ targets: SalesTargets }>('/api/sales/daily', {
    method: 'PUT', body: JSON.stringify({ uid, targets }),
  });
  return d.targets;
}

/** A tap that answers at once on screen and settles when the server does. */
export function useTap() {
  const [busy, setBusy] = useState<TappedMetric | null>(null);
  const [error, setError] = useState('');
  const run = useCallback(async (metric: TappedMetric, delta: 1 | -1) => {
    setBusy(metric);
    setError('');
    try { await tapSales(metric, delta); } catch (e) { setError(e instanceof Error ? e.message : 'Could not count that.'); }
    finally { setBusy(null); }
  }, []);
  return { tap: run, busy, error };
}
