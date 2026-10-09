'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { auth } from '@/lib/firebase';
import type { SignFormData } from '@/lib/signFormProps';
import SignForm from '@/app/sign/[token]/SignForm';

type Preview = { current: SignFormData | null; pending: SignFormData | null; held: boolean };

/**
 * The client's load confirmation, as staff preview it from the order.
 *
 * Read-only by construction: SignForm in `preview` mode draws no form and has
 * no token to post to. The client's own link is the only place a signature
 * can be made — a signature made from a staff preview would record staff's
 * device and address against the client's name.
 *
 * Two views when the order has changed since the last send: what the client's
 * link shows now, and what sending would change it to — the second is what
 * dispatch is reviewing while the link is on hold.
 */
export default function AgreementPreviewPage() {
  const params = useParams();
  const orderId = params.orderId as string;
  const [data, setData] = useState<Preview | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'current' | 'pending'>('current');

  useEffect(() => {
    (async () => {
      const user = auth.currentUser;
      if (!user) return;
      const res = await fetch(`/api/orders/${orderId}/agreement-preview`, {
        headers: { Authorization: `Bearer ${await user.getIdToken()}` },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((body as { error?: string }).error ?? 'Could not load the agreement');
      const preview = body as Preview;
      setData(preview);
      // Open on the update when there is one: that is what somebody arriving
      // here from a held link has come to check.
      if (preview.pending && (preview.held || !preview.current)) setTab('pending');
    })().catch((e) => setError(e instanceof Error ? e.message : 'Could not load the agreement'));
  }, [orderId]);

  const shown = tab === 'pending' ? data?.pending : data?.current;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href={`/dashboard/orders/${orderId}`} className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900">
        <ArrowLeft className="h-4 w-4" /> Back to the order
      </Link>

      <div>
        <h1 className="text-xl font-bold text-gray-900">Client agreement preview</h1>
        <p className="mt-1 text-sm text-gray-500">
          Exactly what the client reads on their signing link. Nothing can be signed from this page.
        </p>
      </div>

      {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</p>}
      {!data && !error && <p className="text-sm text-gray-500">Loading…</p>}

      {data && (data.current || data.pending) && (
        <>
          {data.current && data.pending && (
            <div className="flex gap-1 rounded-lg border border-gray-200 bg-white p-1 text-sm">
              {([
                ['current', data.held ? 'Last sent (on hold)' : 'What the client sees now'],
                ['pending', 'The update, once sent'],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  className={`flex-1 rounded-md px-3 py-1.5 ${tab === key ? 'bg-brand-600 font-semibold text-white' : 'text-gray-600 hover:bg-gray-50'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {tab === 'current' && data.held && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              The order changed after this was sent, so the client&rsquo;s link is on hold. They see a &ldquo;being
              updated&rdquo; message instead of this until dispatch sends the update.
            </p>
          )}
          {tab === 'pending' && !data.current && (
            <p className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
              Not sent yet. This is what the client will get when the SA is sent.
            </p>
          )}

          {shown && <SignForm preview {...shown} />}
        </>
      )}
    </div>
  );
}
