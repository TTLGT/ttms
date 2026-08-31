'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Lock, Phone, SearchX } from 'lucide-react';
import MessagePersonButton from '@/components/chat/MessagePersonButton';
import { telHref } from '@/lib/phone';
import type { OwnerContact } from '@/types/order';

type RequestState = 'idle' | 'sending' | 'sent' | 'error';

interface Props {
  /** What the reader was trying to open, in the words they would use. */
  kind: 'order' | 'client';
  /** `missing` — the record is gone. `denied` — it exists and is not theirs. */
  status: 'missing' | 'denied';
  /** Who to go and ask. Empty when nobody owns the record. */
  ownerName?: string;
  /**
   * What the reader was refused, in the number they and their colleague both
   * use for it. They arrived on a Firestore id, which names nothing anybody
   * says out loud, and you cannot ask about a load you cannot name.
   */
  recordNumber?: string;
  /** Chat uid and desk number for the owner, where there is one account. */
  owner?: OwnerContact | null;
  backHref: string;
  backLabel: string;
  /**
   * Sends a request to the owner. Both kinds have one now — orders got
   * orderAccessRequests, the sibling of partyAccessRequests — but it stays
   * optional so a caller with no request path never renders a button that
   * does nothing.
   */
  onRequest?: (reason: string) => Promise<void>;
  /**
   * What approval will get them, in one line. The two grants genuinely differ:
   * a party approval is spent on one order, an order approval is a standing
   * read of that load. Saying the wrong one is worse than saying nothing.
   */
  grantNote?: string;
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
  kind, status, ownerName, recordNumber, owner, backHref, backLabel, onRequest, grantNote,
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
    <Shell
      icon={<Lock className="w-5 h-5 text-gray-400" />}
      title={recordNumber
        ? `You do not have access to ${NOUN[kind]} ${recordNumber}`
        : `You do not have access to this ${NOUN[kind]}`}
    >
      <p className="text-sm text-gray-600">
        {ownerName
          ? <>It belongs to <strong className="text-gray-900">{ownerName}</strong>.</>
          : <>Nobody is assigned to it, so only an administrator can open it.</>}
        {/* Only where there is a "them" to ask. An unowned order sends the
            reader to an administrator, which the line above already says. */}
        {kind === 'order' && ownerName && ' Ask them to add you to it, or to share what you need.'}
      </p>

      {/* The two ways to actually reach them. Rendered even when a request can
          be raised below: a message gets an answer today, and an approval is
          worth nothing to somebody who needed the rate ten minutes ago. */}
      {(owner?.uid || owner?.phone) && (
        <div className="flex items-center gap-4 mt-3">
          <MessagePersonButton
            uid={owner.uid}
            name={ownerName}
            label={`Message ${ownerName || 'the owner'}`}
            className="inline-flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-700 disabled:opacity-50"
            iconSize={14}
          />
          {owner.phone && (
            <a href={telHref(owner.phone, 'US')}
              className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
              <Phone size={14} className="opacity-70" />
              {owner.phone}
              {owner.extension && <span className="text-gray-400">ext. {owner.extension}</span>}
            </a>
          )}
        </div>
      )}

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
          {/* Said here rather than after the fact: the requester should know
              what they are asking for before they ask, and the owner should not
              be the only person who knows what approving it hands over. */}
          {grantNote && <p className="text-xs text-gray-500 mt-2">{grantNote}</p>}
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
