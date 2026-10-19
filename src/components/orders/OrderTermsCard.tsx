'use client';

import { useCallback, useEffect, useState } from 'react';
import { FileSignature } from 'lucide-react';
import { getOrderTerms, saveOrderTerms, type OrderTermsResponse } from '@/lib/agreementTerms';
import TermsEditor from '@/components/settings/TermsEditor';
import { type TermsParty } from '@/types/agreementTerms';

/**
 * This load's terms and conditions, on the order — the general ones, or terms
 * of its own for this load only. See `ORDER_TERMS_FIELD` in
 * src/types/agreementTerms.ts.
 *
 * Drawn only for `agreementTerms.manage` (the page decides); the route checks
 * again and decides whether a save applies or goes to an admin.
 */
const PARTS: { party: TermsParty; label: string; sent: string }[] = [
  {
    party: 'client', label: 'Client SA',
    sent: 'If the SA has already gone out, changing these puts it on hold for review, and the client is asked to sign the update.',
  },
  {
    party: 'carrier', label: 'Carrier Dispatch Sheet',
    sent: 'A Dispatch Sheet already sent keeps the terms it went out with. Send it again for the carrier to see a change.',
  },
];

export default function OrderTermsCard({ orderId, onChanged }: { orderId: string; onChanged?: () => void }) {
  const [data, setData] = useState<OrderTermsResponse | null>(null);
  const [editing, setEditing] = useState<TermsParty | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    getOrderTerms(orderId)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load this load’s terms'));
  }, [orderId]);
  useEffect(load, [load]);

  const changed = () => { load(); onChanged?.(); };

  async function backToGeneral(party: TermsParty) {
    setBusy(true);
    setError('');
    try {
      await saveOrderTerms(orderId, party, null);
      setEditing(null);
      changed();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change this load’s terms');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div id="terms" className="bg-white rounded-xl border border-gray-200 p-6 scroll-mt-4">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-2">
        <FileSignature className="w-4 h-4" /> Terms and Conditions
      </h3>
      <p className="mt-1 text-xs text-gray-500">
        Changes here apply to this load only. The terms for every load are in Settings → Operations → Agreement Terms.
      </p>

      {!data && !error && <p className="mt-3 text-sm text-gray-500">Loading…</p>}
      {data && (
        <div className="mt-4 space-y-5">
          {PARTS.map(({ party, label, sent }) => {
            const t = data[party];
            const own = t.own !== null;
            return (
              <div key={party}>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-gray-800">{label}</p>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    own ? 'bg-brand-50 text-brand-700' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {own ? 'Own terms for this load' : 'General terms'}
                  </span>
                  {t.pending.length > 0 && editing !== party && (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                      Change waiting for approval
                    </span>
                  )}
                  {editing !== party && (
                    <button
                      type="button"
                      onClick={() => setEditing(party)}
                      className="ml-auto text-xs font-semibold text-brand-700 hover:underline"
                    >
                      {own ? 'Edit' : 'Change for this load'}
                    </button>
                  )}
                </div>

                {editing === party ? (
                  <div className="mt-2">
                    <p className="mb-2 text-xs text-gray-500">{sent}</p>
                    <TermsEditor
                      party={party}
                      saved={t.own ?? t.general}
                      standard={t.general}
                      canApprove={data.canApprove}
                      pending={t.pending}
                      rows={14}
                      onSave={async (text, reason) => {
                        const res = await saveOrderTerms(orderId, party, text, reason);
                        if (res.applied) setEditing(null);
                        return res;
                      }}
                      onChanged={changed}
                      footer={own ? 'This load’s own terms.' : 'Starting from the general terms.'}
                      extraActions={
                        <>
                          {own && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void backToGeneral(party)}
                              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                            >
                              {data.canApprove ? 'Use the general terms' : 'Ask to use the general terms'}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setEditing(null)}
                            className="rounded-lg px-3 py-2 text-sm text-gray-500 hover:bg-gray-50"
                          >
                            Close
                          </button>
                        </>
                      }
                    />
                  </div>
                ) : own && (
                  <details className="mt-1 text-xs text-gray-600">
                    <summary className="cursor-pointer">See this load’s terms</summary>
                    <pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap rounded bg-gray-50 p-2 font-sans">{t.own}</pre>
                  </details>
                )}
              </div>
            );
          })}
        </div>
      )}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  );
}
