'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { FileDown, FileText, Globe, Loader2, Save, ShieldCheck, X } from 'lucide-react';
import { useDateFormatters } from '@/lib/useDateFormatters';
import {
  downloadVettingPdf, listCarrierVettings, openVettingFile, saveCarrierVetting,
} from '@/lib/carrierVettingClient';
import { VETTING_TRIGGER_LABEL, vettingLevel, type CarrierVetting } from '@/types/carrierVetting';

const LEVEL: Record<ReturnType<typeof vettingLevel>, { label: string; cls: string }> = {
  ok:      { label: 'No FMCSA concerns',  cls: 'bg-green-100 text-green-700' },
  warn:    { label: 'FMCSA: look first',  cls: 'bg-amber-100 text-amber-700' },
  bad:     { label: 'FMCSA: problem',     cls: 'bg-red-100 text-red-700' },
  unknown: { label: 'No FMCSA answer',    cls: 'bg-red-100 text-red-700' },
};

/**
 * The load's carrier vetting records — the proof that the carrier was checked
 * before it was hired. See src/types/carrierVetting.ts for why they exist.
 *
 * One is taken by itself whenever a Dispatch Sheet is emailed. "Save a record
 * now" is for everything else: a carrier booked on paper, or a second look
 * on pickup day. Read only when opened, like the verification record beside it.
 */
export default function CarrierVettingRecords({ orderId }: { orderId: string }) {
  const { formatDateTime } = useDateFormatters();
  const [open, setOpen] = useState(false);
  const [records, setRecords] = useState<CarrierVetting[] | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState('');

  function show() {
    setOpen(true);
    setRecords(null);
    setError('');
    listCarrierVettings(orderId).then(setRecords).catch((e) => setError(e instanceof Error ? e.message : 'Could not load the records'));
  }

  async function save() {
    setSaving(true);
    setError('');
    try {
      const r = await saveCarrierVetting(orderId);
      setRecords((prev) => [r, ...(prev ?? [])]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the record');
    } finally {
      setSaving(false);
    }
  }

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    setError('');
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong'); } finally { setBusy(''); }
  }

  const btn = 'inline-flex items-center gap-1 px-2.5 py-1 border border-gray-300 bg-white text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50 transition';

  return (
    <>
      <button type="button" onClick={show}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 text-gray-700 text-xs font-semibold rounded-lg hover:bg-gray-50 transition">
        <ShieldCheck className="w-3.5 h-3.5" /> Vetting records
      </button>
      {open && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="w-full max-w-3xl rounded-xl border border-gray-200 bg-white p-6 shadow-xl space-y-4 max-h-full overflow-y-auto">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Carrier vetting records</h2>
                <p className="text-xs text-gray-500 mt-1">
                  Proof of what we knew about the carrier when we hired it: FMCSA&apos;s answer at that moment, a copy of
                  the SaferWeb page and the insurance certificate, and who confirmed each check. One is saved every time
                  the Dispatch Sheet is emailed. They can never be changed or deleted.
                </p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="rounded p-1 text-gray-400 hover:bg-gray-100">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={save} disabled={saving}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 text-white text-xs font-semibold rounded-lg hover:bg-brand-700 disabled:opacity-50 transition">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                {saving ? 'Asking FMCSA and saving…' : 'Save a record now'}
              </button>
              <p className="text-xs text-gray-500">For a carrier booked without the emailed Dispatch Sheet, or a second check on pickup day.</p>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            {records === null && !error ? (
              <p className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" />Loading…</p>
            ) : records && records.length === 0 ? (
              <p className="text-sm text-gray-500">No vetting record has been saved on this load yet.</p>
            ) : (
              <ol className="space-y-3">
                {(records ?? []).map((r) => {
                  const level = LEVEL[vettingLevel(r)];
                  const ticked = r.review?.checks.filter((c) => c.byName).length ?? 0;
                  return (
                    <li key={r.id} className="rounded-lg border border-gray-200 p-3 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-gray-900">{formatDateTime(new Date(r.takenAt))}</span>
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${level.cls}`}>{level.label}</span>
                        <span className="text-xs text-gray-500">
                          {VETTING_TRIGGER_LABEL[r.trigger]}{r.dispatchVersion ? ` (version ${r.dispatchVersion})` : ''} · by {r.takenByName}
                        </span>
                      </div>
                      <p className="text-xs text-gray-600">
                        {r.carrier.name || 'Carrier'} · DOT {r.carrier.dot || '—'} · MC {r.carrier.mc || '—'}
                        {' · '}
                        {r.fmcsaSource === 'live' ? 'FMCSA asked live'
                          : r.fmcsaSource === 'stored' ? <span className="text-amber-700">FMCSA unreachable — last stored check kept</span>
                          : <span className="text-red-700">FMCSA unreachable, never checked</span>}
                        {' · '}
                        {r.review ? `${ticked} of ${r.review.checks.length} review checks confirmed` : 'No review on the load'}
                      </p>
                      {r.concerns.length > 0 && (
                        <ul className="text-xs space-y-0.5">
                          {r.concerns.map((c) => (
                            <li key={c.text} className={c.level === 'bad' ? 'text-red-700 font-medium' : 'text-amber-800'}>{c.text}</li>
                          ))}
                        </ul>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <button type="button" className={btn} disabled={busy !== ''}
                          onClick={() => run(`${r.id}pdf`, () => downloadVettingPdf(orderId, r.id))}>
                          {busy === `${r.id}pdf` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
                          Carrier Selection File (PDF)
                        </button>
                        {r.files.saferWeb ? (
                          <button type="button" className={btn} disabled={busy !== ''}
                            onClick={() => run(`${r.id}sw`, () => openVettingFile(orderId, r.id, 'saferWeb'))}>
                            <Globe className="w-3.5 h-3.5" /> SaferWeb copy
                          </button>
                        ) : (
                          <span className="text-xs text-amber-700 self-center">No SaferWeb copy{r.fileErrors?.saferWeb ? `: ${r.fileErrors.saferWeb}` : ''}</span>
                        )}
                        {r.files.insurance ? (
                          <button type="button" className={btn} disabled={busy !== ''}
                            onClick={() => run(`${r.id}ins`, () => openVettingFile(orderId, r.id, 'insurance'))}>
                            <FileText className="w-3.5 h-3.5" /> Insurance certificate copy
                          </button>
                        ) : (
                          <span className="text-xs text-amber-700 self-center">No certificate copy{r.fileErrors?.insurance ? `: ${r.fileErrors.insurance}` : ''}</span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
