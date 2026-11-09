'use client';

import { AlertTriangle, ArrowRight } from 'lucide-react';
import type { ReadinessItem } from '@/types/orderReadiness';
import { READINESS_FIX, type FixTarget } from './fixTargets';

/**
 * Why the BOL cannot be generated yet, on the Bill of Lading card: every
 * field it would print blank, each a link to the place it is filled in.
 *
 * The list is `bolBlockers()` — the same one generateBol() refuses on — so
 * the button here and the server cannot disagree about what is missing.
 *
 * "Fill in on the order" opens the whole edit screen with every order field
 * on this list outlined in red (`?missing=`), so they can be filled in one
 * save rather than one Fix link at a time. The carrier, its numbers and the
 * driver are on this page's Carrier card, not the edit screen, so those keep
 * their own links.
 */
export default function BolMissingNotice({ missing, onFix, onFillAll }: {
  missing: ReadinessItem[];
  onFix: (target: FixTarget) => void;
  /** Present when at least one of them is an order field. */
  onFillAll?: () => void;
}) {
  if (!missing.length) return null;
  return (
    <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="flex items-start gap-2 text-sm font-semibold text-red-800">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span data-es>The BOL cannot be generated until these are filled in</span>
        </p>
        {onFillAll && (
          <button type="button" onClick={onFillAll}
            className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700">
            Fill in on the order <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <ul className="mt-3 flex flex-wrap gap-2">
        {missing.map((m) => {
          const target = READINESS_FIX[m.key];
          const chip = 'inline-flex items-center gap-1 rounded-full border border-red-300 bg-white px-2.5 py-1 text-xs font-medium text-red-700';
          return (
            <li key={m.key}>
              {target
                ? <button type="button" onClick={() => onFix(target)} className={`${chip} hover:bg-red-100`}>
                    {m.label} <ArrowRight className="w-3 h-3" />
                  </button>
                : <span className={chip}>{m.label}</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
