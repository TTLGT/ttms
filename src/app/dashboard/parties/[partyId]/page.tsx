'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getParty, updateParty, tagPartyRole, addPartyOwners, removePartyOwners, requestPartyAccessById } from '@/lib/parties';
import { listOrders } from '@/lib/orders';
import { listUserProfiles } from '@/lib/userProfiles';
import { listWorkGroups } from '@/lib/workGroups';
import { useAuth } from '@/context/AuthContext';
import { partyDisplayName, PARTY_ROLES, ROLE_LABEL, BLANK_ADDRESS } from '@/types/party';
import type { Party, PartyRole } from '@/types/party';
import type { Address, Order } from '@/types/order';
import { orderDisplayNumber } from '@/types/order';
import type { UserProfile } from '@/types/userProfile';
import type { WorkGroup } from '@/types/workGroup';
import StatusBadge from '@/components/orders/StatusBadge';
import NoAccessPanel from '@/components/access/NoAccessPanel';
import CopyLinkButton from '@/components/CopyLinkButton';
import LeadSourceField from '@/components/orders/LeadSourceField';
import { canEditSource } from '@/lib/accessControl';
import { leadSourceLabel, listLeadSources } from '@/lib/leadSources';
import type { LeadSource } from '@/types/leadSource';
import { useDateFormatters } from '@/lib/useDateFormatters';

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY',
];

function AddressFields({ label, value, onChange }: {
  label: string; value: Address; onChange: (a: Address) => void;
}) {
  const set = (k: keyof Address) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    onChange({ ...value, [k]: e.target.value });
  return (
    <div>
      <p className="text-sm font-semibold text-gray-700 mb-3">{label}</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <input placeholder="Street" value={value.street} onChange={set('street')}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
        </div>
        <input placeholder="City" value={value.city} onChange={set('city')}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
        <select value={value.state} onChange={set('state')}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400">
          <option value="">State</option>
          {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <input placeholder="ZIP" value={value.zip} onChange={set('zip')}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
      </div>
    </div>
  );
}

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
  if (order.shipperId === partyId)   roles.push('shipper');
  if (order.consigneeId === partyId) roles.push('consignee');
  return roles;
}

