'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FilePen } from 'lucide-react';
import { registerChangeOrderPrompt } from '@/lib/changeOrdersClient';
import { affectsLabel, MAX_CHANGE_ORDER_REASON, type ChangeOrderAffects } from '@/types/changeOrder';

/**
 * The box a broker sees when an edit needs a change order. Mounted once in
 * the dashboard layout; opened by saveOrderPatch() through
 * registerChangeOrderPrompt(), so any edit screen gets it. Portalled to
 * <body> for the same reason as the quote calculator: inside an order
 * <form>, Enter in the reason box would submit the order form.
 */
export default function ChangeOrderPrompt() {
  const [open, setOpen] = useState<{ affects: ChangeOrderAffects[] } | null>(null);
  const [reason, setReason] = useState('');
  const resolver = useRef<((r: string | null) => void) | null>(null);

  useEffect(() => {
    registerChangeOrderPrompt((affects) => new Promise((resolve) => {
      // A second save while the box is open answers the first with a cancel.
      resolver.current?.(null);
      resolver.current = resolve;
      setReason('');
      setOpen({ affects });
    }));
    return () => registerChangeOrderPrompt(null);
  }, []);

  function finish(value: string | null) {
    resolver.current?.(value);
    resolver.current = null;
    setOpen(null);
  }

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
        <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900">
          <FilePen className="h-5 w-5 text-brand-600" /> Submit a change order
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          This changes {affectsLabel(open.affects)}, which has already been sent. Nothing on the load changes yet:
          dispatch reviews your change, applies it, and sends the updated paperwork.
        </p>
        <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-gray-500" htmlFor="change-order-reason">
          Why is the load changing?
        </label>
        <textarea
          id="change-order-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={MAX_CHANGE_ORDER_REASON}
          rows={4}
          autoFocus
          placeholder="For example: the client moved the pickup to Thursday and agreed the new rate by phone."
          className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={() => finish(null)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button type="button" disabled={!reason.trim()} onClick={() => finish(reason.trim())}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
            Send to dispatch
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
