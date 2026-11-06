'use client';

import { createContext, useContext, type ReactNode } from 'react';

/**
 * The pieces every drawn screen in the guides is built from.
 *
 * These are drawings, not screenshots, on purpose: a screenshot of TTMS shows
 * somebody's real loads, clients and rates, goes stale with every change to a
 * page, and cannot follow the theme. A drawing shows only the parts a step is
 * about, works in light, dim and dark, and — when the site is redesigned — is
 * redrawn here without touching the words in the guide files.
 *
 * A screen marks the parts its steps talk about with `<Spot n={…} />` inside
 * an element with `relative`. The guide passes which spot is lit and what
 * each one says; clicking a spot lights its step.
 */

export interface SpotState {
  active: number | null;
  onSpot: (n: number) => void;
  labels: Record<number, string>;
}

const SpotCtx = createContext<SpotState>({ active: null, onSpot: () => {}, labels: {} });

export function SpotProvider({ value, children }: { value: SpotState; children: ReactNode }) {
  return <SpotCtx.Provider value={value}>{children}</SpotCtx.Provider>;
}

type Corner = 'tl' | 'tr' | 'bl' | 'br' | 'l' | 'r';
const CORNER: Record<Corner, string> = {
  tl: '-left-2.5 -top-2.5', tr: '-right-2.5 -top-2.5',
  bl: '-left-2.5 -bottom-2.5', br: '-right-2.5 -bottom-2.5',
  l: '-left-2.5 top-1/2 -translate-y-1/2', r: '-right-2.5 top-1/2 -translate-y-1/2',
};

/** A numbered marker. Its parent must be `relative`. */
export function Spot({ n, at = 'tl' }: { n: number; at?: Corner }) {
  const { active, onSpot, labels } = useContext(SpotCtx);
  const lit = active === n;
  return (
    <button
      type="button"
      data-learn-skip
      onClick={(e) => { e.stopPropagation(); onSpot(n); }}
      title={labels[n]}
      aria-label={labels[n] ? `${n}: ${labels[n]}` : String(n)}
      className={`absolute z-10 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white text-[11px] font-bold shadow-md transition ${CORNER[at]} ${
        lit ? 'scale-125 bg-amber-400 text-gray-900 ring-4 ring-amber-300/60' : 'bg-brand-600 text-white hover:scale-110'
      }`}
    >
      {lit && <span className="absolute inset-0 animate-ping rounded-full bg-amber-400 opacity-60" />}
      <span className="relative">{n}</span>
    </button>
  );
}

/** A lit area behind a spot, so the part it means is outlined too. */
export function useLit(n: number): string {
  const { active } = useContext(SpotCtx);
  return active === n ? 'ring-2 ring-amber-400 ring-offset-2 ring-offset-white' : '';
}

/** A browser window around a drawing, with an address bar naming the page. */
export function Frame({ path, children, sidebar = true, className = '' }: {
  path: string; children: ReactNode; sidebar?: boolean; className?: string;
}) {
  return (
    <div className={`overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg ${className}`} aria-hidden={false}>
      <div className="flex items-center gap-2 border-b border-gray-200 bg-gray-50 px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-red-300" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
        <span className="h-2.5 w-2.5 rounded-full bg-green-300" />
        <span className="ml-2 flex-1 truncate rounded-md bg-white px-2 py-0.5 text-[10px] text-gray-400 border border-gray-200">
          ttms.totaltransportlogistics.us{path}
        </span>
      </div>
      <div className="flex min-h-0">
        {sidebar && <MiniSidebar />}
        <div className="min-w-0 flex-1 p-3 text-[11px] leading-tight text-gray-700">{children}</div>
      </div>
    </div>
  );
}

function MiniSidebar() {
  return (
    <div className="hidden w-12 flex-shrink-0 flex-col items-center gap-2 bg-brand-900 py-3 sm:flex">
      <div className="mb-1 h-5 w-5 rounded bg-brand-500" />
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} className={`h-4 w-4 rounded ${i === 2 ? 'bg-brand-400' : 'bg-brand-700'}`} />
      ))}
    </div>
  );
}

/** A grey stand-in for text nobody needs to read. */
export function Bar({ w = 'w-16', className = '' }: { w?: string; className?: string }) {
  return <span className={`inline-block h-1.5 rounded-full bg-gray-200 ${w} ${className}`} />;
}

export function Avatar({ tone = 'bg-brand-100 text-brand-700', label = 'A', size = 'h-6 w-6' }: {
  tone?: string; label?: string; size?: string;
}) {
  return (
    <span className={`inline-flex flex-shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${size} ${tone}`}>
      {label}
    </span>
  );
}

export function Btn({ children, primary = false, className = '' }: { children: ReactNode; primary?: boolean; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold ${
      primary ? 'bg-brand-600 text-white' : 'border border-gray-200 bg-white text-gray-700'
    } ${className}`}>
      {children}
    </span>
  );
}

export function Pill({ children, on = false, className = '' }: { children: ReactNode; on?: boolean; className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
      on ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600'
    } ${className}`}>
      {children}
    </span>
  );
}

/** A plain diagram box, for the screens that are pictures of an idea rather than of a page. */
export function Diagram({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-gray-200 bg-gradient-to-br from-gray-50 to-white p-4 shadow-sm ${className}`}>
      {children}
    </div>
  );
}
