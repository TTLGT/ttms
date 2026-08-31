'use client';

import { useCallback, useEffect, useState } from 'react';
import { listAccessRequests, decideAccessRequest } from '@/lib/parties';
import { listOrderAccessRequests, decideOrderAccessRequest } from '@/lib/orders';
import { useAuth } from '@/context/AuthContext';
import { ROLE_LABEL } from '@/types/party';
import type { AccessRequest } from '@/types/accessRequest';
import type { OrderAccessRequest } from '@/types/orderAccessRequest';
import {
  DEFAULT_GRANT_HOURS, GRANT_DURATIONS, grantDisplayStatus, isGrantLive,
} from '@/types/orderAccessRequest';
import { useDateFormatters } from '@/lib/useDateFormatters';

type Box = 'incoming' | 'outgoing';

/**
 * One inbox, two kinds of request.
 *
 * They are separate collections because what approval grants differs — a party
 * approval is spent on one order, a load approval runs on a clock the approver
 * sets — but they arrive in the same place and are decided by the same people,
 * so splitting the screen would only make somebody check two.
 */
type Row =
  | { kind: 'party'; req: AccessRequest }
  | { kind: 'order'; req: OrderAccessRequest };

const STATUS_STYLE: Record<string, string> = {
  pending:  'bg-amber-50 text-amber-700',
  approved: 'bg-green-50 text-green-700',
  denied:   'bg-red-50 text-red-700',
  expired:  'bg-gray-100 text-gray-600',
  revoked:  'bg-gray-100 text-gray-600',
};

const millis = (ts: { toMillis?: () => number } | null | undefined): number =>
  typeof ts?.toMillis === 'function' ? ts.toMillis() : 0;

