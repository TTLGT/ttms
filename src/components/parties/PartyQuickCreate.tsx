'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { createParty, getParty, PartyOwnedError } from '@/lib/parties';
import { ROLE_LABEL, looksLikePhone } from '@/types/party';
import type { Party, PartyRole } from '@/types/party';
import PartyFields, { blankPartyDraft, validatePartyDraft } from './PartyFields';
import type { PartyDraft, PartyField } from './PartyFields';

/**
 * Adds a client, shipper or consignee without leaving the order.
 *
 * This is what the order form's picker now opens instead of creating a record
 * from the typed name alone. The dialog exists rather than a link to the New
 * Client page because a broker is mid-order: sending them away means losing
 * the freight, the rate and the dates they have already entered.
 *
 * Same fields and the same rules as the standalone page — both render
 * PartyFields and both call validatePartyDraft, so a record cannot be more
 * complete on one screen than the other.
 */
export default function PartyQuickCreate({
  role,
  /** What the broker had already typed: a name, or a phone number. */
  prefill,
  onCreated,
  onPicked,
  onClose,
}: {
  role: PartyRole;
  prefill: string;
  onCreated: (party: Party) => void;
  /** An existing record the phone lookup turned up and the broker chose. */
  onPicked: (party: Party) => void;
  onClose: () => void;
}) {
  const [draft, setDraft]   = useState<PartyDraft>(() => seed(role, prefill));
  const [errors, setErrors] = useState<Partial<Record<PartyField, string>>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');
  const [owned, setOwned]   = useState<string | null>(null);

  // Escape closes, like every other dismissible layer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function handleSave() {
    const found = validatePartyDraft(draft);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setError('Fill in the highlighted fields before saving.');
      return;
    }

    setError('');
    setOwned(null);
    setSaving(true);
    try {
      const id = await createParty({
        companyName: draft.companyName.trim(),
        contactName: draft.contactName.trim(),
        phone:       draft.phone.trim(),
        email:       draft.email.trim(),
        phone2:      draft.phone2.trim(),
        email2:      draft.email2.trim(),
        address:     draft.address,
        roles:       draft.roles,
        // Only meaningful on a client — a shipper or consignee is a facility,
        // not a lead. Matches what the API and the party pages do.
        sourceId:    draft.roles.includes('client') ? draft.sourceId : null,
        notes:       draft.notes.trim(),
        owners:      { uids: draft.ownerUids, groupIds: draft.ownerGroupIds },
      });
      const created = await getParty(id);
      if (created.status !== 'ok') {
        throw new Error('The record was saved but could not be read back. Open it from the Clients list.');
      }
      onCreated(created.party);
    } catch (e) {
      if (e instanceof PartyOwnedError) setOwned(e.ownerName);
      else setError(e instanceof Error ? e.message : 'Could not save that record');
      setSaving(false);
    }
  }

  const label = ROLE_LABEL[role].toLowerCase();

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-6"
      role="dialog" aria-modal="true" aria-label={`New ${label}`}>
      <div className="w-full max-w-3xl bg-white rounded-xl shadow-xl my-6">
        <div className="flex items-start justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">New {ROLE_LABEL[role]}</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Everything except the second phone, second email and comments is required — this
              record is what agreements and load confirmations are addressed to.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            className="text-gray-400 hover:text-gray-600 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5">
          <PartyFields
            value={draft}
            onChange={setDraft}
            errors={errors}
            onUseExisting={onPicked}
          />
        </div>

        {owned && (
          <div className="mx-6 mb-4 rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
            That name is already on file and belongs to <strong>{owned}</strong>. Close this and
            request approval from the picker, or save it under a different name.
          </div>
        )}

        {error && (
          <div className="mx-6 mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600">
            {error}
          </div>
        )}

        <div className="flex gap-3 border-t border-gray-200 px-6 py-4">
          <button type="button" onClick={handleSave} disabled={saving}
            className="px-5 py-2 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 disabled:opacity-50 transition">
            {saving ? 'Saving…' : `Save ${label}`}
          </button>
          <button type="button" onClick={onClose}
            className="px-5 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Puts what was already typed where it belongs.
 *
 * A broker who typed a phone number into the picker was searching by number —
 * BATS's habit — so it lands in the phone box and the lookup runs against it
 * straight away. Anything else is a name.
 */
function seed(role: PartyRole, prefill: string): PartyDraft {
  const draft = blankPartyDraft(role);
  const typed = prefill.trim();
  if (!typed) return draft;
  return looksLikePhone(typed)
    ? { ...draft, phone: typed }
    : { ...draft, companyName: typed };
}
