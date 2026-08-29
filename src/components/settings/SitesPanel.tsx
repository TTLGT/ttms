'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { listSites, createSite, updateSite, deleteSite } from '@/lib/sites';
import type { Site } from '@/types/site';

/**
 * Admin management of sites — the offices and terminals people work out of.
 *
 * A site records where someone sits, not what they can see; access is still
 * decided by roles and work groups. People are assigned to a site in the
 * People With Access list above, which reads the same collection.
 */
export default function SitesPanel({ onChange }: { onChange?: (sites: Site[]) => void }) {
  const [sites, setSites]     = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [busy, setBusy]       = useState('');

  const [newName, setNewName]       = useState('');
  const [newAddress, setNewAddress] = useState('');

  const [editing, setEditing]         = useState<string | null>(null);
  const [draftName, setDraftName]     = useState('');
  const [draftAddress, setDraftAddress] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const rows = await listSites();
      setSites(rows);
      // The people list needs the same rows to render its site picker, so it
      // is handed them here rather than fetching the collection a second time.
      onChange?.(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load sites');
    } finally {
      setLoading(false);
    }
  }, [onChange]);

  useEffect(() => { void load(); }, [load]);

  async function handleCreate() {
    if (!newName.trim()) return;
    setBusy('create');
    setError('');
    try {
      await createSite(newName.trim(), newAddress.trim());
      setNewName('');
      setNewAddress('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create the site');
    } finally {
      setBusy('');
    }
  }

  async function handleSave(siteId: string) {
    if (!draftName.trim()) return;
    setBusy(siteId);
    setError('');
    try {
      await updateSite(siteId, { name: draftName.trim(), address: draftAddress.trim() });
      setEditing(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save the site');
    } finally {
      setBusy('');
    }
  }

  async function handleDelete(site: Site) {
    const ok = window.confirm(
      `Delete "${site.name}"?\n\nAnyone assigned to this site will be left without one. ` +
      `Their access does not change.`,
    );
    if (!ok) return;
    setBusy(site.id);
    setError('');
    try {
      const res = await deleteSite(site.id);
      if (res.detachedUsers > 0) {
        setError(`Deleted. ${res.detachedUsers} person(s) no longer have a site.`);
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete the site');
    } finally {
      setBusy('');
    }
  }

  return (
    <section className="bg-white rounded-xl border border-gray-200">
      <div className="px-6 py-4 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-900">Sites</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          The offices and terminals your people work out of. Assigning someone to a site records
          where they sit — it does not change what they can see.
        </p>
      </div>

      <div className="p-6 space-y-4">
        <div className="flex gap-2 flex-wrap">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Site name, e.g. Laredo Terminal"
            className="flex-1 min-w-48 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
          <input
            value={newAddress}
            onChange={(e) => setNewAddress(e.target.value)}
            placeholder="Address (optional)"
            className="flex-1 min-w-48 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
          <button
            onClick={handleCreate}
            disabled={busy === 'create' || !newName.trim()}
            className="flex items-center gap-1.5 px-4 py-2 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 transition disabled:opacity-50"
          >
            <Plus size={15} />
            {busy === 'create' ? 'Adding…' : 'Add site'}
          </button>
        </div>

        {error && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : sites.length === 0 ? (
          <p className="text-sm text-gray-400">
            No sites yet. Add one and it becomes assignable in the list above.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg overflow-hidden">
            {sites.map((site) => (
              <li key={site.id} className="px-4 py-3 bg-gray-50">
                {editing === site.id ? (
                  <div className="flex gap-2 flex-wrap items-center">
                    <input
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      className="flex-1 min-w-40 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                    />
                    <input
                      value={draftAddress}
                      onChange={(e) => setDraftAddress(e.target.value)}
                      placeholder="Address (optional)"
                      className="flex-1 min-w-40 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                    />
                    <button
                      onClick={() => handleSave(site.id)}
                      disabled={busy === site.id || !draftName.trim()}
                      title="Save"
                      className="p-2 rounded-lg border border-green-200 text-green-600 hover:bg-green-50 transition disabled:opacity-50"
                    >
                      <Check size={14} />
                    </button>
                    <button
                      onClick={() => setEditing(null)}
                      title="Cancel"
                      className="p-2 rounded-lg border border-gray-200 text-gray-400 hover:bg-white transition"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900">{site.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {site.address || 'No address on file'}
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => {
                          setEditing(site.id);
                          setDraftName(site.name);
                          setDraftAddress(site.address ?? '');
                        }}
                        title="Edit site"
                        className="p-2 rounded-lg border border-gray-200 text-gray-400 hover:bg-white hover:text-gray-600 transition"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => handleDelete(site)}
                        disabled={busy === site.id}
                        title="Delete site"
                        className="p-2 rounded-lg border border-gray-200 text-gray-400 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition disabled:opacity-50"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
