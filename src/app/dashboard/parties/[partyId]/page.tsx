'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { getParty, updateParty, tagPartyRole, addPartyOwners, removePartyOwners, requestPartyAccessById, listPartyHistory } from '@/lib/parties';
import ChangeHistory from '@/components/history/ChangeHistory';
import PartyAddressesCard from '@/components/parties/PartyAddressesCard';
import PartyContactsCard from '@/components/parties/PartyContactsCard';
import { PartyBillingCard, PartyUpdatesCard } from '@/components/parties/PartyAccountCards';
import ClientSnapshotView, { useClientSnapshot } from '@/components/parties/ClientSnapshotView';
import { listOrders } from '@/lib/orders';
import { listUserProfiles } from '@/lib/userProfiles';
import { listWorkGroups } from '@/lib/workGroups';
import { useAuth } from '@/context/AuthContext';
import { partyDisplayName, PARTY_ROLES, ROLE_LABEL, BLANK_ADDRESS } from '@/types/party';
import type { Party, PartyRole } from '@/types/party';
import { displayStatus } from '@/types/order';
import type { Address, Order, OrderStatus } from '@/types/order';
import ExtraStopsNote from '@/components/orders/ExtraStopsNote';
import type { UserProfile } from '@/types/userProfile';
import type { WorkGroup } from '@/types/workGroup';
import StatusBadge from '@/components/orders/StatusBadge';
import OrderLink from '@/components/orders/OrderLink';
import NoAccessPanel from '@/components/access/NoAccessPanel';
import CopyLinkButton from '@/components/CopyLinkButton';
import PhoneValue from '@/components/PhoneValue';
import PhoneField from '@/components/PhoneField';
import type { PhoneRegion } from '@/lib/phone';
import LeadSourceField from '@/components/orders/LeadSourceField';
import { canEditSource } from '@/lib/accessControl';
import { leadSourceLabel, listLeadSources } from '@/lib/leadSources';
import type { LeadSource } from '@/types/leadSource';
import { useDateFormatters } from '@/lib/useDateFormatters';
import { Bi } from '@/components/spanish/Es';
import { BarChart3, Building2, Contact, History, Package, PencilLine, StickyNote, UsersRound, Warehouse } from 'lucide-react';
import OrderSection from '@/components/orders/OrderSection';
import OrderSidePanel, { RailItem } from '@/components/orders/OrderSidePanel';
import RecordHero, { AttentionCard, EditBar, HeroBadge, RailCard, RecordColumns } from '@/components/records/RecordHero';
import type { Attention } from '@/components/records/RecordHero';
// The order form's own address block, so a party's main address can be abroad too.
import AddressFields from '@/components/orders/AddressFields';
import { withCountry } from '@/types/addressCountry';
import { UserAvatar } from '@/components/settings/UserAvatar';
import WebLinksField from '@/components/WebLinksField';
import WebLinksList from '@/components/WebLinksList';
import { cleanWebLinks, webLinksOf, type WebLink } from '@/types/webLinks';

/** A load counted as "on the road or booked" in the header: after the quote, before delivery. */
const ACTIVE_STEPS: OrderStatus[] = ['booked', 'shipper_signed', 'carrier_signed', 'in_transit'];

