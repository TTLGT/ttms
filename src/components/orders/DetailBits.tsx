import { Info, TriangleAlert } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/*
 * Small pieces the order page's cards are built from (2026-11-11).
 *
 * The cards used to read as a stack of grey labels over values, with a
 * paragraph of explanation under most of them, so a reader had to read
 * everything to find the one thing they came for. These pieces exist to
 * keep three habits the same on every card:
 *
 *  - the answer is drawn large and first, the label small above it;
 *  - related facts sit together in a titled tile, not in a flat grid;
 *  - the "why" text is folded behind a Hint, there for whoever wants it and
 *    out of the way of everyone else. A Hint is never the only place a
 *    warning lives — anything somebody must act on stays on screen.
 *
 * Only colour families tailwind.config.ts maps for dark mode are used, and
 * every class string is written out in full so Tailwind finds it.
 */

export type PillTone = 'green' | 'amber' | 'red' | 'blue' | 'gray' | 'violet' | 'indigo' | 'emerald' | 'teal';

const PILL: Record<PillTone, string> = {
  green:   'bg-green-50 text-green-700 border-green-200',
  amber:   'bg-amber-50 text-amber-800 border-amber-200',
  red:     'bg-red-50 text-red-700 border-red-200',
  blue:    'bg-blue-50 text-blue-700 border-blue-200',
  gray:    'bg-gray-100 text-gray-600 border-gray-200',
  violet:  'bg-violet-50 text-violet-700 border-violet-200',
  indigo:  'bg-indigo-50 text-indigo-700 border-indigo-200',
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  teal:    'bg-teal-50 text-teal-700 border-teal-200',
};

/** A short status word in a rounded chip. Keep the text to two or three words. */
export function Pill({ tone = 'gray', icon: Icon, children, className = '' }: {
  tone?: PillTone;
  icon?: LucideIcon;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold ${PILL[tone]} ${className}`}>
      {Icon && <Icon className="h-3 w-3" />}
      {children}
    </span>
  );
}

/**
 * A titled group of related facts inside a card — the carrier's contact, its
 * insurance, the driver. The title is a quiet small heading; what is inside
 * carries the weight.
 */
export function Tile({ icon: Icon, title, aside, children, className = '' }: {
  icon?: LucideIcon;
  title: string;
  /** Drawn at the right of the title — a status pill, a count, a link. */
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-gray-200 bg-gray-50 p-4 ${className}`}>
      <div className="mb-3 flex items-center gap-2">
        {Icon && <Icon className="h-4 w-4 shrink-0 text-gray-400" />}
        <p data-es className="min-w-0 flex-1 text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</p>
        {aside}
      </div>
      {children}
    </div>
  );
}

/** A label over its value, for use inside a Tile or a card. */
export function Fact({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <p data-es className="text-xs text-gray-500">{label}</p>
      <div className="mt-0.5 text-sm font-medium text-gray-900">{children}</div>
    </div>
  );
}

/**
 * The explanation behind a section, folded away. A native <details>, so it
 * opens with the keyboard and needs no state.
 */
export function Hint({ label = 'How this works', children, className = '' }: {
  label?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <details className={`group text-xs text-gray-500 ${className}`}>
      <summary className="inline-flex cursor-pointer select-none items-center gap-1 font-medium text-gray-500 hover:text-gray-700 [&::-webkit-details-marker]:hidden">
        <Info className="h-3.5 w-3.5" />
        <span data-es>{label}</span>
      </summary>
      <div className="mt-1.5 max-w-prose leading-relaxed">{children}</div>
    </details>
  );
}

/** One of the health checks along the top of the Carrier card. */
export interface HealthCheck {
  key: string;
  label: string;
  /** Two or three words: "Expired", "Waiting on client". */
  status: string;
  tone: 'red' | 'amber' | 'green' | 'blue' | 'gray';
  icon: LucideIcon;
}

const CHECK_TONE: Record<HealthCheck['tone'], { icon: string; text: string }> = {
  red:   { icon: 'bg-red-50 text-red-600',     text: 'text-red-700' },
  amber: { icon: 'bg-amber-50 text-amber-600', text: 'text-amber-700' },
  green: { icon: 'bg-green-50 text-green-600', text: 'text-green-700' },
  blue:  { icon: 'bg-blue-50 text-blue-600',   text: 'text-blue-700' },
  gray:  { icon: 'bg-gray-100 text-gray-500',  text: 'text-gray-500' },
};

/** A row of status boxes — red, yellow, green or grey at a glance. */
export function HealthChecks({ checks }: { checks: HealthCheck[] }) {
  if (!checks.length) return null;
  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      {checks.map(({ key, label, status, tone, icon: Icon }) => (
        <div key={key} className="flex min-w-0 items-center gap-2.5 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5">
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${CHECK_TONE[tone].icon}`}>
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p data-es className="truncate text-xs font-semibold text-gray-900">{label}</p>
            <p data-es className={`truncate text-xs ${CHECK_TONE[tone].text}`}>{status}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

/** One line of a "things to fix" list, with the button that takes you there. */
export interface FixItem {
  key: string;
  text: React.ReactNode;
  action: string;
  onAct: () => void;
}

export function FixList({ items, title }: { items: FixItem[]; title: string }) {
  if (!items.length) return null;
  return (
    <div className="rounded-xl border border-red-200">
      <p className="flex items-center gap-2 border-b border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-800 rounded-t-xl">
        <TriangleAlert className="h-4 w-4 shrink-0" />
        {title}
      </p>
      <ul className="divide-y divide-gray-100">
        {items.map((it) => (
          <li key={it.key} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2.5">
            <span className="min-w-0 flex-1 text-sm text-gray-800">{it.text}</span>
            <button type="button" onClick={it.onAct} data-es={it.action}
              className="shrink-0 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">
              {it.action}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Scrolls a part of the page into view and outlines it for a moment — what a
 * "things to fix" button does, so the fix is made where it always is rather
 * than in a second copy of the same control.
 */
export function showPart(el: HTMLElement | null) {
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  // Written out in full (not built) so Tailwind generates them.
  const cls = ['ring-2', 'ring-amber-400', 'ring-offset-2', 'ring-offset-white', 'rounded-lg'];
  el.classList.add(...cls);
  window.setTimeout(() => el.classList.remove(...cls), 1800);
}

/** A thin rule with a small heading, splitting one card into parts. */
export function PartHeading({ icon: Icon, title, aside }: { icon?: LucideIcon; title: string; aside?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      {Icon && <Icon className="h-4 w-4 shrink-0 text-gray-400" />}
      <p data-es className="min-w-0 flex-1 text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</p>
      {aside}
    </div>
  );
}
