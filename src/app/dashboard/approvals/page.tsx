'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { listAccessRequests, decideAccessRequest } from '@/lib/parties';
import { listOrderAccessRequests, decideOrderAccessRequest } from '@/lib/orders';
import { listProfileUpdateRequests, decideProfileUpdateRequest } from '@/lib/profileRequests';
import { useAuth } from '@/context/AuthContext';
import { ROLE_LABEL } from '@/types/party';
import type { AccessRequest } from '@/types/accessRequest';
import type { OrderAccessRequest } from '@/types/orderAccessRequest';
import {
  DEFAULT_GRANT_HOURS, GRANT_DURATIONS, grantDisplayStatus, isGrantLive,
} from '@/types/orderAccessRequest';
import { changeSummary, type ProfileUpdateRequest } from '@/types/profileUpdateRequest';
import { UserAvatar } from '@/components/settings/UserAvatar';
import { useDateFormatters } from '@/lib/useDateFormatters';
import { useApprovals } from '@/context/ApprovalsContext';

type Box = 'incoming' | 'outgoing';

/**
 * One inbox, three kinds of request.
 *
 * They are separate collections because what approval grants differs — a party
 * approval is spent on one order, a load approval runs on a clock the approver
 * sets, a profile change writes one field on somebody's own record — but they
 * arrive in the same place, so splitting the screen would only make somebody
 * check three.
 *
 * The third is not decided by the same people as the first two: a profile
 * change goes to admin and HR, and the queue for it comes back empty for
 * everybody else. That is settled server-side in /api/profile/requests, which
 * is why nothing on this screen has to ask.
 */
type Row =
  | { kind: 'party';   req: AccessRequest }
  | { kind: 'order';   req: OrderAccessRequest }
  | { kind: 'profile'; req: ProfileUpdateRequest };

const STATUS_STYLE: Record<string, string> = {
  pending:  'bg-amber-50 text-amber-700',
  approved: 'bg-green-50 text-green-700',
  denied:   'bg-red-50 text-red-700',
  expired:  'bg-gray-100 text-gray-600',
  revoked:  'bg-gray-100 text-gray-600',
  withdrawn: 'bg-gray-100 text-gray-600',
};

/**
 * Sort key for the merged queue.
 *
 * A Timestamp that came back over JSON has no toMillis(), so reading only that
 * gave every row a key of 0 and left the "newest first" sort doing nothing.
 * Same blind spot dateFormat.toDate() had.
 */
const millis = (ts: unknown): number => {
  const t = ts as { toMillis?: () => number; _seconds?: number; seconds?: number } | null;
  if (!t) return 0;
  if (typeof t.toMillis === 'function') return t.toMillis();
  if (typeof t._seconds === 'number')   return t._seconds * 1000;
  if (typeof t.seconds  === 'number')   return t.seconds  * 1000;
  return 0;
};

/**
 * What to call the record a party request is about.
 *
 * A request raised from the phone lookup carries no name on purpose — the
 * searcher was never told one, so that a number cannot be used to find out who
 * a colleague's clients are. The owner deciding it gets the name filled in by
 * the API; everybody else, the requester included, sees the number they typed.
 */
function partyLabel(req: { partyName?: string; partyPhone?: string }): string {
  if (req.partyName) return req.partyName;
  if (req.partyPhone) return `Record on ${req.partyPhone}`;
  return 'A record';
}

