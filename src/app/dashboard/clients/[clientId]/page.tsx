'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getClient, updateClient } from '@/lib/clients';
import { listUserProfiles } from '@/lib/userProfiles';
import { useAuth } from '@/context/AuthContext';
import type { Client } from '@/types/client';
import type { UserProfile } from '@/types/userProfile';

function formatDate(ts: { toDate?: () => Date } | null | undefined): string {
  if (!ts || typeof ts.toDate !== 'function') return '—';
  return ts.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400';

export default function ClientDetailPage() {
  const params   = useParams();
  const clientId = params.clientId as string;
  const { isAdmin } = useAuth();

  const [client, setClient]         = useState<Client | null>(null);
  const [loading, setLoading]       = useState(true);
  const [editing, setEditing]       = useState(false);
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState('');
  const [allUsers, setAllUsers]     = useState<UserProfile[]>([]);
  const [assignedUids, setAssignedUids] = useState<string[]>([]);

  const [name, setName]           = useState('');
  const [company, setCompany]     = useState('');
  const [phone, setPhone]         = useState('');
  const [phone2, setPhone2]       = useState('');
  const [email, setEmail]         = useState('');
  const [address, setAddress]     = useState('');
  const [address2, setAddress2]   = useState('');
  const [city, setCity]           = useState('');
  const [state, setState]         = useState('');
  const [zip, setZip]             = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [notes, setNotes]         = useState('');

  function syncFields(c: Client) {
    setName(c.name ?? '');
    setCompany(c.company ?? '');
    setPhone(c.phone ?? '');
    setPhone2(c.phone2 ?? '');
    setEmail(c.email ?? '');
    setAddress(c.address ?? '');
    setAddress2(c.address2 ?? '');
    setCity(c.city ?? '');
    setState(c.state ?? '');
    setZip(c.zip ?? '');
    setAssignedTo(c.assignedTo ?? '');
    setAssignedUids(c.assignedToUids ?? []);
    setNotes(c.notes ?? '');
  }

  useEffect(() => {
    getClient(clientId)
      .then((c) => {
        setClient(c);
        if (c) syncFields(c);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
    if (isAdmin) {
      listUserProfiles().then(setAllUsers).catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, isAdmin]);

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const updates: Partial<Omit<Client, 'id' | 'createdAt'>> = {
        name: name.trim(),
        company: company.trim(),
        phone: phone.trim(),
        phone2: phone2.trim(),
        email: email.trim(),
        address: address.trim(),
        address2: address2.trim(),
        city: city.trim(),
        state: state.trim(),
        zip: zip.trim(),
        assignedTo: assignedTo.trim(),
        assignedToUids: assignedUids,
        notes: notes.trim(),
      };
      await updateClient(clientId, updates);
      setClient((prev) => prev ? { ...prev, ...updates } as Client : prev);
      setEditing(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!client) return (
    <div className="p-8">
      <p className="text-gray-500">Client not found.</p>
      <Link href="/dashboard/clients" className="text-sm text-brand-600 hover:underline mt-2 block">← Back to Clients</Link>
    </div>
  );

  return (
    <div className="p-8 max-w-3xl">
      <Link href="/dashboard/clients" className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 mb-4">
        ← Clients
      </Link>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{client.name}</h1>
          {client.company && (
            <p className="text-sm text-gray-500 mt-0.5">{client.company}</p>
          )}
          <div className="flex items-center gap-2 mt-1">
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
              client.status === 'Active' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
            }`}>
              {client.status || 'New'}
            </span>
            {client.batsId && (
              <span className="text-xs text-gray-400 font-mono">BATS #{client.batsId}</span>
            )}
          </div>
        </div>
        {!editing ? (
          <button onClick={() => setEditing(true)}
            className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition">
            Edit
          </button>
        ) : (
          <div className="flex gap-2">
            <button onClick={() => { if (client) { syncFields(client); } setEditing(false); }}
              className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition">
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving}
              className="px-4 py-2 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 disabled:opacity-50 transition">
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        )}
      </div>

      {error && <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-600 mb-4">{error}</div>}

      <div className="space-y-4">
        {/* Contact Info */}
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Contact Info</h3>
          {!editing ? (
            <div className="grid grid-cols-2 gap-6">
              {[
                ['Name', client.name],
                ['Company', client.company],
                ['Phone', client.phone],
                ['Alt Phone', client.phone2],
                ['Email', client.email],
                ['Fax', client.fax],
              ].map(([label, val]) => (
                <div key={label as string}>
                  <p className="text-xs text-gray-500 mb-0.5">{label}</p>
                  <p className="text-sm text-gray-900">{val || '—'}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Company</label>
                <input value={company} onChange={(e) => setCompany(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
                <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Alt Phone</label>
                <input type="tel" value={phone2} onChange={(e) => setPhone2(e.target.value)} className={inputCls} />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
              </div>
            </div>
          )}
        </section>

        {/* Address */}
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Address</h3>
          {!editing ? (
            <div className="text-sm text-gray-900 space-y-0.5">
              {client.address && <p>{client.address}</p>}
              {client.address2 && <p>{client.address2}</p>}
              {(client.city || client.state || client.zip) && (
                <p>{[client.city, client.state].filter(Boolean).join(', ')}{client.zip ? ` ${client.zip}` : ''}</p>
              )}
              {client.country && client.country !== 'US' && <p>{client.country}</p>}
              {!client.address && !client.city && <p className="text-gray-400">No address on file</p>}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Street</label>
                <input value={address} onChange={(e) => setAddress(e.target.value)} className={inputCls} />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Suite / Unit</label>
                <input value={address2} onChange={(e) => setAddress2(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">City</label>
                <input value={city} onChange={(e) => setCity(e.target.value)} className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">State</label>
                  <input value={state} onChange={(e) => setState(e.target.value)} maxLength={2} className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Zip</label>
                  <input value={zip} onChange={(e) => setZip(e.target.value)} className={inputCls} />
                </div>
              </div>
            </div>
          )}
        </section>

        {/* CRM Info */}
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">CRM Info</h3>
          <div className="grid grid-cols-3 gap-6">
            {[
              ['Assigned To', editing ? null : (client.assignedTo || '—')],
              ['Lead Source', client.leadSourceName || '—'],
              ['Client Since', formatDate(client.batsCreatedAt)],
              ['Type', client.type || '—'],
            ].map(([label, val]) => (
              label === 'Assigned To' && editing ? (
                <div key="assigned">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Assigned To</label>
                  <input value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} className={inputCls} />
                </div>
              ) : (
                <div key={label as string}>
                  <p className="text-xs text-gray-500 mb-0.5">{label}</p>
                  <p className="text-sm text-gray-900">{val as string}</p>
                </div>
              )
            ))}
          </div>

          {isAdmin && (
            <div className="mt-6 pt-5 border-t border-gray-100">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">User Access</p>
              {!editing ? (
                <div className="flex flex-wrap gap-2">
                  {(client.assignedToUids ?? []).length === 0 ? (
                    <p className="text-sm text-gray-400">No users assigned — only admins can see this client.</p>
                  ) : (
                    (client.assignedToUids ?? []).map((uid) => {
                      const u = allUsers.find((p) => p.uid === uid);
                      return (
                        <span key={uid} className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-brand-50 text-brand-700 border border-brand-200">
                          {u ? u.displayName || u.email : uid}
                        </span>
                      );
                    })
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {allUsers.map((u) => {
                    const checked = assignedUids.includes(u.uid);
                    return (
                      <label key={u.uid} className="flex items-center gap-2.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setAssignedUids((prev) =>
                              checked ? prev.filter((id) => id !== u.uid) : [...prev, u.uid]
                            )
                          }
                          className="rounded border-gray-300 text-brand-600 focus:ring-brand-400"
                        />
                        <span className="text-sm text-gray-800">{u.displayName || u.email}</span>
                        {u.isAdmin && <span className="text-xs text-gray-400">(admin)</span>}
                      </label>
                    );
                  })}
                  {allUsers.length === 0 && (
                    <p className="text-sm text-gray-400">No other users in the system yet.</p>
                  )}
                </div>
              )}
            </div>
          )}
        </section>

        {/* Notes */}
        {(!editing && client.notes) || editing ? (
          <section className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Notes</h3>
            {editing ? (
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 resize-none" />
            ) : (
              <p className="text-sm text-gray-700 whitespace-pre-line">{client.notes}</p>
            )}
          </section>
        ) : null}
      </div>
    </div>
  );
}
