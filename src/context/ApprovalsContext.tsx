'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { listAccessRequests } from '@/lib/parties';
import { listOrderAccessRequests } from '@/lib/orders';
import { listProfileUpdateRequests } from '@/lib/profileRequests';

/**
 * How many approvals are waiting, for the badges in the nav.
 *
 * Counted here rather than on the Approvals screen for the reason the screen
 * itself exists: a request nobody notices blocks the person who raised it. The
 * badge has to be visible from wherever they happen to be working.
 *
 * All three kinds are counted together — a client request, a load request and
 * somebody asking for their own phone number to be corrected are the same
 * interruption to whoever has to decide them, and three separate numbers on
 * one nav item would be arithmetic, not information.
 *
 * The two directions are kept apart, though, because they are not the same
 * news. `incoming` is work waiting on you. `outgoing` is you waiting on someone
 * else — worth seeing, but not something you can act on.
 */
interface ApprovalsContextValue {
  /** Pending and waiting on this user to decide. */
  incoming: number;
  /** This user's own requests, still undecided. */
  outgoing: number;
  /** Re-count. Called after deciding one, so the badge cannot go stale. */
  refresh: () => void;
}

const ApprovalsContext = createContext<ApprovalsContextValue | null>(null);

export function ApprovalsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [incoming, setIncoming] = useState(0);
  const [outgoing, setOutgoing] = useState(0);

  const refresh = useCallback(() => {
    if (!user) { setIncoming(0); setOutgoing(0); return; }

    // Six small queries. Failures are swallowed per box rather than dropping
    // the set: a badge that is short by one is worth more than no badge, and
    // there is nothing useful to tell somebody about a count that did not load.
    // The profile queue answers with an empty list rather than a 403 for
    // somebody who cannot decide those, so it costs a broker nothing.
    Promise.all([
      listAccessRequests('incoming').catch(() => []),
      listOrderAccessRequests('incoming').catch(() => []),
      listProfileUpdateRequests('incoming').catch(() => []),
    ]).then((boxes) => {
      setIncoming(pending(boxes));
    });

    Promise.all([
      listAccessRequests('outgoing').catch(() => []),
      listOrderAccessRequests('outgoing').catch(() => []),
      listProfileUpdateRequests('outgoing').catch(() => []),
    ]).then((boxes) => {
      setOutgoing(pending(boxes));
    });
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <ApprovalsContext.Provider value={{ incoming, outgoing, refresh }}>
      {children}
    </ApprovalsContext.Provider>
  );
}

/** How many of the merged queues are still waiting on a decision. */
function pending(boxes: { status: string }[][]): number {
  return boxes.reduce(
    (total, box) => total + box.filter((r) => r.status === 'pending').length,
    0,
  );
}

export function useApprovals() {
  const ctx = useContext(ApprovalsContext);
  if (!ctx) throw new Error('useApprovals must be used within <ApprovalsProvider>');
  return ctx;
}
