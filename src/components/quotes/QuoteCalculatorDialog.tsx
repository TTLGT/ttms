'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calculator, X } from 'lucide-react';
import QuoteCalculator, { type QuoteApplied, type QuotePrefill } from './QuoteCalculator';
import { convertLength, itemWeightLb, type CommodityItem } from '@/types/order';

/**
 * The calculator over an order form — a new quote or an order being edited.
 *
 * Rendered through a portal to <body>, not inside the form it was opened from.
 * In the DOM the order form is an ancestor of wherever this button sits, and
 * pressing Enter in any box inside a <form> submits it: the broker would save
 * the order while typing a weight into the calculator.
 */

/**
 * The freight as one envelope: the longest, widest and tallest of the lines,
 * and the weight of all of them.
 *
 * The largest of each rather than a sum, because nothing here knows how the
 * pieces are stacked — two 20 ft beams can go end to end or side by side. The
 * calculator says where the figures came from, and the broker can overwrite
 * them; the weight is a sum because weight always adds up.
 */
export function quotePrefillFromItems(items: readonly CommodityItem[]): Pick<QuotePrefill, 'lengthFt' | 'widthFt' | 'heightFt' | 'weightLb'> {
  const ft = (pick: (c: CommodityItem) => number) => {
    const most = Math.max(0, ...items.map((c) => convertLength(pick(c) || 0, c.dimensionUnit, 'ft')));
    return most > 0 ? most : null;
  };
  const weight = items.reduce((sum, c) => sum + itemWeightLb(c), 0);
  return {
    lengthFt: ft((c) => c.length),
    widthFt: ft((c) => c.width),
    heightFt: ft((c) => c.height),
    weightLb: weight > 0 ? weight : null,
  };
}

export default function QuoteCalculatorDialog({ prefill, onApply, label = 'Quote calculator' }: {
  /** Read when the dialog opens, so it starts from the form as it is then. */
  prefill: () => QuotePrefill;
  onApply: (result: QuoteApplied) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState<QuotePrefill>({});

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => { setStart(prefill()); setOpen(true); }}
        className="inline-flex items-center gap-1.5 rounded-lg border border-brand-300 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100"
      >
        <Calculator className="w-3.5 h-3.5" />
        {label}
      </button>

      {open && createPortal(
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-2 sm:p-4 overflow-y-auto"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="w-full max-w-6xl rounded-xl border border-gray-200 bg-gray-50 shadow-xl my-auto">
            <div className="flex items-center justify-between gap-3 border-b border-gray-200 bg-white rounded-t-xl px-5 py-3">
              <div>
                <h2 className="text-base font-bold text-gray-900">Quote calculator</h2>
                <p className="text-xs text-gray-500">Started from this order&apos;s miles and freight. Change anything; nothing is saved here.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close"
                className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-800">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-3 sm:p-5">
              <QuoteCalculator
                prefill={start}
                onApply={(r) => { onApply(r); setOpen(false); }}
              />
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
