import { AlertTriangle } from 'lucide-react';

/**
 * Shown on the BOL when the load has changed since it was generated — see
 * `bolOutdated()` in src/types/bolRequest.ts. The BOL is redrawn only when
 * somebody presses Regenerate, so this is the only thing that says the file
 * on hand, and anything emailed from it, no longer matches the load.
 */
export default function BolOutdatedBanner({ canRegenerate }: { canRegenerate: boolean }) {
  return (
    <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
      <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
      <p>
        <strong>This BOL is out of date.</strong> The load has changed since it was generated, so the PDF
        no longer matches it.{' '}
        {canRegenerate
          ? <>Press <strong>Regenerate</strong> to draw it again before sending it. The current one is kept under Earlier BOLs.</>
          : <>Ask somebody who can generate BOLs to regenerate it before it is sent.</>}
      </p>
    </div>
  );
}