function formatCurrency(n: number | undefined): string {
  if (!n) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

/** Which role this party played on a given order — it may be more than one. */
/** Firestore Timestamps sort by their epoch millis; anything missing sorts last. */
function millis(value: unknown): number {
  const ts = value as { toMillis?: () => number } | null | undefined;
  return typeof ts?.toMillis === 'function' ? ts.toMillis() : 0;
}

function rolesOnOrder(order: Order, partyId: string): PartyRole[] {
  const roles: PartyRole[] = [];
  if (order.clientId === partyId)    roles.push('client');
  // A shipper or consignee at an extra stop played the same role as the first.
  const atStop = (stops: Order['extraPickups']) => (stops ?? []).some((s) => s.partyId === partyId);
  if (order.shipperId === partyId || atStop(order.extraPickups))       roles.push('shipper');
  if (order.consigneeId === partyId || atStop(order.extraDeliveries))  roles.push('consignee');
  return roles;
}

export default function PartyDetailPage() {
  // Dates are written the way the company setting says — see Settings →
  // Operations → Date Format.
  const { formatDate } = useDateFormatters();
  const params  = useParams();
  const partyId = params.partyId as string;
  const { user, profile, can } = useAuth();
  // Where "Back" goes. Somebody who opened this from a load's client, shipper
  // or consignee wants that load again, not the clients list — set by
  // PartyLink on the order page. Same idea as `from` on the order page.
  const searchParams = useSearchParams();
  const fromOrder = searchParams.get('fromOrder');
  const fromList  = searchParams.get('from') as PartyRole | null;
  // Ownership is admins and dispatchers; everything else on this form is open
  // to anyone who can already see the record.
  // Admins and dispatchers hold this by role; anybody else has to be given it
  // deliberately. The route enforces the same permission — see
  // /api/parties/[partyId]/owners.
  const canAssign = can('ownership.change');


  const [party, setParty]     = useState<Party | null>(null);
  const [orders, setOrders]   = useState<Order[]>([]);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [groups, setGroups]     = useState<WorkGroup[]>([]);
  const [loading, setLoading] = useState(true);
  // Why the record could not be opened. A denied read used to arrive as a bare
  // permission error and get rendered as "Party not found", which named nobody.
  const [noAccess, setNoAccess] = useState<{ status: 'missing' | 'denied'; ownerName: string } | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');
  // The change log, opened from the rail in a side panel.
  const [historyOpen, setHistoryOpen] = useState(false);

  // Edit form state
  const [companyName, setCompanyName] = useState('');
  const [contactName, setContactName] = useState('');
  const [phone, setPhone]             = useState('');
  const [phoneRegion, setPhoneRegion] = useState<PhoneRegion | undefined>(undefined);
  const [email, setEmail]             = useState('');
  const [phone2, setPhone2]           = useState('');
  const [phone2Region, setPhone2Region] = useState<PhoneRegion | undefined>(undefined);
  const [email2, setEmail2]           = useState('');
  const [address, setAddress]         = useState<Address>(BLANK_ADDRESS);
  const [assignedUids, setAssigned]   = useState<string[]>([]);
  const [assignedGroups, setGroupIds] = useState<string[]>([]);
  const [sourceId, setSourceId]       = useState<string | null>(null);
  const [notes, setNotes]             = useState('');
  const [webLinks, setWebLinks]       = useState<WebLink[]>([]);
  const [leadSources, setLeadSources] = useState<LeadSource[]>([]);

  // Narrower than the right to edit the party: dispatch can maintain a client's
  // details without being able to change who gets credited for winning it.
  const canEditThisSource = !!user && !!party && canEditSource(party, user.uid, profile);
  const isClient = (party?.roles ?? []).includes('client');
  // Asked for only once the record has opened as a client — a shipper has no
  // client history, and a denied record has nothing to ask about.
  const snapshot = useClientSnapshot(party && isClient ? partyId : null);

  useEffect(() => {
    (async () => {
      try {
        const access = await getParty(partyId);
        if (access.status !== 'ok') {
          setNoAccess({
            status:    access.status,
            ownerName: access.status === 'denied' ? access.ownerName : '',
          });
          return;
        }
        const p = access.party;
        setParty(p);
        setLeadSources(await listLeadSources().catch(() => []));
        // Three queries rather than one scan of every order in the company.
        // A party can have played any of the three roles on a given load and
        // the role lives on the order, so each is asked for separately and the
        // results merged — a party that was both shipper and consignee on the
        // same order would otherwise appear twice.
        const [asClient, asShipper, asConsignee, atStop] = await Promise.all([
          listOrders({ clientId: partyId }),
          listOrders({ shipperId: partyId }),
          listOrders({ consigneeId: partyId }),
          // A second or later pickup or delivery. Allowed to fail on its own:
          // this one needs a composite index of its own (stopPartyIds +
          // createdAt), and until that is built the rest of the page should
          // still list the loads it always did.
          listOrders({ stopPartyId: partyId }).catch(() => [] as Order[]),
        ]);
        const byId = new Map<string, Order>();
        for (const o of [...asClient, ...asShipper, ...asConsignee, ...atStop]) byId.set(o.id, o);
        setOrders([...byId.values()].sort(
          (a, b) => millis(b.createdAt) - millis(a.createdAt),
        ));
        // Group and people names are needed for the owners card for everybody,
        // not only for the people who may change them: before the rail, a
        // broker saw an owner as a bare uid. One read of the staff list —
        // users/{uid} is open to every signed-in account.
        const [gs, ps] = await Promise.all([
          listWorkGroups().catch(() => [] as WorkGroup[]),
          listUserProfiles().catch(() => [] as UserProfile[]),
        ]);
        setGroups(gs);
        setProfiles(ps);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        setLoading(false);
      }
    })();
  }, [partyId, canAssign]);

  function startEditing() {
    if (!party) return;
    setCompanyName(party.companyName ?? '');
    setContactName(party.contactName ?? '');
    setPhone(party.phone ?? '');
    setPhoneRegion(party.phoneRegion);
    setEmail(party.email ?? '');
    setPhone2(party.phone2 ?? '');
    setPhone2Region(party.phone2Region);
    setEmail2(party.email2 ?? '');
    setAddress(party.address ?? BLANK_ADDRESS);
    setAssigned(party.assignedToUids ?? []);
    setGroupIds(party.assignedToGroupIds ?? []);
    setSourceId(party.sourceId ?? null);
    setNotes(party.notes ?? '');
    setWebLinks(webLinksOf(party));
    setEditing(true);
  }

  /**
   * Sends only what changed. Returns the fields to fold back into local state,
   * or nothing when the caller cannot assign owners or nothing moved.
   */
  async function saveOwnerChanges(): Promise<Partial<Party>> {
    if (!canAssign || !party) return {};

    const wasUids   = party.assignedToUids ?? [];
    const wasGroups = party.assignedToGroupIds ?? [];

    const added = {
      uids:     assignedUids.filter((u) => !wasUids.includes(u)),
      groupIds: assignedGroups.filter((g) => !wasGroups.includes(g)),
    };
    const removed = {
      uids:     wasUids.filter((u) => !assignedUids.includes(u)),
      groupIds: wasGroups.filter((g) => !assignedGroups.includes(g)),
    };

    if (added.uids.length || added.groupIds.length)     await addPartyOwners(partyId, added);
    if (removed.uids.length || removed.groupIds.length) await removePartyOwners(partyId, removed);
    if (!added.uids.length && !added.groupIds.length
      && !removed.uids.length && !removed.groupIds.length) return {};

    return {
      assignedToUids:     assignedUids,
      assignedToGroupIds: assignedGroups,
      // The server clears the BATS text once a real owner lands, since the two
      // are alternative answers to the same question.
      assignedToName:     assignedUids.length || assignedGroups.length ? '' : party.assignedToName,
    };
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const patch = {
        companyName,
        contactName,
        phone,
        // Sent with the number so updateParty re-keys against the right
        // country — the same digits filed as Guatemalan are different keys.
        phoneRegion,
        email,
        // Sent even when unchanged so updateParty rebuilds phoneKeys off the
        // pair. A number edited without its key rewritten leaves the record
        // findable only under the number it used to have.
        phone2,
        phone2Region,
        email2,
        address,
        // Only sent when this user may change it. The rules reject any write to
        // the field from someone who is neither an admin nor an owner, even a
        // write of the identical value, and that would fail the whole save.
        ...(canEditThisSource ? { sourceId } : {}),
        notes,
        // Cleaned here as well as on the server so the page shows what was
        // stored, not a row the server dropped.
        webLinks: cleanWebLinks(webLinks),
      };
      await updateParty(partyId, patch);

      // Ownership travels its own road: /api/parties/{id}/owners, which is
      // limited to admins and dispatchers, records who changed what, and
      // pushes the new owners out to every order of this client. It is sent as
      // a diff rather than a replacement so the history reads as the additions
      // and removals that actually happened.
      const ownerPatch = await saveOwnerChanges();

      setParty((prev) => (prev ? { ...prev, ...patch, ...ownerPatch } : prev));
      setEditing(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  /** Lets a party be listed under a role before it has been used in one. */
  async function handleAddRole(role: PartyRole) {
    await tagPartyRole(partyId, role);
    setParty((prev) => (prev ? { ...prev, roles: [...(prev.roles ?? []), role] } : prev));
  }

  // Otherwise back to the list it was opened from (PartyListPage tags its
  // links), and failing that — a copied link — the list for its own role, so a
  // shipper does not send somebody to Clients.
  const listRole: PartyRole =
    fromList && PARTY_ROLES.includes(fromList) ? fromList
    : party?.roles?.includes('client') || !party?.roles?.length ? 'client'
    : party.roles[0];
  const listPath: Record<PartyRole, string> = {
    client: '/dashboard/clients', shipper: '/dashboard/shippers', consignee: '/dashboard/consignees',
  };
  const back = fromOrder
    ? { href: `/dashboard/orders/${encodeURIComponent(fromOrder)}`, label: 'Back to order' }
    : { href: listPath[listRole], label: `Back to ${ROLE_LABEL[listRole]}s` };

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!party) return (
    <NoAccessPanel
      kind="client"
      status={noAccess?.status ?? 'missing'}
      ownerName={noAccess?.ownerName}
      backHref={back.href}
      backLabel={back.label}
      grantNote="If approved, you will be able to open this client and use it on one order. An admin or dispatcher can instead hand it over for good, along with its orders."
      // Only offered on a denial: there is nobody to ask about a record that
      // has been deleted.
      onRequest={
        noAccess?.status === 'denied'
          ? async (reason) => { await requestPartyAccessById(partyId, reason); }
          : undefined
      }
    />
  );

  const roles      = party.roles ?? [];
  const missing    = PARTY_ROLES.filter((r) => !roles.includes(r));
  const displayName = partyDisplayName(party);

  // The hero's numbers, off the loads already read for the Orders section.
  // Only loads this person can see, which the label says.
  const live = orders.filter((o) => o.status !== 'cancelled');
  const activeLoads = live.filter((o) => ACTIVE_STEPS.includes(displayStatus(o.status))).length;
  const asClient = live.filter((o) => o.clientId === partyId);
  const billed = asClient.reduce((sum, o) => sum + (o.agreedRate || 0), 0);
  const lastPickup = live.reduce<number>((max, o) => Math.max(max, millis(o.pickupDate)), 0);
  const countAs = (r: PartyRole) => live.filter((o) => rolesOnOrder(o, partyId).includes(r)).length;

  const owners = ownerList(party, profiles, groups);
  const unowned = !owners.length
    && !(party.assignedToEmails ?? []).length
    && !(party.assignedToName ?? '').trim();
  const cityLine = [party.address?.city, party.address?.state].filter(Boolean).join(', ');

  // What is missing, worst first — see AttentionCard. Each opens the editor
  // where the gap is filled.
  const attention: Attention[] = [];
  if (!party.email && !party.email2) {
    attention.push(isClient
      ? { id: 'email', level: 'warn', title: 'No email on file', sub: 'Agreements and load confirmations are sent to it.', onClick: startEditing }
      : { id: 'email', level: 'info', title: 'No email on file', onClick: startEditing });
  }
  if (!party.phone && !party.phone2) {
    attention.push({ id: 'phone', level: 'info', title: 'No phone on file', onClick: startEditing });
  }
  if (!party.address?.city && !party.address?.street) {
    attention.push({
      id: 'addr',
      level: roles.includes('shipper') || roles.includes('consignee') ? 'warn' : 'info',
      title: 'No main address',
      sub: roles.includes('shipper') || roles.includes('consignee') ? 'Pickups and deliveries here fill in from it.' : undefined,
      onClick: startEditing,
    });
  }
  if (isClient && !party.sourceId && !(party.sourceName ?? '').trim()) {
    attention.push({ id: 'source', level: 'info', title: 'No lead source', sub: 'How this client came to us, for attribution.', onClick: canEditThisSource ? startEditing : undefined });
  }
  if (unowned) {
    attention.push({ id: 'owner', level: 'info', title: 'Nobody owns this record', sub: 'Every broker can see and use it.', onClick: canAssign ? startEditing : undefined });
  } else if (!owners.length && (party.assignedToName ?? '').trim()) {
    attention.push({ id: 'owner', level: 'info', title: `Owned by ${party.assignedToName} in BATS`, sub: 'They have no TTMS account, so nobody owns it here yet.', onClick: canAssign ? startEditing : undefined });
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl">
      <Link href={back.href} className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 mb-4">
        ← {fromOrder ? 'Back to order' : 'Back'}
      </Link>

      <RecordHero
        icon={isClient ? Building2 : Warehouse}
        iconTone="bg-brand-50 text-brand-600"
        band="from-brand-500 via-blue-500 to-emerald-500"
        title={displayName}
        badges={roles.length === 0
          ? <span data-es className="text-sm text-gray-400">Not yet used on any order</span>
          : roles.map((r) => <HeroBadge key={r} tone="brand">{ROLE_LABEL[r]}</HeroBadge>)}
        sub={<>
          {[party.companyName ? party.contactName : '', cityLine].filter(Boolean).join(' · ')}
          {missing.length > 0 && !editing && (
            <span className="mt-1.5 flex flex-wrap items-center gap-2">
              <span data-es>Also list as:</span>
              {missing.map((r) => (
                <button key={r} onClick={() => handleAddRole(r)}
                  className="px-2 py-0.5 rounded border border-gray-300 text-xs font-medium hover:bg-gray-50">
                  + {ROLE_LABEL[r]}
                </button>
              ))}
            </span>
          )}
        </>}
        actions={<>
          <CopyLinkButton />
          <Link data-es
            href={`/dashboard/orders/new?clientId=${partyId}`}
            className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 transition"
          >
            New order
          </Link>
          {!editing && (
            <button data-es onClick={startEditing}
              className="px-4 py-2 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 transition">
              Edit
            </button>
          )}
        </>}
        stats={isClient ? [
          { label: 'Loads', value: live.length.toLocaleString(), note: <Bi>that you can see</Bi> },
          { label: 'On the road or booked', value: activeLoads.toLocaleString() },
          { label: 'Billed as client', value: billed ? formatCurrency(billed) : '—', emphasis: true, note: `${asClient.length.toLocaleString()} load${asClient.length === 1 ? '' : 's'}` },
          { label: 'Last pickup', value: lastPickup ? formatDate(new Date(lastPickup)) : '—' },
        ] : [
          { label: 'Loads', value: live.length.toLocaleString(), note: <Bi>that you can see</Bi> },
          { label: 'As shipper', value: countAs('shipper').toLocaleString() },
          { label: 'As consignee', value: countAs('consignee').toLocaleString() },
          { label: 'Last pickup', value: lastPickup ? formatDate(new Date(lastPickup)) : '—' },
        ]}
      />

      {error && <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-600 mt-4">{error}</div>}

      <RecordColumns rail={<>
        <AttentionCard items={attention} allClear="Nothing missing. Contacts, address and owner are on file." />

        <RailCard title="Owned by" action={canAssign && !editing ? (
          <button type="button" onClick={startEditing} data-es="Change" className="text-xs font-medium text-brand-600 hover:underline">Change</button>
        ) : undefined}>
          {owners.length ? (
            <ul className="space-y-2">
              {owners.map((o) => (
                <li key={o.key} className="flex items-center gap-2 text-sm text-gray-800">
                  {o.kind === 'person' ? (
                    <UserAvatar photoPath={o.photoPath} fallback={o.name.charAt(0).toUpperCase() || '?'} size={28} expandable name={o.name} />
                  ) : (
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-gray-500"><UsersRound className="h-4 w-4" aria-hidden /></span>
                  )}
                  <span className="min-w-0 flex-1 truncate">{o.name}</span>
                  {o.kind === 'group' && <span data-es className="text-[11px] text-gray-500">work group</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-500">{ownerSummary(party, profiles, groups)}</p>
          )}
          {isClient && (
            <p className="mt-3 border-t border-gray-100 pt-3 text-xs text-gray-500">
              <span data-es>Lead source</span>: <span className="text-gray-800">{leadSourceLabel(leadSources, party.sourceId, party.sourceName) || '—'}</span>
            </p>
          )}
        </RailCard>

        <RailCard title="Quick contact">
          <div className="space-y-1.5 text-sm text-gray-800">
            {party.contactName && <p className="font-medium">{party.contactName}</p>}
            <PhoneValue value={party.phone} region={party.phoneRegion} />
            {party.phone2 && <PhoneValue value={party.phone2} region={party.phone2Region} label="secondary phone" />}
            {[party.email, party.email2].filter(Boolean).map((e) => (
              <a key={e} href={`mailto:${e}`} className="block truncate text-brand-700 hover:underline">{e}</a>
            ))}
            <WebLinksList links={webLinksOf(party)} compact empty={null} />
          </div>
        </RailCard>

        <RailItem title="Change log" sub={<span data-es>Every change to this record, who made it and when</span>} icon={History} tone="gray"
          onOpen={() => setHistoryOpen(true)} />
      </>}>
        {editing ? (
          <OrderSection id="details" icon={PencilLine} tone="brand" title="Edit details">
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label data-es className="block text-xs font-medium text-gray-600 mb-1">Company name</label>
                  <input value={companyName} onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="Leave blank for an individual"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
                </div>
                <div>
                  <label data-es className="block text-xs font-medium text-gray-600 mb-1">Contact name</label>
                  <input value={contactName} onChange={(e) => setContactName(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
                  <p className="text-xs text-gray-400 mt-1"><Bi>Used as the display name when there is no company.</Bi></p>
                </div>
                <PhoneField
                  label="Phone"
                  value={phone}
                  region={phoneRegion}
                  onChange={(v, r) => { setPhone(v); setPhoneRegion(r); }}
                />
                <div>
                  <label data-es className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
                  <p data-es className="text-xs text-gray-400 mt-1">Agreements and load confirmations are sent here.</p>
                </div>
                <PhoneField
                  label="Secondary phone"
                  value={phone2}
                  region={phone2Region}
                  onChange={(v, r) => { setPhone2(v); setPhone2Region(r); }}
                  hint="Searchable the same way the main number is."
                />
                <div>
                  <label data-es className="block text-xs font-medium text-gray-600 mb-1">Secondary email</label>
                  <input type="email" value={email2} onChange={(e) => setEmail2(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
                </div>
              </div>

              <WebLinksField value={webLinks} onChange={setWebLinks} />

              <AddressFields label="Main address" value={address} onChange={setAddress} />
              <p className="text-xs text-gray-500 -mt-2">
                <Bi>Other pickup and delivery addresses are in the Addresses card below.</Bi>
              </p>

              {canAssign && (
                <div className="space-y-4">
                  {profiles.length > 0 && (
                    <div>
                      <p data-es className="text-sm font-semibold text-gray-700 mb-2">Assigned to people</p>
                      <div className="flex flex-wrap gap-3">
                        {profiles.map((p) => (
                          <label key={p.uid} className="flex items-center gap-2 text-sm text-gray-700">
                            <input
                              type="checkbox"
                              checked={assignedUids.includes(p.uid)}
                              onChange={(e) => setAssigned((prev) =>
                                e.target.checked ? [...prev, p.uid] : prev.filter((u) => u !== p.uid)
                              )}
                            />
                            {p.displayName || p.email}
                          </label>
                        ))}
                      </div>
                      <p className="text-xs text-gray-400 mt-1">
                        <Bi>More than one person can own the same record.</Bi>
                      </p>
                    </div>
                  )}

                  <div>
                    <p data-es className="text-sm font-semibold text-gray-700 mb-2">Assigned to work groups</p>
                    {groups.length === 0 ? (
                      <p className="text-sm text-gray-400">
                        <Bi>No work groups yet — create them in Settings.</Bi>
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-3">
                        {groups.map((g) => (
                          <label key={g.id} className="flex items-center gap-2 text-sm text-gray-700">
                            <input
                              type="checkbox"
                              checked={assignedGroups.includes(g.id)}
                              onChange={(e) => setGroupIds((prev) =>
                                e.target.checked ? [...prev, g.id] : prev.filter((x) => x !== g.id)
                              )}
                            />
                            {g.name}
                          </label>
                        ))}
                      </div>
                    )}
                    <p className="text-xs text-gray-400 mt-1">
                      <Bi>Everyone in a selected group can see and use this record.</Bi>
                    </p>
                  </div>
                </div>
              )}

              {/* A lead source only means anything on a client. A shipper or
                  consignee is a facility on somebody's route, not a lead. */}
              {isClient && (
                <LeadSourceField
                  value={sourceId}
                  onChange={setSourceId}
                  canEdit={canEditThisSource}
                  fallbackName={party.sourceName ?? ''}
                  hint="How this client came to us. Used for attribution reporting."
                />
              )}

              <div>
                <label data-es className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
              </div>
            </div>
          </OrderSection>
        ) : (
          <>
            <OrderSection id="details" icon={Contact} tone="blue" title="Contact">
              <dl className="grid grid-cols-1 sm:grid-cols-3 gap-y-4 gap-x-6 text-sm">
                <Detail label="Contact"  value={party.contactName} />
                <Detail label="Phone"    value={<PhoneValue value={party.phone} region={party.phoneRegion} />} />
                <Detail label="Email"    value={party.email} />
                <Detail label="Secondary phone" value={<PhoneValue value={party.phone2} region={party.phone2Region} label="secondary phone" />} />
                <Detail label="Secondary email" value={party.email2} />
                <Detail label="Main address"  value={formatAddress(party.address)} />
                <Detail label="Website and social media" value={<WebLinksList links={webLinksOf(party)} />} />
              </dl>
            </OrderSection>

            {party.notes && (
              <OrderSection id="notes" icon={StickyNote} tone="gray" title="Notes">
                <p className="text-sm text-gray-700 whitespace-pre-line">{party.notes}</p>
              </OrderSection>
            )}
          </>
        )}

        {editing && <EditBar saving={saving} onSave={handleSave} onCancel={() => setEditing(false)} label="Save" />}

        {/* The 2026-11-11 client cards. Each saves on its own through the
            ordinary party save, so the big Edit form above is untouched.
            Contacts are on every party; the rest only mean something on a
            client. */}
        {isClient && snapshot && (
          <OrderSection id="snapshot" icon={BarChart3} tone="violet" title="Client snapshot">
            <ClientSnapshotView snap={snapshot} />
          </OrderSection>
        )}
        <PartyContactsCard party={party} canEdit={!editing}
          onChange={(contacts) => setParty((prev) => (prev ? { ...prev, contacts } : prev))} />
        {isClient && (
          <>
            <PartyBillingCard party={party} canEdit={!editing}
              onChange={(patch) => setParty((prev) => (prev ? { ...prev, ...patch } : prev))} />
            <PartyUpdatesCard party={party} canEdit={!editing}
              onChange={(patch) => setParty((prev) => (prev ? { ...prev, ...patch } : prev))} />
          </>
        )}

        {/* Shown to whoever can open the record. Edit and remove are refused by
            the server for somebody using it under an approval, the same as
            the Edit button above; adding is not — see the addresses route. */}
        <div id="addresses" className="scroll-mt-4">
          <PartyAddressesCard party={party} canEdit
            onChange={(addresses) => setParty((prev) => (prev ? { ...prev, addresses, defaultOrigin: null, defaultDest: null } : prev))} />
        </div>

        <OrderSection id="orders" icon={Package} tone="violet" title={`Orders (${orders.length})`}>
          {orders.length === 0 ? (
            <div className="text-center py-6">
              <p data-es className="text-sm text-gray-400">No orders for this party yet.</p>
              <Link data-es href={`/dashboard/orders/new?clientId=${partyId}`}
                className="mt-2 inline-block text-sm text-brand-600 hover:underline">
                Create one →
              </Link>
            </div>
          ) : (
            <div className="-mx-5 sm:-mx-6 overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100">
                <thead className="bg-gray-50">
                  <tr>
                    {['Order #', 'Role', 'Route', 'Status', 'Pickup', 'Rate', ''].map((h) => (
                      <th key={h} data-es className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide first:pl-5 sm:first:pl-6">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {orders.map((o) => (
                    <tr key={o.id} className="hover:bg-gray-50 transition">
                      <td className="px-4 py-3 pl-5 sm:pl-6 text-sm"><OrderLink order={o} /></td>
                      <td className="px-4 py-3">
                        <span className="flex gap-1">
                          {rolesOnOrder(o, partyId).map((r) => (
                            <span key={r} data-es className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 text-xs font-medium">
                              {ROLE_LABEL[r]}
                            </span>
                          ))}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                        {[formatRouteEnd(o.origin), formatRouteEnd(o.destination)].filter(Boolean).join(' → ') || '—'}
                        <ExtraStopsNote order={o} />
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={o.status} /></td>
                      <td className="px-4 py-3 text-sm text-gray-600">{formatDate(o.pickupDate)}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{formatCurrency(o.agreedRate)}</td>
                      <td className="px-4 py-3 text-right">
                        <Link data-es href={`/dashboard/orders/${o.id}`} className="text-xs text-brand-600 hover:underline font-medium">
                          View →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </OrderSection>
      </RecordColumns>

      {/* Read only when opened — see ChangeHistory. Mounted only while open. */}
      <OrderSidePanel open={historyOpen} onClose={() => setHistoryOpen(false)} title="Change log" icon={History}>
        {historyOpen && <ChangeHistory load={() => listPartyHistory(partyId)} refreshKey={party} startOpen />}
      </OrderSidePanel>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</dt>
      <dd className="text-sm text-gray-800 mt-0.5">{value || '—'}</dd>
    </div>
  );
}

/**
 * Who this record belongs to, in plain language. An unowned record is shared,
 * so saying so explicitly beats showing an empty dash.
 */
function ownerSummary(
  party: Party,
  profiles: UserProfile[],
  groups: WorkGroup[],
): string {
  const people = (party.assignedToUids ?? []).map((uid) => {
    const p = profiles.find((x) => x.uid === uid);
    return p ? (p.displayName || p.email) : uid;
  });
  const teams = (party.assignedToGroupIds ?? []).map((id) => {
    const g = groups.find((x) => x.id === id);
    return g ? g.name : id;
  });

  const parts = [...people, ...teams];
  if (parts.length) return parts.join(', ');
  if ((party.assignedToName ?? '').trim()) {
    return `${party.assignedToName} (no TMS account yet)`;
  }
  return 'Nobody — visible to everyone';
}

interface OwnerRow {
  key: string;
  kind: 'person' | 'group';
  name: string;
  photoPath?: string | null;
}

/**
 * The owners as rows for the rail: people (with their picture), work groups,
 * and anybody invited but not yet signed in, held under their email.
 */
function ownerList(party: Party, profiles: UserProfile[], groups: WorkGroup[]): OwnerRow[] {
  const people: OwnerRow[] = (party.assignedToUids ?? []).map((uid) => {
    const p = profiles.find((x) => x.uid === uid);
    return { key: `u:${uid}`, kind: 'person', name: p ? (p.displayName || p.email) : 'Unknown person', photoPath: p?.photoPath };
  });
  const pending: OwnerRow[] = (party.assignedToEmails ?? []).map((email) => (
    { key: `e:${email}`, kind: 'person', name: `${email} (invited)` }
  ));
  const teams: OwnerRow[] = (party.assignedToGroupIds ?? []).map((id) => {
    const g = groups.find((x) => x.id === id);
    return { key: `g:${id}`, kind: 'group', name: g ? g.name : 'Unknown group' };
  });
  return [...people, ...pending, ...teams];
}

function formatAddress(a: Address | null | undefined): string {
  if (!a) return '';
  return withCountry([a.street, a.city, a.state, a.zip].filter(Boolean).join(', '), a);
}

// One end of a lane as "Camarillo, CA 93010" — the street is left off
// because the route column has to fit two of these on one line.
function formatRouteEnd(a: Address | null | undefined): string {
  if (!a) return '';
  const stateZip = [a.state, a.zip].map((v) => (v ?? '').trim()).filter(Boolean).join(' ');
  return [(a.city ?? '').trim(), stateZip].filter(Boolean).join(', ');
}
