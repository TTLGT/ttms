/**
 * The order form's three free-text boxes, one per reader — kept apart because
 * the old single Notes box was printed on every document, so a remark meant
 * for colleagues went to the carrier and the client too.
 *
 * - Internal notes: staff only. Printed on nothing.
 * - Carrier: the dispatch sheet and the BOL.
 * - Client: the quote and the load confirmation. The client can add their own
 *   when they sign; those are kept beside these (`clientAddedInstructions`)
 *   and shown read-only here, so editing ours can never overwrite theirs.
 */

import type { ClientAddedInstruction } from '@/types/order';

export interface NotesAndInstructions {
  notes: string;
  carrierInstructions: string;
  clientInstructions: string;
}

export const BLANK_NOTES_AND_INSTRUCTIONS: NotesAndInstructions = { notes: '', carrierInstructions: '', clientInstructions: '' };

/**
 * What every new order's carrier instructions start as. Only a starting point:
 * the broker can add to it or rewrite it per load. Orders already saved keep
 * whatever they have — this is never filled in behind anyone's back.
 */
export const DEFAULT_CARRIER_INSTRUCTIONS =
  'We need pictures of the unit at the pickup location to avoid any damage liability from the carrier. '
  + 'Any damages will be disputed by the customer. To process payment efficiently, please email the following '
  + 'to accounting@totaltransportlogistics.us: the invoice, BOL per load, W9, and payment method information. '
  + 'Payments will not be processed if any of the paperwork and information is missing. '
  + 'DO NOT DELIVER UNTIL THE BROKER CONFIRMS CUSTOMER PAID IN FULL. (918) 510-6747';

/** Where the new-order form starts: blank, except the carrier's default instructions. */
export const NEW_ORDER_NOTES_AND_INSTRUCTIONS: NotesAndInstructions = {
  ...BLANK_NOTES_AND_INSTRUCTIONS, carrierInstructions: DEFAULT_CARRIER_INSTRUCTIONS,
};

/** The stored shape, trimmed — what the create and edit screens save. */
export function notesAndInstructionsForSave(v: NotesAndInstructions): NotesAndInstructions {
  return {
    notes:               v.notes.trim(),
    carrierInstructions: v.carrierInstructions.trim(),
    clientInstructions:  v.clientInstructions.trim(),
  };
}

const BOX = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 resize-y';

function Box({ label, hint, value, onChange, placeholder }: {
  label: string; hint: string; value: string; onChange: (v: string) => void; placeholder: string;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-gray-700">{label}</span>
      <span className="block text-xs text-gray-500 mb-1">{hint}</span>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3}
        placeholder={placeholder} className={BOX} />
    </label>
  );
}

export default function NotesAndInstructionsFields({ value, onChange, clientAdded = [], formatWhen }: {
  value: NotesAndInstructions;
  onChange: (v: NotesAndInstructions) => void;
  /** What the client added when signing, read-only. Empty on a new order. */
  clientAdded?: ClientAddedInstruction[];
  formatWhen?: (at: ClientAddedInstruction['at']) => string;
}) {
  const set = (k: keyof NotesAndInstructions) => (v: string) => onChange({ ...value, [k]: v });
  return (
    <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
      <h2 data-es className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Notes and Instructions</h2>
      <Box label="Internal notes" value={value.notes} onChange={set('notes')}
        hint="For the company only. Never printed on a document or sent to a carrier or client."
        placeholder="Anything colleagues should know about this load…" />
      <div>
        <Box label="Special instructions for the carrier" value={value.carrierInstructions} onChange={set('carrierInstructions')}
          hint="Printed on the dispatch sheet the carrier signs and on the BOL. Starts with the standard text; add to it or change it for this load."
          placeholder="e.g. Call the consignee one hour before arrival. Tarps required." />
        {!value.carrierInstructions.includes(DEFAULT_CARRIER_INSTRUCTIONS) && (
          <button type="button"
            onClick={() => set('carrierInstructions')(
              value.carrierInstructions.trim()
                ? `${DEFAULT_CARRIER_INSTRUCTIONS}\n\n${value.carrierInstructions.trim()}`
                : DEFAULT_CARRIER_INSTRUCTIONS)}
            className="mt-1 text-xs font-medium text-brand-600 hover:text-brand-700">
            Add the standard text
          </button>
        )}
      </div>
      <div>
        <Box label="Special instructions for the client" value={value.clientInstructions} onChange={set('clientInstructions')}
          hint="Printed on the quote and the load confirmation. The client can add their own when they sign; theirs are kept below and never replaced by these."
          placeholder="e.g. Have the vehicle keys ready at pickup." />
        {clientAdded.map((e, i) => (
          <div key={i} className="mt-2 rounded-lg border border-brand-100 bg-brand-50 px-3 py-2">
            <p className="text-xs text-gray-500">
              Added by the client · {e.signerName || 'signer'} when signing{formatWhen ? `, ${formatWhen(e.at)}` : ''}
            </p>
            <p className="text-sm text-gray-800 whitespace-pre-line mt-0.5">{e.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
