'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { authedFetch } from './personalTasks';
import {
  PLANNER_TOURS, TOUR_TICKS, plannerState,
  type PlannerAccess, type PlannerChoice, type PlannerRollout, type PlannerState, type PlannerTourId,
} from '@/types/planner';

/*
 * The browser's half of the Planner rollout — see src/types/planner.ts.
 *
 * The stage is read once per page load (one read of appSettings/general) and
 * shared by everything that asks: the sidebar, the old pages' banner and the
 * Planner's own header all mount at once, and three requests for one answer
 * would be three reads.
 */

let accessPromise: Promise<PlannerAccess | null> | null = null;

function loadAccess(): Promise<PlannerAccess | null> {
  if (!accessPromise) {
    accessPromise = authedFetch<{ access: PlannerAccess }>('/api/planner/rollout')
      .then((d) => d.access ?? null)
      // A failure reads as "nobody yet": the old pages are always there.
      .catch(() => { accessPromise = null; return null; });
  }
  return accessPromise;
}

/**
 * A choice made on this page, ahead of the profile listener catching up. The
 * profile carries `preferences.planner` live, but a switch followed by a
 * navigation would otherwise see the old value for a moment and send the
 * person straight back.
 */
let pendingChoice: PlannerChoice | null = null;
const CHOICE_EVENT = 'ttms:planner-choice';

export function usePlanner(): { state: PlannerState; access: PlannerAccess | null; loaded: boolean } {
  const { profile } = useAuth();
  const [access, setAccess] = useState<PlannerAccess | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    let live = true;
    loadAccess().then((a) => { if (live) { setAccess(a); setLoaded(true); } });
    const bump = () => setTick((n) => n + 1);
    window.addEventListener(CHOICE_EVENT, bump);
    return () => { live = false; window.removeEventListener(CHOICE_EVENT, bump); };
  }, []);

  const stored = profile?.preferences?.planner ?? null;
  if (pendingChoice && stored === pendingChoice) pendingChoice = null;
  const choice = pendingChoice ?? stored;
  return { state: plannerState(access, choice), access, loaded };
}

/** Switch to the Planner or back. Saved on the account, so it follows the person to another computer. */
export async function choosePlanner(choice: PlannerChoice): Promise<void> {
  pendingChoice = choice;
  window.dispatchEvent(new Event(CHOICE_EVENT));
  await authedFetch('/api/me/preferences', { method: 'PATCH', body: JSON.stringify({ planner: choice }) });
}

/**
 * "What didn't work for you?" on going back — optional, and sent to the IT
 * desk as an ordinary support ticket so it lands where problems are read.
 */
export async function reportPlannerFeedback(text: string): Promise<void> {
  const body = text.trim();
  if (!body) return;
  await authedFetch('/api/it-tickets', {
    method: 'POST',
    body: JSON.stringify({
      title: 'Went back from the new Planner',
      text: body,
      category: 'problem',
      priority: 'low',
      page: '/dashboard/planner',
    }),
  });
}

/** Whether this person has finished this tour at its current version. */
export function tourSeen(seen: Partial<Record<PlannerTourId, number>> | undefined, id: PlannerTourId): boolean {
  return (seen?.[id] ?? 0) >= PLANNER_TOURS[id];
}

/**
 * A tour was finished (or skipped — skipping is an answer too, and a tour
 * that comes back every visit until watched to the end is a nag). Recorded on
 * the account, and finishing — not skipping — ticks "Take the Planner tour"
 * on My journey. Both best-effort: a tour is not worth an error.
 */
export async function recordTour(id: PlannerTourId, finished: boolean): Promise<void> {
  await authedFetch('/api/me/preferences', {
    method: 'PATCH',
    body: JSON.stringify({ toursSeen: { [id]: PLANNER_TOURS[id] } }),
  }).catch(() => undefined);
  const stepId = TOUR_TICKS[id];
  if (finished && stepId) {
    await authedFetch('/api/onboarding/me', {
      method: 'POST',
      body: JSON.stringify({ action: 'tick', stepId }),
    }).catch(() => undefined);
  }
}

// ── Settings → Planner ───────────────────────────────────────────────────────

export async function getPlannerRollout(): Promise<PlannerRollout> {
  const d = await authedFetch<{ rollout: PlannerRollout }>('/api/planner/rollout?full=1');
  return d.rollout;
}

export async function savePlannerRollout(rollout: PlannerRollout): Promise<PlannerRollout> {
  const d = await authedFetch<{ rollout: PlannerRollout }>('/api/planner/rollout', {
    method: 'PUT',
    body: JSON.stringify(rollout),
  });
  // The admin's own sidebar should follow the new stage without a reload.
  accessPromise = null;
  return d.rollout;
}
