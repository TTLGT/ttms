'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { listAccessRequests } from '@/lib/parties';
import { listOrderAccessRequests } from '@/lib/orders';

/**
 * How many approvals are waiting, for the badges in the nav.
 *
 * Counted here rather than on the Approvals screen for the reason the screen
 * itself exists: a request nobody notices blocks the person who raised it. The
 * badge has to be visible from wherever they happen to be working.
 *
 * Both kinds are counted together — a client request and a load request are the
 * same interruption to whoever has to decide them, and two separate numbers on
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

    // Four small queries. Failures are swallowed per box rather than dropping
    // the pair: a badge that is short by one is worth more than no badge, and
    // there is nothing useful to tell somebody about a count that did not load.
    Promise.all([
      listAccessRequests('incoming').catch(() => []),
      listOrderAccessRequests('incoming').catch(() => []),
    ]).then(([parties, orders]) => {
      setIncoming(
        parties.filter((r) => r.status === 'pending').length
        + orders.filter((r) => r.status === 'pending').length,
      );
    });

    Promise.all([
      listAccessRequests('outgoing').catch(() => []),
      listOrderAccessRequests('outgoing').catch(() => []),
    ]).then(([parties, orders]) => {
      setOutgoing(
        parties.filter((r) => r.status === 'pending').length
        + orders.filter((r) => r.status === 'pending').length,
      );
    });
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <ApprovalsContext.Provider value={{ incoming, outgoing, refresh }}>
      {children}
    </ApprovalsContext.Provider>
  );
}

export function useApprovals() {
  const ctx = useContext(ApprovalsContext);
  if (!ctx) throw new Error('useApprovals must be used within <ApprovalsProvider>');
  return ctx;
}