export default function ApprovalsPage() {
  // Requests are read as a timeline, so these keep the time after the date.
  const { formatDateTime: formatWhen } = useDateFormatters();
  const { user, can } = useAuth();
  // The nav badge counts the same queue, so deciding one here has to re-count
  // there — otherwise the number sits stale until the next full page load.
  const { refresh: refreshBadges } = useApprovals();
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
  /*
    What a party approval will grant, by request id. `once` lends the record
    for a single order; `ownership` hands it over along with every order it is
    the client on.

    Defaulted to `once` and never to `ownership`, for the same reason the load
    picker defaults to a week: the reversible answer is the safe one to reach
    by accident. Only somebody holding `access.grantOwnership` sees the choice
    at all — the server refuses the second from anyone else, so hiding it here
    is a courtesy rather than the control.
  */
  const [grantKind, setGrantKind] = useState<Record<string, 'once' | 'ownership'>>({});
  const canGrantOwnership = can('access.grantOwnership');

  const load = useCallback(async (which: Box) => {
    setLoading(true);
    setError('');
    try {
      // Fetched together and merged so the inbox reads as one queue. No call
      // is allowed to fail quietly: two thirds of a queue looks exactly like
      // an empty one, and the whole point of this screen is that nothing waits
      // on somebody without them knowing.
      const [parties, orders, profiles] = await Promise.all([
        listAccessRequests(which),
        listOrderAccessRequests(which),
        listProfileUpdateRequests(which),
      ]);
      const merged: Row[] = [
        ...parties.map((req) => ({ kind: 'party' as const, req })),
        ...orders.map((req) => ({ kind: 'order' as const, req })),
        ...profiles.map((req) => ({ kind: 'profile' as const, req })),
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

  async function decide(row: Row, action: 'approve' | 'deny' | 'revoke' | 'withdraw') {
    setBusyId(row.req.id);
    setError('');
    try {
      if (row.kind === 'profile') {
        // The only kind with a `withdraw`, and the only kind without a
        // `revoke`: the change is applied the moment it is approved, so there
        // is nothing standing afterwards to take back. What can be taken back
        // is the asking, by the person who asked.
        if (action === 'revoke') return;
        await decideProfileUpdateRequest(row.req.id, action);
      }
      else if (row.kind === 'order') {
        if (action === 'withdraw') return;
        await decideOrderAccessRequest(row.req.id, action, {
          expiresInHours: grantHours[row.req.id] ?? DEFAULT_GRANT_HOURS,
        });
      }
      // A party approval has nothing to revoke — it spends itself on an order.
      else if (action !== 'revoke' && action !== 'withdraw') {
        await decideAccessRequest(row.req.id, action, {
          grant: grantKind[row.req.id] ?? 'once',
        });
      }
      await load(box);
      refreshBadges();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to record the decision');
    } finally {
      setBusyId('');
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Approvals</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Requests to use a client, shipper or consignee that belongs to someone else,
          requests to open a load, and changes people have asked for on their own
          record. A party approval covers one order, or hands the record over for good
          if an admin or dispatcher grants it that way; a load approval lasts for as
          long as you grant it, and can be taken back early; a profile change is
          written straight onto the person&rsquo;s record when you approve it.
        </p>
      </div>

      <div className="flex gap-1 mb-5 overflow-x-auto whitespace-nowrap border-b border-gray-200 tab-scroll [&>*]:flex-shrink-0">
        {([
          // Whoever can decide anybody's request is looking at the whole
          // company's queue, so the tab says so rather than implying these are
          // all theirs. A Sales Manager sees their own and their team's, which
          // is still "waiting on you".
          ['incoming', can('access.decideAny') ? 'Waiting on you (all pending)' : 'Waiting on you'],
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
            {box === 'incoming' ? 'Nothing waiting on you.' : 'You have not asked for anything.'}
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
                          ? partyLabel(row.req)
                          : row.kind === 'order'
                            ? `Load ${row.req.orderNumber || row.req.orderId}`
                            // The field is the subject of a profile request the
                            // way a load is the subject of the one above it.
                            : `${row.req.subjectName} — ${row.req.fieldLabel}`}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 text-xs font-medium">
                        {row.kind === 'party'
                          ? `as ${ROLE_LABEL[row.req.role]}`
                          : row.kind === 'order' ? 'load' : 'profile'}
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
                            : row.kind === 'profile'
                              ? ' wants this changed on their own record'
                            // A request raised from the order form is asking to
                            // put this party on a load; one raised from a shared
                            // link is asking to read the record at all. Saying
                            // "use" for both overstated what the second was after.
                            : row.req.via === 'link'
                              ? ' wants to open this record'
                              : ' wants to use this record'}
                        </>
                      ) : row.kind === 'profile' ? (
                        // A personnel record has no owner to name — it belongs
                        // to the person asking, which is why they had to ask
                        // somebody else in the first place.
                        <>Waiting on HR or an administrator</>
                      ) : (
                        <>Owned by <strong>{row.req.ownerName || 'nobody — an administrator will decide'}</strong></>
                      )}
                      {' · '}{formatWhen(r.createdAt)}
                    </p>

                    {/* The change itself, before the reason for it. A photo is
                        shown rather than described: one storage path turning
                        into another tells an approver nothing, and the picture
                        is the entire thing being decided. */}
                    {row.kind === 'profile' && (
                      row.req.field === 'photoPath' ? (
                        <div className="mt-2 flex items-center gap-3">
                          <UserAvatar
                            photoPath={row.req.currentValue || null}
                            fallback={row.req.subjectName.charAt(0).toUpperCase()}
                            size={52}
                            expandable
                            name={row.req.subjectName}
                          />
                          <ArrowRight size={16} className="flex-shrink-0 text-gray-400" />
                          <UserAvatar
                            photoPath={row.req.requestedValue || null}
                            fallback={row.req.subjectName.charAt(0).toUpperCase()}
                            size={52}
                            expandable
                            name={row.req.subjectName}
                          />
                        </div>
                      ) : (
                        <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                          <span className="text-gray-400 line-through">
                            {changeSummary(row.req).from}
                          </span>
                          <ArrowRight size={14} className="flex-shrink-0 text-gray-400" />
                          <span className="font-semibold text-gray-900">
                            {changeSummary(row.req).to}
                          </span>
                        </p>
                      )
                    )}

                    {r.reason && (
                      <p className="text-sm text-gray-700 mt-2 italic">&ldquo;{r.reason}&rdquo;</p>
                    )}

                    {/* Said before the decision, not after. Handing a record
                        over is permanent and carries orders with it, which is
                        not what "approve" reads like on its own. */}
                    {box === 'incoming' && r.status === 'pending'
                      && row.kind === 'party' && canGrantOwnership
                      && grantKind[r.id] === 'ownership' && (
                      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">
                        This hands the record over for good. {r.requestedByName} joins its
                        owners and can open every order it is the client on, including ones
                        already booked. The current owners keep theirs. Only an admin or
                        dispatcher can undo it, on the record itself.
                      </p>
                    )}

                    {r.status !== 'pending' && r.decidedByName && (
                      <p className="text-xs text-gray-500 mt-2">
                        {r.status === 'denied'
                          ? 'Denied'
                          : r.status === 'revoked'   ? 'Revoked'
                          : r.status === 'withdrawn' ? 'Taken back'
                          : 'Approved'} by{' '}
                        <strong>{r.decidedByName}</strong>
                        {row.kind !== 'profile' && row.req.decidedByAdmin && ' (admin)'}
                        {' on '}{formatWhen(r.decidedAt)}
                        {r.decidedByIp && <span className="font-mono ml-1">({r.decidedByIp})</span>}
                      </p>
                    )}

                    {row.kind === 'party' && row.req.grantKind === 'ownership' && row.req.status === 'approved' && (
                      <p className="text-xs text-gray-500 mt-1">
                        Handed over — <strong>{r.requestedByName}</strong> now owns this record
                        and every order it is the client on.
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
                    {box === 'incoming' && r.status === 'pending' && row.kind === 'party' && canGrantOwnership && (
                      <label className="flex flex-col text-[10px] font-medium uppercase tracking-wide text-gray-400">
                        Grant
                        <select
                          value={grantKind[r.id] ?? 'once'}
                          onChange={(e) => setGrantKind((g) => ({
                            ...g,
                            [r.id]: e.target.value === 'ownership' ? 'ownership' : 'once',
                          }))}
                          className="mt-0.5 rounded-lg border border-gray-300 px-2 py-1 text-xs font-normal normal-case text-gray-700 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
                        >
                          <option value="once">This order only</option>
                          <option value="ownership">Ownership + its orders</option>
                        </select>
                      </label>
                    )}
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
                    {/* The requester's own way out, and the only kind of
                        request that has one. A party or load request is about
                        somebody else's record and there is nothing to undo by
                        dropping it; this one is a person's own correction, and
                        they may notice they typed the number wrong before
                        anybody has looked at it. It records as `withdrawn`
                        rather than deleting — the queue exists so that nothing
                        quietly disappears out of it. */}
                    {box === 'outgoing' && row.kind === 'profile' && r.status === 'pending' && (
                      <button
                        onClick={() => decide(row, 'withdraw')}
                        disabled={busyId === r.id}
                        className="px-3 py-1.5 border border-gray-300 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-50 transition disabled:opacity-50"
                      >
                        {busyId === r.id ? '…' : 'Take it back'}
                      </button>
                    )}
                    {/* A load approval stands until somebody takes it back, so
                        the owner needs a way to take it back. Nothing to revoke
                        on the party side — that one expires on its own, and a
                        profile change is already written by the time it is
                        approved. */}
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
