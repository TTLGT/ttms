'use client';

import { AlertTriangle, BadgeCheck, BellRing, FileSignature, Mail, MapPin, Phone, Receipt, StickyNote, User, Users } from 'lucide-react';
import CopyValue from '@/components/CopyValue';
import PhoneValue from '@/components/PhoneValue';
import PartyLink from '@/components/parties/PartyLink';
import ClientSnapshotView, { ClientTypeBadges, useClientSnapshot } from '@/components/parties/ClientSnapshotView';
import { UpdatePrefsLine } from '@/components/parties/PartyAccountCards';
import { Bi } from '@/components/spanish/Es';
import { useDateFormatters } from '@/lib/useDateFormatters';
import { Pill } from './DetailBits';
import { addressLine, partyLocations } from '@/types/partyAddress';
import { LOAD_TYPE_LABEL, isLoadType } from '@/types/order';
import type { Order } from '@/types/order';
import { PAYMENT_TERMS_LABEL, isPaymentTerms, saContactIndex } from '@/types/party';
import type { Contact, Party } from '@/types/party';

/**
 * The body of the General card on the order page (2026-11-11): the load's own
 * facts along the top, then the client — who they are to us, everybody to
 * reach there and what for, how they pay, how they want updates, and their
 * history in numbers.
 *
 * Everything about the client is read off the party record as it is drawn,
 * never copied onto the order — the same reasoning as PartyContact: a phone
 * number or a payment term is only useful if it is the current one.
 *
 * A record this reader may not open is simply absent (see the order page's
 * party lookup); the name still links to the profile, which names the owner.
 */

const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

function EmailLink({ email }: { email: string }) {
  return (
    <CopyValue value={email} label="email address">
      <a href={`mailto:${email}`} className="truncate hover:text-brand-700 hover:underline">{email}</a>
    </CopyValue>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 px-3 py-2 min-w-0">
      <p data-es className="text-[11px] font-medium text-gray-500">{label}</p>
      <div className="text-sm font-semibold text-gray-900 truncate">{children}</div>
    </div>
  );
}

function SubHead({ icon: Icon, children }: { icon: typeof Users; children: string }) {
  return (
    <p className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 mb-1.5">
      <Icon className="w-3.5 h-3.5" aria-hidden /> <span data-es>{children}</span>
    </p>
  );
}

