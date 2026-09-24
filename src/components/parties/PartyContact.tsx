'use client';

import { Mail, Phone, User } from 'lucide-react';
import CopyValue from '@/components/CopyValue';
import PhoneValue from '@/components/PhoneValue';
import type { Party } from '@/types/party';

/**
 * A party's contact person, phone and email, shown under its name on an order.
 *
 * Read off the party record at the moment it is drawn, never copied onto the
 * order. An order keeps its client's *name* because that is what its paperwork
 * printed; a phone number is only useful if it is the current one, and a
 * copy on every load would go stale the day the client changed it.
 *
 * The first number and address are shown, falling back to the second when the
 * first is blank — imported records often filled only one of the pair, and
 * the question on an order is "how do I reach them", not "which slot is it in".
 *
 * Renders nothing when neither exists, rather than two dashes: an order with a
 * party nobody filled in is already flagged elsewhere, and a pair of empty
 * rows under every name would bury the ones that do have something.
 *
 * The contact person is the one to ask for — a switchboard number is little
 * use without a name. It is only drawn when the party has a company name:
 * without one, partyDisplayName() already shows the contact as the party's
 * name, and printing it twice reads like two people.
 */
export default function PartyContact({ party }: { party: Party | null | undefined }) {
  if (!party) return null;

  const primaryPhone = (party.phone ?? '').trim();
  const phone  = primaryPhone || (party.phone2 ?? '').trim();
  const region = primaryPhone ? party.phoneRegion : party.phone2Region;
  const email  = (party.email ?? '').trim() || (party.email2 ?? '').trim();

  const contact = (party.companyName ?? '').trim()
    ? (party.contactName ?? '').trim()
    : '';

  if (!contact && !phone && !email) return null;

  return (
    <span className="mt-1 flex flex-col gap-0.5 text-xs text-gray-600 font-normal">
      {contact && (
        <span className="flex items-center gap-1.5 min-w-0">
          <User className="w-3 h-3 flex-shrink-0 text-gray-400" aria-hidden />
          <span className="truncate">{contact}</span>
        </span>
      )}
      {phone && (
        <span className="flex items-center gap-1.5 min-w-0">
          <Phone className="w-3 h-3 flex-shrink-0 text-gray-400" aria-hidden />
          <PhoneValue value={phone} region={region} label="phone number" />
        </span>
      )}
      {email && (
        <span className="group flex items-center gap-1.5 min-w-0">
          <Mail className="w-3 h-3 flex-shrink-0 text-gray-400" aria-hidden />
          <CopyValue value={email} label="email address">
            <a href={`mailto:${email}`} className="truncate hover:text-brand-700 hover:underline">
              {email}
            </a>
          </CopyValue>
        </span>
      )}
    </span>
  );
}