export default function ApprovalsPage() {
  // Requests are read as a timeline, so these keep the time after the date.
  const { formatDateTime: formatWhen } = useDateFormatters();
  const { user, isAdmin } = useAuth();
  const [box, setBox]         = useState<Box>('incoming');
  const [rows, setRows]       = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [busyId, setBusyId]   = useState('');
  /*
    How long each pending load request will be granted for, by request id.
    Held per row rather than once for the screen: an approver working through
    an inbox is deciding each one on its own merits, and a single picker at the
    top would quietly carry the last answer onto the next load.

    Defaulted to a week rather than to "no expiry" — the safe direction for a
    permission is the one that lapses by itself.
  */
  const [grantHours, setGrantHours] = useState<Record<string, number | null>>({});

  const load = useCallback(async (which: Box) => {
    setLoading(true);
    setError('');
    try {
      // Fetched together and merged so the inbox reads as one queue. Neither
      // call is allowed to fail quietly: half a queue looks exactly like an
      // empty one, and the whole point of this screen is that nothing waits
      // on somebody without them knowing.
      const [parties, orders] = await Promise.all([
        listAccessRequests(which),
        listOrderAccessRequests(which),
      ]);
      const merged: Row[] = [
        ...parties.map((req) => ({ kind: 'party' as const, req })),
        ...orders.map((req) => ({ kind: 'order' as const, req })),
      ];
      merged.sort((a, b) => millis(b.req.createdAt) - millis(a.req.createdAt));
      setRows(merged);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load requests');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (user) void load(box); }, [user, box, load]);

  async function decide(row: Row, action: 'approve' | 'deny' | 'revoke') {
    setBusyId(row.req.id);
    setError('');
    try {
      if (row.kind === 'order') {
        await decideOrderAccessRequest(row.req.id, action, {
          expiresInHours: grantHours[row.req.id] ?? DEFAULT_GRANT_HOURS,
        });
      }
      // A party approval has nothing to revoke — it spends itself on an order.
      else if (action !== 'revoke') await decideAccessRequest(row.req.id, action);
      await load(box);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to record the decision');
    } finally {
      setBusyId('');
    }
  }

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Approvals</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Requests to use a client, shipper or consignee that belongs to someone else,
          and requests to open a load. A party approval covers one order; a load
          approval lasts for as long as you grant it, and can be taken back early.
        </p>
      </div>

      <div className="flex gap-1 mb-5 border-b border-gray-200">
        {([
          ['incoming', isAdmin ? 'Waiting on you (all pending)' : 'Waiting on you'],
          ['outgoing', 'Your requests'],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setBox(key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${
              box === key
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-600 mb-4">{error}</div>}

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-gray-400 text-sm">
            {box === 'incoming' ? 'Nothing waiting on you.' : 'You have not requested any access.'}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => {
            const r = row.req;
            return (
              <li key={`${row.kind}-${r.id}`} className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900">
                        {row.kind === 'party'
                          ? row.req.partyName
                          : `Load ${row.req.orderNumber || row.req.orderId}`}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 text-xs font-medium">
                        {row.kind === 'party' ? `as ${ROLE_LABEL[row.req.role]}` : 'load'}
                      </span>
                      {/* A lapsed grant still says 'approved' in the document
                          — the clock is applied when it is read, not by a job.
                          The reader wants to know whether it works. */}
                      {(() => {
                        const shown = row.kind === 'order' ? grantDisplayStatus(row.req) : r.status;
                        return (
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_STYLE[shown] ?? ''}`}>
                            {shown}
                          </span>
                        );
                      })()}
                    </div>

                    <p className="text-sm text-gray-600 mt-1.5">
                      {box === 'incoming' ? (
                        <>
                          <strong>{r.requestedByName}</strong>
                          {row.kind === 'order'
                            ? ' wants to open this load'
                            // A request raised from the order form is asking to
                            // put this party on a load; one raised from a shared
                            // link is asking to read the record at all. Saying
                            // "use" for both overstated what the second was after.
                            : row.req.via === 'link'
                              ? ' wants to open this record'
                              : ' wants to use this record'}
                        </>
                      ) : (
                        <>Owned by <strong>{r.ownerName || 'nobody — an administrator will decide'}</strong></>
                      )}
                      {' · '}{formatWhen(r.createdAt)}
                    </p>

                    {r.reason && (
                      <p className="text-sm text-gray-700 mt-2 italic">&ldquo;{r.reason}&rdquo;</p>
                    )}

                    {r.status !== 'pending' && r.decidedByName && (
                      <p className="text-xs text-gray-500 mt-2">
                        {r.status === 'denied'
                          ? 'Denied'
                          : r.status === 'revoked' ? 'Revoked' : 'Approved'} by{' '}
                        <strong>{r.decidedByName}</strong>
                        {r.decidedByAdmin && ' (admin)'}
                        {' on '}{formatWhen(r.decidedAt)}
                        {r.decidedByIp && <span className="font-mono ml-1">({r.decidedByIp})</span>}
                      </p>
                    )}

                    {row.kind === 'party' && row.req.status === 'expired' && row.req.consumedByOrderId && (
                      <p className="text-xs text-gray-500 mt-1">
                        Used on order{' '}
                        <a href={`/dashboard/orders/${row.req.consumedByOrderId}`} className="text-brand-600 hover:underline">
                          {row.req.consumedByOrderId}
                        </a>
                      </p>
                    )}

                    {row.kind === 'order' && r.status === 'approved' && (
                      <p className="text-xs text-gray-500 mt-1">
                        {isGrantLive(row.req) ? (
                          <>
                            {row.req.expiresAt
                              ? <>Access ends {formatWhen(row.req.expiresAt)}</>
                              : <>Access does not expire</>}
                            {' · '}
                            <a href={`/dashboard/orders/${row.req.orderId}`} className="text-brand-600 hover:underline">
                              Open the load
                            </a>
                          </>
                        ) : (
                          <>Access ended {formatWhen(row.req.expiresAt)}</>
                        )}
                      </p>
                    )}

                    {r.denyReason && (
                      <p className="text-xs text-red-600 mt-1">Reason: {r.denyReason}</p>
                    )}
                  </div>

                  <div className="flex gap-2 shrink-0">
                    {box === 'incoming' && r.status === 'pending' && row.kind === 'order' && (
                      <label className="flex flex-col text-[10px] font-medium uppercase tracking-wide text-gray-400">
                        For
                        <select
                          value={String(grantHours[r.id] ?? DEFAULT_GRANT_HOURS)}
                          onChange={(e) => setGrantHours((h) => ({
                            ...h,
                            [r.id]: e.target.value === 'null' ? null : Number(e.target.value),
                          }))}
                          className="mt-0.5 rounded-lg border border-gray-300 px-2 py-1 text-xs font-normal normal-case text-gray-700 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
                        >
                          {GRANT_DURATIONS.map((d) => (
                            <option key={d.label} value={String(d.hours)}>{d.label}</option>
                          ))}
                        </select>
                      </label>
                    )}
                    {box === 'incoming' && r.status === 'pending' && (
                      <>
                        <button
                          onClick={() => decide(row, 'approve')}
                          disabled={busyId === r.id}
                          className="px-3 py-1.5 bg-brand-600 text-white text-xs font-semibold rounded-lg hover:bg-brand-700 transition disabled:opacity-50"
                        >
                          {busyId === r.id ? '…' : 'Approve'}
                        </button>
                        <button
                          onClick={() => decide(row, 'deny')}
                          disabled={busyId === r.id}
                          className="px-3 py-1.5 border border-gray-300 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-50 transition disabled:opacity-50"
                        >
                          Deny
                        </button>
                      </>
                    )}
                    {/* A load approval stands until somebody takes it back, so
                        the owner needs a way to take it back. Nothing to revoke
                        on the party side — that one expires on its own. */}
                    {box === 'incoming' && row.kind === 'order' && isGrantLive(row.req) && (
                      <button
                        onClick={() => decide(row, 'revoke')}
                        disabled={busyId === r.id}
                        className="px-3 py-1.5 border border-gray-300 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-50 transition disabled:opacity-50"
                      >
                        {busyId === r.id ? '…' : 'Revoke'}
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
