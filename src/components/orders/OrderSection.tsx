'use client';

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/**
 * One section of the order page — Route, Freight, Carrier and the rest.
 *
 * Every section used to be the same white box under the same small grey
 * capitals, so nothing on a long page told one part from another at a glance.
 * Each now carries a coloured icon of its own, and the colour is the same one
 * wherever that subject appears (blue is always the route, violet the
 * carrier), so a reader scrolling past learns where they are without reading.
 *
 * Only colour families `tailwind.config.ts` maps for dark mode are used, so
 * the badge follows the theme like everything else. The class strings are
 * written out in full because Tailwind only generates what it can find.
 */
export type SectionTone = 'brand' | 'amber' | 'emerald' | 'blue' | 'indigo' | 'violet' | 'teal' | 'rose' | 'gray';

const TONE: Record<SectionTone, string> = {
  brand:   'bg-brand-50 text-brand-600',
  amber:   'bg-amber-50 text-amber-600',
  emerald: 'bg-emerald-50 text-emerald-600',
  blue:    'bg-blue-50 text-blue-600',
  indigo:  'bg-indigo-50 text-indigo-600',
  violet:  'bg-violet-50 text-violet-600',
  teal:    'bg-teal-50 text-teal-600',
  rose:    'bg-rose-50 text-rose-600',
  gray:    'bg-gray-100 text-gray-600',
};

// ─── Folding ────────────────────────────────────────────────────────────────
//
// The order page is long, so each section can be folded down to its heading
// and a one-line summary (2026-11-13). Folding lives here, in the heading, so
// every section gets it the same way — including the ones drawn by their own
// components — without each card being rebuilt around it.
//
// The heading cannot wrap its own card, so it marks the card instead: the box
// it sits in gets `data-collapsed`, and globals.css hides everything in that
// box but the heading. Only pages that provide SectionCollapseContext fold;
// elsewhere a heading is drawn exactly as before.
//
// Something that jumps to a part of a folded section (a #carrier link, a
// "Fix" button) calls revealSection first, which unfolds it.

export interface SectionCollapse {
  isCollapsed: (key: string) => boolean;
  toggle: (key: string) => void;
  expand: (key: string) => void;
  collapseAll: () => void;
  expandAll: () => void;
}

export const SectionCollapseContext = createContext<SectionCollapse | null>(null);

interface CollapseState {
  /** Set by Collapse all / Expand all. Null: everything open. */
  all: boolean | null;
  /** One section's own choice, made after the last Collapse/Expand all. */
  one: Record<string, boolean>;
}

const OPEN: CollapseState = { all: null, one: {} };

/**
 * The page's fold state. Remembered in this browser only, per viewer, across
 * orders: someone who never needs Terms keeps it folded on every load.
 */
export function useSectionCollapseState(storageKey: string): SectionCollapse {
  const [state, setState] = useState<CollapseState>(OPEN);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const v = JSON.parse(raw) as Partial<CollapseState>;
        setState({ all: typeof v.all === 'boolean' ? v.all : null, one: v.one && typeof v.one === 'object' ? v.one : {} });
      }
    } catch { /* private window or blocked storage: start open */ }
  }, [storageKey]);

  const save = useCallback((next: CollapseState) => {
    try { window.localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* not remembered, still works */ }
    return next;
  }, [storageKey]);

  return useMemo(() => {
    const isCollapsed = (key: string) => state.one[key] ?? state.all ?? false;
    const set = (key: string, folded: boolean) =>
      setState((s) => save({ ...s, one: { ...s.one, [key]: folded } }));
    return {
      isCollapsed,
      toggle:      (key) => set(key, !isCollapsed(key)),
      expand:      (key) => { if (isCollapsed(key)) set(key, false); },
      collapseAll: () => setState(save({ all: true, one: {} })),
      expandAll:   () => setState(save({ all: false, one: {} })),
    };
  }, [state, save]);
}

const REVEAL = 'ttms:reveal-section';

