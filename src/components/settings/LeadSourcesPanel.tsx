'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Pencil, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import {
  listLeadSources,
  createLeadSource,
  updateLeadSource,
  deleteLeadSource,
} from '@/lib/leadSources';
import type { LeadSource } from '@/types/leadSource';

/**
 * Admin management of lead sources — where clients and loads come from.
 *
 * A managed list rather than a free-text box on each order, because the point
 * of recording a source is to add it up later, and typed by hand the same
 * source arrives three different ways.
 *
 * Retiring is the normal way to remove one. Deleting is refused by the API
 * while anything still points at the source, because blanking the field across
 * thousands of orders would destroy attribution nobody could rebuild.
 */
export default function LeadSourcesPanel() {
  const [sources, setSources] = useState<LeadSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [busy, setBusy]       = useState('');

  const [newName, setNewName] = useState('');

  const [editing, setEditing]     = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      setSources(await listLeadSources());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load lead sources');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    setError('');
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work');
    } finally {
      setBusy('');
    }
  }

  async function handleDelete(source: LeadSource) {
    const ok = window.confirm(
      `Delete "${source.name}"?\n\nThis only works if no order or client is using it. ` +
      `If any are, retire it instead — they keep their source and it leaves the pickers.`,
    );
    if (!ok) return;
    await run(source.id, () => deleteLeadSource(source.id));
  }

  const active  = sources.filter((s) => s.isActive);
  const retired = sources.filter((s) => !s.isActive);

  function row(source: LeadSource) {
    return (
      <li key={source.id} className="px-4 py-3 bg-gray-50">
        {editing === source.id ? (
          <div className="flex gap-2 flex-wrap items-center">
            <input
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              className="flex-1 min-w-40 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
            <button
              onClick={() => run(source.id, async () => {
                await updateLeadSource(source.id, { name: draftName.trim() });
                setEditing(null);
              })}
              disabled={busy === source.id || !draftName.trim()}
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
              <p className="text-sm font-semibold text-gray-900">{source.name}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {source.isActive
                  ? 'Selectable on orders and clients'
                  : 'Retired — hidden from the pickers, kept on records that use it'}
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => { setEditing(source.id); setDraftName(source.name); }}
                title="Rename"
                className="p-2 rounded-lg border border-gray-200 text-gray-400 hover:bg-white hover:text-gray-600 transition"
              >
                <Pencil size={14} />
              </button>
              <button
                onClick={() => run(source.id, () => updateLeadSource(source.id, { isActive: !source.isActive }))}
                disabled={busy === source.id}
                title={source.isActive ? 'Retire' : 'Bring back'}
                className="p-2 rounded-lg border border-gray-200 text-gray-400 hover:bg-white hover:text-gray-600 transition disabled:opacity-50"
              >
                <RotateCcw size={14} />
              </button>
              <button
                onClick={() => handleDelete(source)}
                disabled={busy === source.id}
                title="Delete"
                className="p-2 rounded-lg border border-gray-200 text-gray-400 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition disabled:opacity-50"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        )}
      </li>
    );
  }

  return (
    <section className="bg-white rounded-xl border border-gray-200 mt-6">
      <div className="px-6 py-4 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-900">Lead Sources</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Where clients and loads come from. Brokers pick from this list rather than typing it,
          so the same source is spelled one way and totals up correctly. Importing from BATS adds
          any source it finds that is not here yet.
        </p>
      </div>

      <div className="p-6 space-y-4">
        <div className="flex gap-2 flex-wrap">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Source name, e.g. Repeat Customer"
            className="flex-1 min-w-48 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
          <button
            onClick={() => run('create', async () => {
              await createLeadSource(newName.trim());
              setNewName('');
            })}
            disabled={busy === 'create' || !newName.trim()}
            className="flex items-center gap-1.5 px-4 py-2 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 transition disabled:opacity-50"
          >
            <Plus size={15} />
            {busy === 'create' ? 'Adding…' : 'Add source'}
          </button>
        </div>

        {error && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : sources.length === 0 ? (
          <p className="text-sm text-gray-400">
            No lead sources yet. Add one and it becomes selectable on orders and clients.
          </p>
        ) : (
          <>
            <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg overflow-hidden">
              {active.map(row)}
            </ul>
            {retired.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Retired ({retired.length})
                </p>
                <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg overflow-hidden opacity-70">
                  {retired.map(row)}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