export default function PartyDetailPage() {
  // Dates are written the way the company setting says — see Settings →
  // Operations → Date Format.
  const { formatDate } = useDateFormatters();
  const params  = useParams();
  const partyId = params.partyId as string;
  const { user, profile, isAdmin, isDispatcher } = useAuth();
  // Ownership is admins and dispatchers; everything else on this form is open
  // to anyone who can already see the record.
  const canAssign = isAdmin || isDispatcher;


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

  // Edit form state
  const [companyName, setCompanyName] = useState('');
  const [contactName, setContactName] = useState('');
  const [phone, setPhone]             = useState('');
  const [email, setEmail]             = useState('');
  const [address, setAddress]         = useState<Address>(BLANK_ADDRESS);
  const [defaultOrigin, setOrigin]    = useState<Address>(BLANK_ADDRESS);
  const [defaultDest, setDest]        = useState<Address>(BLANK_ADDRESS);
  const [assignedUids, setAssigned]   = useState<string[]>([]);
  const [assignedGroups, setGroupIds] = useState<string[]>([]);
  const [sourceId, setSourceId]       = useState<string | null>(null);
  const [notes, setNotes]             = useState('');
  const [leadSources, setLeadSources] = useState<LeadSource[]>([]);

  // Narrower than the right to edit the party: dispatch can maintain a client's
  // details without being able to change who gets credited for winning it.
  const canEditThisSource = !!user && !!party && canEditSource(party, user.uid, profile);
  const isClient = (party?.roles ?? []).includes('client');

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
        const [asClient, asShipper, asConsignee] = await Promise.all([
          listOrders({ clientId: partyId }),
          listOrders({ shipperId: partyId }),
          listOrders({ consigneeId: partyId }),
        ]);
        const byId = new Map<string, Order>();
        for (const o of [...asClient, ...asShipper, ...asConsignee]) byId.set(o.id, o);
        setOrders([...byId.values()].sort(
          (a, b) => millis(b.createdAt) - millis(a.createdAt),
        ));
        // Group names are needed for the ownership summary even for non-admins.
        setGroups(await listWorkGroups().catch(() => []));
        if (canAssign) setProfiles(await listUserProfiles());
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
    setEmail(party.email ?? '');
    setAddress(party.address ?? BLANK_ADDRESS);
    setOrigin(party.defaultOrigin ?? BLANK_ADDRESS);
    setDest(party.defaultDest ?? BLANK_ADDRESS);
    setAssigned(party.assignedToUids ?? []);
    setGroupIds(party.assignedToGroupIds ?? []);
    setSourceId(party.sourceId ?? null);
    setNotes(party.notes ?? '');
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
        email,
        address,
        defaultOrigin: hasAny(defaultOrigin) ? defaultOrigin : null,
        defaultDest:   hasAny(defaultDest)   ? defaultDest   : null,
        // Only sent when this user may change it. The rules reject any write to
        // the field from someone who is neither an admin nor an owner, even a
        // write of the identical value, and that would fail the whole save.
        ...(canEditThisSource ? { sourceId } : {}),
        notes,
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
      backHref="/dashboard/clients"
      backLabel="Back to Clients"
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

  return (
    <div className="p-8 max-w-5xl">
      <Link href="/dashboard/clients" className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 mb-4">
        ← Back
      </Link>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{displayName}</h1>
          <div className="flex items-center gap-2 mt-2">
            {roles.length === 0 ? (
              <span className="text-sm text-gray-400">Not yet used on any order</span>
            ) : roles.map((r) => (
              <span key={r} className="px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 text-xs font-semibold">
                {ROLE_LABEL[r]}
              </span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <CopyLinkButton />
          <Link
            href={`/dashboard/orders/new?clientId=${partyId}`}
            className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 transition"
          >
            New order
          </Link>
          {!editing && (
            <button onClick={startEditing}
              className="px-4 py-2 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 transition">
              Edit
            </button>
          )}
        </div>
      </div>

      {error && <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-600 mb-4">{error}</div>}

      {missing.length > 0 && !editing && (
        <div className="mb-6 flex items-center gap-2 text-sm text-gray-500">
          <span>Also list as:</span>
          {missing.map((r) => (
            <button key={r} onClick={() => handleAddRole(r)}
              className="px-2 py-0.5 rounded border border-gray-300 text-xs font-medium hover:bg-gray-50">
              + {ROLE_LABEL[r]}
            </button>
          ))}
        </div>
      )}

      {editing ? (
        <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-5 mb-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Company name</label>
              <input value={companyName} onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Leave blank for an individual"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Contact name</label>
              <input value={contactName} onChange={(e) => setContactName(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
              <p className="text-xs text-gray-400 mt-1">Used as the display name when there is no company.</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
              <input value={phone} onChange={(e) => setPhone(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
              <p className="text-xs text-gray-400 mt-1">Agreements and load confirmations are sent here.</p>
            </div>
          </div>

          <AddressFields label="Address" value={address} onChange={setAddress} />
          <AddressFields label="Default pickup (used when this party is the shipper)" value={defaultOrigin} onChange={setOrigin} />
          <AddressFields label="Default delivery (used when this party is the consignee)" value={defaultDest} onChange={setDest} />

          {canAssign && (
            <div className="space-y-4">
              {profiles.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-gray-700 mb-2">Assigned to people</p>
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
                    More than one person can own the same record.
                  </p>
                </div>
              )}

              <div>
                <p className="text-sm font-semibold text-gray-700 mb-2">Assigned to work groups</p>
                {groups.length === 0 ? (
                  <p className="text-sm text-gray-400">
                    No work groups yet — create them in Settings.
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
                  Everyone in a selected group can see and use this record.
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
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
          </div>

          <div className="flex gap-3">
            <button onClick={handleSave} disabled={saving}
              className="px-4 py-2 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 transition disabled:opacity-50">
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button onClick={() => setEditing(false)}
              className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 transition">
              Cancel
            </button>
          </div>
        </section>
      ) : (
        <section className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <dl className="grid grid-cols-3 gap-y-4 gap-x-6 text-sm">
            <Detail label="Contact"  value={party.contactName} />
            <Detail label="Phone"    value={party.phone} />
            <Detail label="Email"    value={party.email} />
            <Detail label="Address"  value={formatAddress(party.address)} />
            <Detail label="Default pickup"   value={formatAddress(party.defaultOrigin)} />
            <Detail label="Default delivery" value={formatAddress(party.defaultDest)} />
            <Detail label="Owned by"         value={ownerSummary(party, profiles, groups)} />
            {isClient && (
              <Detail label="Lead source" value={leadSourceLabel(leadSources, party.sourceId, party.sourceName)} />
            )}
          </dl>
          {party.notes && (
            <div className="mt-5 pt-5 border-t border-gray-100">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Notes</p>
              <p className="text-sm text-gray-700 whitespace-pre-line">{party.notes}</p>
            </div>
          )}
        </section>
      )}

      <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Orders ({orders.length})</h2>
        </div>
        {orders.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-gray-400">No orders for this party yet.</p>
            <Link href={`/dashboard/orders/new?clientId=${partyId}`}
              className="mt-2 inline-block text-sm text-brand-600 hover:underline">
              Create one →
            </Link>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                {['Order #', 'Role', 'Route', 'Status', 'Pickup', 'Rate', ''].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {orders.map((o) => (
                <tr key={o.id} className="hover:bg-gray-50 transition">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{orderDisplayNumber(o)}</td>
                  <td className="px-4 py-3">
                    <span className="flex gap-1">
                      {rolesOnOrder(o, partyId).map((r) => (
                        <span key={r} className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 text-xs font-medium">
                          {ROLE_LABEL[r]}
                        </span>
                      ))}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {[o.origin?.city, o.destination?.city].filter(Boolean).join(' → ') || '—'}
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={o.status} /></td>
                  <td className="px-4 py-3 text-sm text-gray-600">{formatDate(o.pickupDate)}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{formatCurrency(o.agreedRate)}</td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/dashboard/orders/${o.id}`} className="text-xs text-brand-600 hover:underline font-medium">
                      View →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
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

function hasAny(a: Address): boolean {
  return Boolean(a.street || a.city || a.state || a.zip);
}

function formatAddress(a: Address | null | undefined): string {
  if (!a) return '';
  return [a.street, a.city, a.state, a.zip].filter(Boolean).join(', ');
}
