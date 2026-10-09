'use client';

import { useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { getAgreementTerms, saveAgreementTerms } from '@/lib/agreementTerms';
import { useDateFormatters } from '@/lib/useDateFormatters';
import { DEFAULT_CLIENT_TERMS, MAX_TERMS_LENGTH, validateClientTerms } from '@/types/agreementTerms';

/**
 * Settings → Operations → Agreement Terms: the terms and conditions a client
 * reads and accepts when they sign a load confirmation. See
 * src/types/agreementTerms.ts.
 *
 * A draft with Save and Discard, like Quote Rates: legal wording is edited a
 * clause at a time, and saving on every keystroke would send half a sentence
 * to whichever client dispatch emailed in the meantime.
 */
export default function AgreementTermsPanel() {
  const { formatDateTime } = useDateFormatters();
  const [saved, setSaved] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [meta, setMeta] = useState<{ isDefault: boolean; updatedAt: string | null; updatedBy: string | null }>(
    { isDefault: true, updatedAt: null, updatedBy: null },
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    getAgreementTerms()
      .then((res) => {
        setSaved(res.client);
        setDraft(res.client);
        setMeta({ isDefault: res.isDefault, updatedAt: res.updatedAt, updatedBy: res.updatedBy });
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load the agreement terms'));
  }, []);

  const dirty = saved !== null && draft !== saved;
  const checked = validateClientTerms(draft);
  const problem = dirty && 'error' in checked ? checked.error : '';

  async function save() {
    if (!dirty || problem) return;
    setSaving(true);
    setError('');
    setJustSaved(false);
    try {
      const stored = await saveAgreementTerms(draft);
      setSaved(stored);
      setDraft(stored);
      setMeta({ isDefault: false, updatedAt: new Date().toISOString(), updatedBy: 'you' });
      setJustSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the agreement terms');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-900">Agreement Terms</h2>
      <p className="mb-4 mt-1 text-sm text-gray-500">
        The terms and conditions on the client&rsquo;s load confirmation. Clients read these on the signing page
        and must accept them before they can sign. A change applies to agreements sent from now on. Links
        already sent keep the terms they went out with.
      </p>

      {saved === null && !error ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        <>
          <textarea
            value={draft}
            onChange={(e) => { setDraft(e.target.value); setJustSaved(false); }}
            rows={18}
            spellCheck
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-mono text-xs leading-relaxed text-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
            <span>
              {meta.isDefault
                ? 'Showing the standard terms. Nothing has been saved here yet.'
                : `Last saved${meta.updatedBy ? ` by ${meta.updatedBy}` : ''}${meta.updatedAt ? `, ${formatDateTime(meta.updatedAt)}` : ''}.`}
            </span>
            <span className={draft.length > MAX_TERMS_LENGTH ? 'text-red-600' : ''}>
              {draft.length.toLocaleString('en-US')} / {MAX_TERMS_LENGTH.toLocaleString('en-US')}
            </span>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void save()}
              disabled={!dirty || Boolean(problem) || saving}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving ? 'Saving…' : 'Save terms'}
            </button>
            <button
              type="button"
              onClick={() => { setDraft(saved ?? ''); setJustSaved(false); }}
              disabled={!dirty || saving}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Discard changes
            </button>
            {/* Puts the standard wording in the box; nothing is saved until Save. */}
            <button
              type="button"
              onClick={() => { setDraft(DEFAULT_CLIENT_TERMS); setJustSaved(false); }}
              disabled={draft === DEFAULT_CLIENT_TERMS || saving}
              className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Start from the standard terms
            </button>
          </div>
        </>
      )}

      {problem && <p className="mt-3 text-sm text-red-600">{problem}</p>}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {justSaved && <p className="mt-3 text-sm text-green-700">Saved. The next agreement sent will use these terms.</p>}
    </section>
  );
}
