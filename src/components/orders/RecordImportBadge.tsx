'use client';

import { useState } from 'react';
import { History, Loader2, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { setRecordImport } from '@/lib/orderPaperwork';

const TITLE = 'Imported from BATS. This load’s paperwork was not sent, signed or checked in TTMS.';

/**
 * The "Record import" label: the load came from an imported list (BATS) and
 * was never processed in TTMS. See `recordImport` on the Order type.
 *
 * Drawn plain anywhere a load is listed. Given an `orderId` and an
 * `onChange`, it also offers admin and dispatch (`orders.verifyRecords`) the
 * way to take it off — with a confirmation, because it is them vouching for
 * the load — and an Undo straight after. Nobody else is offered anything; the
 * route refuses them regardless.
 */
export default function RecordImportBadge({
  orderId, onChange, size = 'sm',
}: {
  orderId?: string;
  onChange?: (on: boolean) => void;
  size?: 'sm' | 'md';
}) {
  const { can } = useAuth();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const removable = Boolean(orderId && onChange && can('orders.verifyRecords'));

  async function change(on: boolean) {
    if (!orderId || !onChange) return;
    setBusy(true);
    setError('');
    try {
      await setRecordImport(orderId, on);
      onChange(on);
      setConfirming(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change the label');
    } finally {
      setBusy(false);
    }
  }

  const pill = size === 'md' ? 'px-2.5 py-1 text-xs' : 'px-2 py-0.5 text-[11px]';

  return (
    <span className="relative inline-flex items-center">
      <span title={TITLE}
        className={`inline-flex items-center gap-1 rounded-full border border-orange-200 bg-orange-50 font-semibold uppercase tracking-wide text-orange-800 ${pill}`}>
        <History className={size === 'md' ? 'h-3.5 w-3.5' : 'h-3 w-3'} />
        Record import
        {removable && (
          <button type="button" onClick={() => setConfirming((c) => !c)} aria-label="Remove the Record import label"
            className="-mr-1 ml-0.5 rounded-full p-0.5 text-orange-700 hover:bg-orange-100">
            <X className="h-3 w-3" />
          </button>
        )}
      </span>
      {confirming && (
        <span className="absolute left-0 top-full z-30 mt-1.5 w-72 rounded-lg border border-gray-200 bg-white p-3 text-left text-xs normal-case tracking-normal text-gray-700 shadow-lg">
          <span className="block font-semibold text-gray-900">Remove the Record import label?</span>
          <span className="mt-1 block">
            It tells everybody this load came from BATS and its paperwork never went through TTMS.
            Remove it once you have looked the load over. The change log records that you did.
          </span>
          {error && <span className="mt-1.5 block text-red-600">{error}</span>}
          <span className="mt-2.5 flex justify-end gap-2">
            <button type="button" onClick={() => setConfirming(false)} className="px-2 py-1 font-medium text-gray-600 hover:text-gray-900">Keep it</button>
            <button type="button" onClick={() => void change(false)} disabled={busy}
              className="inline-flex items-center gap-1 rounded-md bg-gray-900 px-2.5 py-1 font-semibold text-white hover:bg-gray-700 disabled:opacity-50">
              {busy && <Loader2 className="h-3 w-3 animate-spin" />} Remove label
            </button>
          </span>
        </span>
      )}
    </span>
  );
}

/**
 * What stands where the label was, for admin and dispatch only: who took it
 * off, and the way to put it back — an Undo for a click made by mistake.
 */
export function RecordImportRemoved({ orderId, byName, onChange }: { orderId: string; byName?: string | null; onChange: (on: boolean) => void }) {
  const { can } = useAuth();
  const [busy, setBusy] = useState(false);
  if (!can('orders.verifyRecords')) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-gray-400">
      Imported from BATS{byName ? ` · label removed by ${byName}` : ''}
      <button type="button" disabled={busy}
        onClick={() => { setBusy(true); void setRecordImport(orderId, true).then(() => onChange(true)).catch(() => {}).finally(() => setBusy(false)); }}
        className="font-semibold text-brand-700 hover:underline disabled:opacity-50">
        Put it back
      </button>
    </span>
  );
}
