'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Lock, SearchX } from 'lucide-react';

type RequestState = 'idle' | 'sending' | 'sent' | 'error';

interface Props {
  /** What the reader was trying to open, in the words they would use. */
  kind: 'order' | 'client';
  /** `missing` — the record is gone. `denied` — it exists and is not theirs. */
  status: 'missing' | 'denied';
  /** Who to go and ask. Empty when nobody owns the record. */
  ownerName?: string;
  backHref: string;
  backLabel: string;
  /**
   * Sends a request to the owner. Omitted where no request path exists yet —
   * orders have no equivalent of partyAccessRequests, so their panel explains
   * who to ask and stops there rather than offering a button that does nothing.
   */
  onRequest?: (reason: string) => Promise<void>;
}

const NOUN = { order: 'order', client: 'client' } as const;

/**
 * What a colleague sees when they open a link to a record they cannot read.
 *
 * Both pages used to render "not found" here, which was false for every case
 * that mattered: the record almost always exists and simply belongs to someone
 * else. Two people would then spend ten minutes deciding whether a load had
 * been deleted. Naming the owner is the whole point of this panel.
 */
export default function NoAccessPanel({
  kind, status, ownerName, backHref, backLabel, onRequest,
}: Props) {
  const [reason, setReason] = useState('');
  const [state,  setState]  = useState<RequestState>('idle');
  const [error,  setError]  = useState('');

  async function send() {
    if (!onRequest) return;
    setState('sending');
    setError('');
    try {
      await onRequest(reason.trim());
      setState('sent');
    } catch (e) {
      setState('error');
      setError(e instanceof Error ? e.message : 'Could not send the request');
    }
  }

  if (status === 'missing') {
    return (
      <Shell icon={<SearchX className="w-5 h-5 text-gray-400" />} title={`This ${NOUN[kind]} no longer exists`}>
        <p className="text-sm text-gray-600">
          It was deleted, or the link points at an id that was never here.
        </p>
        <Back href={backHref} label={backLabel} />
      </Shell>
    );
  }

  return (
    <Shell icon={<Lock className="w-5 h-5 text-gray-400" />} title={`You do not have access to this ${NOUN[kind]}`}>
      <p className="text-sm text-gray-600">
        {ownerName
          ? <>It belongs to <strong className="text-gray-900">{ownerName}</strong>.</>
          : <>Nobody is assigned to it, so only an administrator can open it.</>}
        {/* Only where there is a "them" to ask. An unowned order sends the
            reader to an administrator, which the line above already says. */}
        {kind === 'order' && ownerName && ' Ask them to add you to it, or to share what you need.'}
      </p>

      {onRequest && state !== 'sent' && (
        <div className="mt-5 pt-5 border-t border-gray-200">
          <label htmlFor="access-reason" className="block text-xs font-medium text-gray-600 mb-1">
            Why do you need it? {ownerName || 'The owner'} will see this.
          </label>
          <textarea
            id="access-reason"
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Covering while Maria is out — need the rate on this load."
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
          />
          <button
            type="button"
            onClick={send}
            disabled={state === 'sending'}
            className="mt-3 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 disabled:opacity-50"
          >
            {state === 'sending' ? 'Sending…' : 'Request access'}
          </button>
          {/* Said here rather than after the fact: approval also lets the
              requester put this client on one order, and the owner should not
              be the only person who knows that. */}
          <p className="text-xs text-gray-500 mt-2">
            If approved, you will be able to open this client and use it on one order.
          </p>
          {state === 'error' && <p className="text-sm text-red-600 mt-2">{error}</p>}
        </div>
      )}

      {state === 'sent' && (
        <p className="mt-5 pt-5 border-t border-gray-200 text-sm text-green-700">
          Request sent. It is waiting on {ownerName || 'the owner'} — you will find it under
          {' '}<Link href="/dashboard/approvals" className="underline">Approvals</Link>.
        </p>
      )}

      <Back href={backHref} label={backLabel} />
    </Shell>
  );
}

function Shell({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="p-8 max-w-xl">
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-2">
          {icon}
          <h1 className="text-base font-semibold text-gray-900">{title}</h1>
        </div>
        {children}
      </div>
    </div>
  );
}

function Back({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="inline-block text-sm text-brand-600 hover:underline mt-5">
      ← {label}
    </Link>
  );
}
