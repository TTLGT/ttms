'use client';

import { useCallback, useEffect, useState } from 'react';
import { listAccessRequests, decideAccessRequest } from '@/lib/parties';
import { useAuth } from '@/context/AuthContext';
import { ROLE_LABEL } from '@/types/party';
import type { AccessRequest } from '@/types/accessRequest';
import { useDateFormatters } from '@/lib/useDateFormatters';

type Box = 'incoming' | 'outgoing';

const STATUS_STYLE: Record<string, string> = {
  pending:  'bg-amber-50 text-amber-700',
  approved: 'bg-green-50 text-green-700',
  denied:   'bg-red-50 text-red-700',
  expired:  'bg-gray-100 text-gray-600',
};

export default function ApprovalsPage() {
  // Requests are read as a timeline, so these keep the time after the date.
  const { formatDateTime: formatWhen } = useDateFormatters();
  const { user, isAdmin } = useAuth();
  const [box, setBox]         = useState<Box>('incoming');
  const [requests, setReqs]   = useState<AccessRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [busyId, setBusyId]   = useState('');

  const load = useCallback(async (which: Box) => {
    setLoading(true);
    setError('');
    try {
      setReqs(await listAccessRequests(which));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load requests');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (user) void load(box); }, [user, box, load]);

  async function decide(id: string, action: 'approve' | 'deny') {
    setBusyId(id);
    setError('');
    try {
      await decideAccessRequest(id, action);
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
          Requests to use a client, shipper or consignee that belongs to someone else.
          Each approval covers one order.
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
      ) : requests.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-gray-400 text-sm">
            {box === 'incoming' ? 'Nothing waiting on you.' : 'You have not requested any access.'}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {requests.map((r) => (
            <li key={r.id} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900">{r.partyName}</span>
                    <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 text-xs font-medium">
                      as {ROLE_LABEL[r.role]}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_STYLE[r.status] ?? ''}`}>
                      {r.status}
                    </span>
                  </div>

                  <p className="text-sm text-gray-600 mt-1.5">
                    {box === 'incoming' ? (
                      <><strong>{r.requestedByName}</strong> wants to use this record</>
                    ) : (
                      <>Owned by <strong>{r.ownerName}</strong></>
                    )}
                    {' · '}{formatWhen(r.createdAt)}
                  </p>

                  {r.reason && (
                    <p className="text-sm text-gray-700 mt-2 italic">“{r.reason}”</p>
                  )}

                  {r.status !== 'pending' && r.decidedByName && (
                    <p className="text-xs text-gray-500 mt-2">
                      {r.status === 'denied' ? 'Denied' : 'Approved'} by{' '}
                      <strong>{r.decidedByName}</strong>
                      {r.decidedByAdmin && ' (admin)'}
                      {' on '}{formatWhen(r.decidedAt)}
                      {r.decidedByIp && <span className="font-mono ml-1">({r.decidedByIp})</span>}
                    </p>
                  )}

                  {r.status === 'expired' && r.consumedByOrderId && (
                    <p className="text-xs text-gray-500 mt-1">
                      Used on order{' '}
                      <a href={`/dashboard/orders/${r.consumedByOrderId}`} className="text-brand-600 hover:underline">
                        {r.consumedByOrderId}
                      </a>
                    </p>
                  )}

                  {r.denyReason && (
                    <p className="text-xs text-red-600 mt-1">Reason: {r.denyReason}</p>
                  )}
                </div>

                {box === 'incoming' && r.status === 'pending' && (
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => decide(r.id, 'approve')}
                      disabled={busyId === r.id}
                      className="px-3 py-1.5 bg-brand-600 text-white text-xs font-semibold rounded-lg hover:bg-brand-700 transition disabled:opacity-50"
                    >
                      {busyId === r.id ? '…' : 'Approve'}
                    </button>
                    <button
                      onClick={() => decide(r.id, 'deny')}
                      disabled={busyId === r.id}
                      className="px-3 py-1.5 border border-gray-300 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-50 transition disabled:opacity-50"
                    >
                      Deny
                    </button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
