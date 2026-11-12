'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MapPinOff } from 'lucide-react';
import { Bi } from '@/components/spanish/Es';

/**
 * The "some addresses are incomplete — save anyway?" question on the order
 * forms, as a TTMS dialog rather than the browser's confirm(): the browser's
 * box says "localhost:3000 says", ignores the theme and cannot be styled.
 *
 * `ask(gaps)` answers true for Save anyway and false for Go back, the same
 * contract confirm() had, so the save handlers read the same. Portalled to
 * <body> for the ChangeOrderPrompt's reason: inside the order <form>, Enter
 * on a button would otherwise submit the order.
 */
export function useIncompleteAddressPrompt() {
  const [gaps, setGaps] = useState<string[] | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const ask = useCallback((lines: string[]) => new Promise<boolean>((resolve) => {
    // A second save while the box is open answers the first with a no.
    resolver.current?.(false);
    resolver.current = resolve;
    setGaps(lines);
  }), []);

  const finish = useCallback((ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setGaps(null);
  }, []);

  // A form that unmounts with the box open must not leave its save waiting.
  useEffect(() => () => { resolver.current?.(false); }, []);

  const dialog = gaps ? <IncompleteAddressDialog gaps={gaps} onAnswer={finish} /> : null;
  return { ask, dialog };
}

function IncompleteAddressDialog({ gaps, onAnswer }: { gaps: string[]; onAnswer: (ok: boolean) => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onAnswer(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onAnswer]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4"
      role="alertdialog" aria-modal="true" aria-labelledby="incomplete-address-title"
      onClick={(e) => { if (e.target === e.currentTarget) onAnswer(false); }}>
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
        <h2 id="incomplete-address-title" className="flex items-center gap-2 text-base font-semibold text-gray-900">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-50 text-amber-600">
            <MapPinOff className="h-4 w-4" aria-hidden />
          </span>
          <span data-es>Some addresses are incomplete</span>
        </h2>
        <ul className="mt-3 space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {gaps.map((g) => <li key={g}>{g}</li>)}
        </ul>
        <p className="mt-3 text-sm text-gray-600">
          <Bi>The load keeps what was typed. An address without a street, city and state is not added to its shipper or consignee until it is filled in.</Bi>
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" data-es="Go back and fix" onClick={() => onAnswer(false)} autoFocus
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Go back and fix
          </button>
          <button type="button" data-es="Save anyway" onClick={() => onAnswer(true)}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
            Save anyway
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