/** Unfold whatever section `el` is in, now, so it can be scrolled to straight after. */
export function revealSection(el: Element | null) {
  el?.dispatchEvent(new CustomEvent(REVEAL, { bubbles: true }));
}

export function SectionHeading({ icon: Icon, tone, title, action, sub, summary, collapseKey }: {
  icon: LucideIcon;
  tone: SectionTone;
  title: string;
  /** Drawn at the right — the section's Edit link, as before. */
  action?: React.ReactNode;
  /** A line under the title, for the few sections that need one. */
  sub?: React.ReactNode;
  /** One short line shown beside the title while the section is folded. */
  summary?: React.ReactNode;
  /** What the fold is remembered by. The title, unless two sections share one. */
  collapseKey?: string;
}) {
  const ctx = useContext(SectionCollapseContext);
  const key = collapseKey ?? title;
  const collapsed = ctx?.isCollapsed(key) ?? false;
  const ref = useRef<HTMLDivElement>(null);

  // Mark the card this heading sits in; globals.css hides the rest of it.
  useLayoutEffect(() => {
    const card = ref.current?.parentElement;
    if (!card) return;
    if (collapsed) card.setAttribute('data-collapsed', '');
    else card.removeAttribute('data-collapsed');
  }, [collapsed]);

  // A jump into this card unfolds it first. flushSync so the card is open
  // by the time the caller scrolls, in the same tick.
  const expandRef = useRef<() => void>(() => {});
  expandRef.current = () => { if (ctx?.isCollapsed(key)) flushSync(() => ctx.expand(key)); };
  useEffect(() => {
    const card = ref.current?.parentElement;
    if (!card || !ctx) return;
    const onReveal = () => expandRef.current();
    card.addEventListener(REVEAL, onReveal);
    return () => card.removeEventListener(REVEAL, onReveal);
  }, [ctx]);

  const badge = (
    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${TONE[tone]}`}>
      <Icon className="h-[18px] w-[18px]" />
    </span>
  );

  if (!ctx) {
    return (
      <div ref={ref} data-section-head className="flex flex-wrap items-center gap-3 mb-4">
        {badge}
        <div className="min-w-0 flex-1">
          <h3 data-es className="text-base font-semibold text-gray-900">{title}</h3>
          {sub && <div className="text-xs text-gray-500">{sub}</div>}
        </div>
        {action}
      </div>
    );
  }

  return (
    <div ref={ref} data-section-head className={`flex flex-wrap items-center gap-3 ${collapsed ? '' : 'mb-4'}`}>
      <h3 className="min-w-0 flex-1">
        <button type="button" onClick={() => ctx.toggle(key)} aria-expanded={!collapsed}
          title={collapsed ? 'Show this section' : 'Fold this section'}
          className="group flex w-full min-w-0 items-center gap-3 text-left">
          {badge}
          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <span data-es className="text-base font-semibold text-gray-900 group-hover:text-brand-700">{title}</span>
              {collapsed && summary ? (
                <span className="min-w-0 truncate text-sm font-normal text-gray-500">{summary}</span>
              ) : null}
            </span>
            {!collapsed && sub && <span className="block text-xs font-normal text-gray-500">{sub}</span>}
          </span>
          <ChevronDown aria-hidden
            className={`h-4 w-4 shrink-0 text-gray-400 transition-transform group-hover:text-gray-600 ${collapsed ? '-rotate-90' : ''}`} />
        </button>
      </h3>
      {/* Its button (Assign Carrier, say) works in the body, so pressing it opens the section. */}
      {action ? <div onClickCapture={() => ctx.expand(key)}>{action}</div> : null}
    </div>
  );
}

export default function OrderSection({ id, icon, tone, title, action, sub, className = '', children }: {
  id?: string;
  icon: LucideIcon;
  tone: SectionTone;
  title: string;
  action?: React.ReactNode;
  sub?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className={`bg-white rounded-2xl border border-gray-200 p-5 sm:p-6 scroll-mt-4 ${className}`}>
      <SectionHeading icon={icon} tone={tone} title={title} action={action} sub={sub} />
      {children}
    </section>
  );
}
