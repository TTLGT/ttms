'use client';

import { useCallback, useEffect, useState } from 'react';
import { getAgreementTerms, saveAgreementTerms, type AgreementTermsResponse } from '@/lib/agreementTerms';
import { useDateFormatters } from '@/lib/useDateFormatters';
import { DEFAULT_TERMS, type TermsParty } from '@/types/agreementTerms';
import TermsEditor from './TermsEditor';
import { Bi } from '@/components/spanish/Es';
import { Loading, Notice, SettingsCard } from './kit/ui';

/**
 * Settings → Agreement terms: the general terms and conditions
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
    <SettingsCard>
      <Notice tone="blue" className="mb-4">
        A change applies to agreements sent from now on; links already sent keep the terms they went out with. A single load can be given its own terms from the order.
      </Notice>

      <div className="mb-3 flex gap-1 border-b border-gray-200">
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

      {!data && !error && <Loading />}
      {/* Both editors stay mounted and the other is only hidden, so switching
          tabs keeps what was typed in each — and both drafts are saved by the
          one Save bar. */}
      {data && terms && TABS.map(({ party: p }) => (
        <div key={p} hidden={p !== party}>
          <TermsEditor
            party={p}
            saved={data[p].text}
            standard={DEFAULT_TERMS[p]}
            canApprove={data.canApprove}
            pending={data[p].pending}
            onSave={(text, reason) => saveAgreementTerms(p, text, reason)}
            onChanged={load}
            trackedChanges
            footer={data[p].isDefault
              ? 'Showing the standard terms. Nothing has been saved here yet.'
              : `Last saved${data[p].updatedBy ? ` by ${data[p].updatedBy}` : ''}${data[p].updatedAt ? `, ${formatDateTime(data[p].updatedAt)}` : ''}.`}
          />
        </div>
      ))}
      {error && <Notice tone="red" className="mt-3">{error}</Notice>}
    </SettingsCard>
  );
}
