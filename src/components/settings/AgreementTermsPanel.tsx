'use client';

import { useCallback, useEffect, useState } from 'react';
import { getAgreementTerms, saveAgreementTerms, type AgreementTermsResponse } from '@/lib/agreementTerms';
import { useDateFormatters } from '@/lib/useDateFormatters';
import { DEFAULT_TERMS, type TermsParty } from '@/types/agreementTerms';
import TermsEditor from './TermsEditor';

/**
 * Settings → Operations → Agreement Terms: the general terms and conditions
 * on the client's SA and on the carrier's Dispatch Sheet. One load can have
 * its own instead, from the order. See src/types/agreementTerms.ts.
 *
 * An admin's save applies at once; anybody else's goes to an admin to approve
 * (TermsEditor says which before they press it).
 */
const TABS: { party: TermsParty; label: string; blurb: string }[] = [
  {
    party: 'client',
    label: 'Client SA',
    blurb: 'The terms on the client’s Shipper Agreement (load confirmation). Clients read these on the signing page and must accept them before they can sign.',
  },
  {
    party: 'carrier',
    label: 'Carrier Dispatch Sheet',
    blurb: 'The terms on the carrier’s Dispatch Sheet (rate confirmation). Carriers read these on the signing page and must accept them before they can sign.',
  },
];

export default function AgreementTermsPanel() {
  const { formatDateTime } = useDateFormatters();
  const [data, setData] = useState<AgreementTermsResponse | null>(null);
  const [party, setParty] = useState<TermsParty>('client');
  const [error, setError] = useState('');

  const load = useCallback(() => {
    getAgreementTerms()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load the agreement terms'));
  }, []);
  useEffect(load, [load]);

  const tab = TABS.find((t) => t.party === party)!;
  const terms = data?.[party];

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-900">Agreement Terms</h2>
      <p className="mt-1 text-sm text-gray-500">
        The general terms and conditions for every load. A change applies to agreements sent from now on;
        links already sent keep the terms they went out with. A single load can be given its own terms
        from the order.
      </p>

      <div className="mt-4 mb-3 flex gap-1 border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t.party}
            type="button"
            onClick={() => setParty(t.party)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
              party === t.party ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
            {(data?.[t.party].pending.length ?? 0) > 0 && (
              <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 text-[11px] font-semibold text-amber-700">
                {data![t.party].pending.length}
              </span>
            )}
          </button>
        ))}
      </div>
      <p className="mb-3 text-sm text-gray-500">{tab.blurb}</p>

      {!data && !error && <p className="text-sm text-gray-500">Loading…</p>}
      {data && terms && (
        <TermsEditor
          key={party}
          party={party}
          saved={terms.text}
          standard={DEFAULT_TERMS[party]}
          canApprove={data.canApprove}
          pending={terms.pending}
          onSave={(text, reason) => saveAgreementTerms(party, text, reason)}
          onChanged={load}
          footer={terms.isDefault
            ? 'Showing the standard terms. Nothing has been saved here yet.'
            : `Last saved${terms.updatedBy ? ` by ${terms.updatedBy}` : ''}${terms.updatedAt ? `, ${formatDateTime(terms.updatedAt)}` : ''}.`}
        />
      )}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </section>
  );
}
