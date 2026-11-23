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
import { Bi } from '@/components/spanish/Es';
import { ConfirmDialog, EmptyState, Loading, Notice, SettingsCard } from './kit/ui';

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
 *
 * Each row's buttons act at once rather than through the Save bar: adding,
 * renaming, retiring and deleting a source are each one deliberate press that
 * names what it does, and every one is written to the change log.
 */
export default function LeadSourcesPanel() {
  const [sources, setSources] = useState<LeadSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [busy, setBusy]       = useState('');
  const [newName, setNewName] = useState('');
  const [editing, setEditing]     = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [deleting, setDeleting]   = useState<LeadSource | null>(null);

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

  const active  = sources.filter((s) => s.isActive);
  const retired = sources.filter((s) => !s.isActive);

  function row(source: LeadSource) {
    return (
      <li key={source.id} className="px-4 py-3">
        {editing === source.id ? (
          <div className="flex flex-wrap items-center gap-2">
            <input value={draftName} onChange={(e) => setDraftName(e.target.value)} autoFocus
              onKeyDown={(e) => { if (e.key === 'Escape') setEditing(null); }}
              className="min-w-40 flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
            <button type="button" title="Save the new name"
              onClick={() => run(source.id, async () => { await updateLeadSource(source.id, { name: draftName.trim() }); setEditing(null); })}
              disabled={busy === source.id || !draftName.trim()}
              className="rounded-lg border border-green-200 p-2 text-green-600 transition hover:bg-green-50 disabled:opacity-50">
              <Check size={14} />
            </button>
            <button type="button" title="Cancel" onClick={() => setEditing(null)}
              className="rounded-lg border border-gray-200 p-2 text-gray-400 transition hover:bg-white">
              <X size={14} />
            </button>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900">{source.name}</p>
              <p className="mt-0.5 text-xs text-gray-500">
                {source.isActive ? 'Offered on orders and clients' : 'Retired — hidden from the pickers, kept on records that use it'}
              </p>
            </div>
            <div className="flex shrink-0 gap-1.5">
              <button type="button" onClick={() => { setEditing(source.id); setDraftName(source.name); }} title="Rename"
                className="rounded-lg border border-gray-200 p-2 text-gray-400 transition hover:bg-white hover:text-gray-600">
                <Pencil size={14} />
              </button>
              <button type="button" onClick={() => run(source.id, () => updateLeadSource(source.id, { isActive: !source.isActive }))}
                disabled={busy === source.id} title={source.isActive ? 'Retire — hide it from the pickers' : 'Bring it back'}
                className="rounded-lg border border-gray-200 p-2 text-gray-400 transition hover:bg-white hover:text-gray-600 disabled:opacity-50">
                <RotateCcw size={14} />
              </button>
              <button type="button" onClick={() => setDeleting(source)} disabled={busy === source.id} title="Delete"
                className="rounded-lg border border-gray-200 p-2 text-gray-400 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-50">
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        )}
      </li>
    );
  }

  return (
    <SettingsCard>
      <p className="mb-4 text-sm text-gray-500">
        <Bi>Brokers pick from this list rather than typing it, so the same source is spelled one way and totals up correctly. Importing from BATS adds any source it finds that is not here yet.</Bi>
      </p>

      <form className="flex flex-wrap gap-2" onSubmit={(e) => {
        e.preventDefault();
        if (newName.trim()) void run('create', async () => { await createLeadSource(newName.trim()); setNewName(''); });
      }}>
        <input id="new-lead-source" value={newName} onChange={(e) => setNewName(e.target.value)}
          placeholder="Source name, e.g. Repeat Customer"
          className="min-w-48 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
        <button type="submit" disabled={busy === 'create' || !newName.trim()}
          className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50">
          <Plus size={15} />
          <span data-es>{busy === 'create' ? 'Adding…' : 'Add source'}</span>
        </button>
      </form>

      {error && <Notice tone="amber" className="mt-4">{error}</Notice>}

      <div className="mt-5">
        {loading ? <Loading /> : sources.length === 0 ? (
          <EmptyState art="road" title="No lead sources yet" body="Add one and it becomes selectable on orders and clients." />
        ) : (
          <div className="space-y-5">
            <ul className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200 bg-gray-50/50">
              {active.map(row)}
            </ul>
            {retired.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <Bi vars={{ n: retired.length }}>{'Retired ({n})'}</Bi>
                </p>
                <ul className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200 opacity-75">
                  {retired.map(row)}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={deleting !== null}
        title={`Delete “${deleting?.name ?? ''}”?`}
        body="This only works if no order or client is using it. If any are, retire it instead — they keep their source and it leaves the pickers."
        confirmLabel="Delete it"
        tone="red"
        busy={busy === deleting?.id}
        onCancel={() => setDeleting(null)}
        onConfirm={() => { const s = deleting!; setDeleting(null); void run(s.id, () => deleteLeadSource(s.id)); }}
      />
    </SettingsCard>
  );
}