export default function OrderClientInfo({ order, orderId, party, leadSource }: {
  order: Order;
  orderId: string;
  party: Party | undefined;
  leadSource: string;
}) {
  const { formatDate } = useDateFormatters();
  const clientId = order.clientId ?? '';
  const snap = useClientSnapshot(party ? clientId : null);

  // Whether the client is also somebody at a stop — said out loud, because a
  // reader who sees the same name twice on a load wonders whether it is a
  // mistake. It usually is not: a dealer shipping its own car.
  const alsoShipper = !!clientId && (order.shipperId === clientId
    || (order.extraPickups ?? []).some((s) => s.partyId === clientId));
  const alsoConsignee = !!clientId && (order.consigneeId === clientId
    || (order.extraDeliveries ?? []).some((s) => s.partyId === clientId));

  const budget = Number(order.clientBudget) || 0;
  const rate = Number(order.agreedRate) || 0;
  const terms = isPaymentTerms(party?.paymentTerms) ? PAYMENT_TERMS_LABEL[party!.paymentTerms!] : '';

  const facts = (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
      <Fact label="Load type">{isLoadType(order.loadType) ? LOAD_TYPE_LABEL[order.loadType] : <span className="font-normal text-gray-400">Not set</span>}</Fact>
      <Fact label="Quote date">{order.quoteDate ? formatDate(order.quoteDate) : <span className="font-normal text-gray-400">—</span>}</Fact>
      <Fact label="Client budget">
        {budget ? money(budget) : <span className="font-normal text-gray-400">Not given</span>}
        {/* Against what we charge — the reason anybody writes a budget down. */}
        {budget > 0 && rate > 0 && (
          <span className={`block text-[11px] font-medium ${rate <= budget ? 'text-green-700' : 'text-amber-700'}`}>
            {rate <= budget ? `${money(budget - rate)} under it` : `${money(rate - budget)} over it`}
          </span>
        )}
      </Fact>
      <Fact label="Payment terms">{terms || <span className="font-normal text-gray-400">Not set</span>}</Fact>
      <Fact label="Lead source">{leadSource || <span className="font-normal text-gray-400">—</span>}</Fact>
    </div>
  );

  if (!clientId && !order.clientName?.trim()) {
    return (
      <div className="space-y-4">
        {facts}
        <p data-es className="text-sm text-amber-700">No client yet. Edit General to pick one.</p>
      </div>
    );
  }

  const contact = (party?.companyName ?? '').trim() ? (party?.contactName ?? '').trim() : '';
  const phones = party ? [
    { value: (party.phone ?? '').trim(), region: party.phoneRegion },
    { value: (party.phone2 ?? '').trim(), region: party.phone2Region },
  ].filter((p) => p.value) : [];
  const emails = party ? [(party.email ?? '').trim(), (party.email2 ?? '').trim()].filter(Boolean) : [];
  const address = party?.address && (party.address.street || party.address.city) ? addressLine(party.address) : '';
  const contacts = (party?.contacts ?? []).filter((c) => c.name?.trim() || c.email?.trim() || c.phone?.trim());
  const notes = (party?.notes ?? '').trim();
  const signerIndex = saContactIndex(party?.contacts);
  const signer: Contact | null = signerIndex >= 0 ? party!.contacts[signerIndex] : null;
  const billing = contacts.filter((c) => c.billing);
  const locations = partyLocations(party);

  return (
    <div className="space-y-4">
      {facts}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Who the client is, and everybody to reach there. */}
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-semibold">
              <PartyLink id={order.clientId} name={order.clientName} fromOrderId={orderId} />
            </span>
            {snap && <ClientTypeBadges snap={snap} />}
            {alsoShipper && <Pill tone="blue">Also the shipper</Pill>}
            {alsoConsignee && <Pill tone="green">Also the consignee</Pill>}
          </div>

          {party && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm text-gray-700">
              {contact && (
                <p className="flex items-center gap-2 min-w-0">
                  <User className="w-4 h-4 shrink-0 text-gray-400" aria-hidden />
                  <span className="truncate">{contact}</span>
                </p>
              )}
              {phones.map((p) => (
                <p key={p.value} className="flex items-center gap-2 min-w-0">
                  <Phone className="w-4 h-4 shrink-0 text-gray-400" aria-hidden />
                  <PhoneValue value={p.value} region={p.region} label="phone number" />
                </p>
              ))}
              {emails.map((e) => (
                <p key={e} className="group flex items-center gap-2 min-w-0">
                  <Mail className="w-4 h-4 shrink-0 text-gray-400" aria-hidden />
                  <EmailLink email={e} />
                </p>
              ))}
              {address && (
                <p className="flex items-start gap-2 min-w-0 sm:col-span-2">
                  <MapPin className="w-4 h-4 mt-0.5 shrink-0 text-gray-400" aria-hidden />
                  <span>{address}</span>
                </p>
              )}
            </div>
          )}

          {/* Who the SA goes to, said plainly — it is the one contact choice
              with consequences outside TTMS. See saContactIndex(). */}
          {party && (signer || emails.length > 0) && (
            <p className="flex items-center gap-1.5 text-xs text-gray-600">
              <FileSignature className="w-3.5 h-3.5 text-indigo-500" aria-hidden />
              SA goes to {signer ? `${signer.name || signer.email}${signer.role ? ` (${signer.role})` : ''}` : `${contact || 'the main contact'}`}
            </p>
          )}

          {/* The one gap that stops the load: the SA is emailed to the client. */}
          {party && emails.length === 0 && !signer && (
            <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden />
              <Bi>No email on file for this client, so the SA cannot be sent. Add one on the client&apos;s record.</Bi>
            </p>
          )}

          {contacts.length > 0 && (
            <div>
              <SubHead icon={Users}>Other contacts</SubHead>
              <ul className="space-y-2">
                {contacts.slice(0, 6).map((c, i) => (
                  <li key={c.id ?? i} className="text-xs text-gray-700">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-medium text-gray-900">{c.name || '—'}</span>
                      {c.role && <span className="text-gray-500">{c.role}</span>}
                      {c.decisionMaker && <Pill tone="violet" icon={BadgeCheck}>Decision maker</Pill>}
                      {c.billing && <Pill tone="emerald" icon={Receipt}>Billing</Pill>}
                      {c.updates && <Pill tone="blue" icon={BellRing}>Load updates</Pill>}
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-0.5">
                      {c.phone && <PhoneValue value={c.phone} region={c.phoneRegion} label="phone number" />}
                      {c.email && <span className="group inline-flex min-w-0"><EmailLink email={c.email} /></span>}
                      {(c.addressIds ?? []).length > 0 && (
                        <span className="inline-flex items-center gap-1 text-gray-500">
                          <MapPin className="w-3 h-3" aria-hidden />
                          {(c.addressIds ?? []).map((id) => locations.find((l) => l.id === id)?.label).filter(Boolean).join(', ')}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
                {contacts.length > 6 && (
                  <li className="text-xs text-gray-500">+{contacts.length - 6} more on the client&apos;s record</li>
                )}
              </ul>
            </div>
          )}

          {notes && (
            <div className="flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700">
              <StickyNote className="w-3.5 h-3.5 mt-0.5 shrink-0 text-gray-400" aria-hidden />
              <p className="whitespace-pre-line line-clamp-4">{notes}</p>
            </div>
          )}
        </div>

        {/* How they pay, how they want to hear, and their history. */}
        {party && (
          <div className="min-w-0 space-y-4 lg:border-l lg:border-gray-100 lg:pl-5">
            <div>
              <SubHead icon={Receipt}>Billing</SubHead>
              {billing.length ? (
                <ul className="space-y-1 text-sm text-gray-800">
                  {billing.map((c, i) => (
                    <li key={c.id ?? i}>
                      <span className="font-medium">{c.name || '—'}</span>
                      {c.email && <span className="group ml-2 inline-flex text-xs text-gray-600"><EmailLink email={c.email} /></span>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-gray-500"><Bi>No billing contact — invoices go to the main contact.</Bi></p>
              )}
              {party.billingNotes?.trim() && <p className="mt-1 text-xs text-gray-600 whitespace-pre-line">{party.billingNotes}</p>}
            </div>
            <div>
              <SubHead icon={BellRing}>Load updates</SubHead>
              <UpdatePrefsLine prefs={party.updatePrefs} />
            </div>
            {snap && (
              <div>
                <SubHead icon={Users}>Client snapshot</SubHead>
                <ClientSnapshotView snap={snap} compact />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
