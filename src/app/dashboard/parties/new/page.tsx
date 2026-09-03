'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createParty, PartyOwnedError } from '@/lib/parties';
import { ROLE_LABEL } from '@/types/party';
import type { Party, PartyRole } from '@/types/party';
import PartyFields, { blankPartyDraft, validatePartyDraft } from '@/components/parties/PartyFields';
import type { PartyDraft, PartyField } from '@/components/parties/PartyFields';

/**
 * The standalone way in to a new client, shipper or consignee.
 *
 * Renders the same PartyFields as the quick-add dialog on the order form and
 * runs the same validatePartyDraft, so a record made here and a record made
 * mid-order are the same record. They used to differ completely — the order
 * form asked for a name and nothing else.
 */
function NewPartyForm() {
  const router = useRouter();
  const params = useSearchParams();
  const initialRole = (params.get('role') as PartyRole) ?? 'client';

  const [draft, setDraft]   = useState<PartyDraft>(() => blankPartyDraft(initialRole));
  const [errors, setErrors] = useState<Partial<Record<PartyField, string>>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');
  const [duplicate, setDuplicate] = useState<{ ownerName: string } | null>(null);

  const displayName = draft.companyName.trim() || draft.contactName.trim();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const found = validatePartyDraft(draft);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setError('Fill in the highlighted fields before saving.');
      return;
    }

    setError('');
    setDuplicate(null);
    setSaving(true);
    try {
      // The duplicate check happens server-side: the clash may be with a record
      // this user is not allowed to see.
      const id = await createParty({
        companyName: draft.companyName.trim(),
        contactName: draft.contactName.trim(),
        phone:       draft.phone.trim(),
        email:       draft.email.trim(),
        phone2:      draft.phone2.trim(),
        email2:      draft.email2.trim(),
        address:     draft.address,
        roles:       draft.roles,
        // Only meaningful on a client, so it is not sent when the record is
        // being created purely as a shipper or consignee.
        sourceId:    draft.roles.includes('client') ? draft.sourceId : null,
        notes:       draft.notes.trim(),
        owners:      { uids: draft.ownerUids, groupIds: draft.ownerGroupIds },
      });
      router.push(`/dashboard/parties/${id}`);
    } catch (err: unknown) {
      if (err instanceof PartyOwnedError) {
        setDuplicate({ ownerName: err.ownerName });
      } else {
        setError(err instanceof Error ? err.message : 'Failed to create');
      }
      setSaving(false);
    }
  }

  /** The phone lookup found this one already on file — open it instead. */
  function useExisting(party: Party) {
    router.push(`/dashboard/parties/${party.id}`);
  }

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-6">
        <button onClick={() => router.back()} className="text-sm text-gray-500 hover:text-gray-700 mb-2 flex items-center gap-1">
          ← Back
        </button>
        <h1 className="text-2xl font-bold text-gray-900">New {ROLE_LABEL[initialRole]}</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Everything except the second phone, second email and comments is required — this record
          is what agreements and load confirmations are addressed to.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <PartyFields
            value={draft}
            onChange={setDraft}
            errors={errors}
            onUseExisting={useExisting}
          />
        </section>

        {duplicate && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800">
            <strong>{displayName}</strong> is already on file and belongs to{' '}
            <strong>{duplicate.ownerName}</strong>. Talk to them about using it — they or an admin
            need to approve it. You can also raise the request from the order form.
          </div>
        )}

        {error && <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-600">{error}</div>}

        <button type="submit" disabled={saving}
          className="px-4 py-2 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 transition disabled:opacity-50">
          {saving ? 'Saving…' : 'Create'}
        </button>
      </form>
    </div>
  );
}

export default function NewPartyPage() {
  return (
    <Suspense fallback={null}>
      <NewPartyForm />
    </Suspense>
  );
}
