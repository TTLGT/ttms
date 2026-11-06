'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/**
 * A panel that slides in from the right, over the order page.
 *
 * The reviews (the SA, the Dispatch Sheet, a change order, the paperwork
 * checklist) used to be full-width cards above the load, so on a booked load
 * the broker scrolled past a long checklist before seeing where the truck was
 * going. They are short-lived — open while dispatch works them, finished
 * after — so each now sits in the right-hand rail as one line and opens here.
 *
 * The panel stays mounted while closed, deliberately. Each review loads
 * itself and reports back (`onLoaded`) so the rail can draw its line; were
 * the panel mounted only when opened, the rail would have nothing to show.
 * `inert` keeps a closed panel out of the tab order and away from screen
 * readers. Portalled to <body> so no ancestor's overflow or stacking can clip
 * it.
 */
export default function OrderSidePanel({ open, onClose, title, icon: Icon, children }: {
  open: boolean;
  onClose: () => void;
  title: string;
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!mounted) return null;
  return createPortal(
    <>
      <div onClick={onClose} aria-hidden
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity duration-200 ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`} />
      <aside role="dialog" aria-modal={open} aria-label={title} inert={!open}
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-[600px] flex-col bg-white shadow-2xl transition-transform duration-300 ease-out motion-reduce:transition-none ${open ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="flex items-center gap-3 border-b border-gray-200 px-5 py-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><Icon className="h-[18px] w-[18px]" /></span>
          <h2 data-es className="flex-1 text-base font-semibold text-gray-900">{title}</h2>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close"
            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
      </aside>
    </>,
    document.body,
  );
}

/**
 * One open item in the rail: a ring for how far along it is (or an icon when
 * there is nothing to count), a title, one line of where it stands, and a
 * chevron that says it opens.
 */
export function RailItem({ title, sub, done, total, icon: Icon, tone = 'brand', onOpen }: {
  title: string;
  sub: React.ReactNode;
  done?: number;
  total?: number;
  icon?: LucideIcon;
  tone?: 'brand' | 'amber' | 'green' | 'gray';
  onOpen: () => void;
}) {
  const ring = total ? Math.min(1, (done ?? 0) / total) : 0;
  const C = 2 * Math.PI * 16;
  const iconTone = {
    brand: 'bg-brand-50 text-brand-600',
    amber: 'bg-amber-50 text-amber-600',
    green: 'bg-green-50 text-green-600',
    gray:  'bg-gray-100 text-gray-500',
  }[tone];
  return (
    <button type="button" onClick={onOpen}
      className="group flex w-full items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 text-left transition hover:-translate-y-px hover:border-brand-300 hover:shadow-sm motion-reduce:transform-none">
      {total ? (
        <svg viewBox="0 0 40 40" className="h-10 w-10 shrink-0" aria-hidden>
          {/* currentColor and text-* rather than stroke-* / fill-*: only the
              text, background and border utilities are remapped for dark mode. */}
          <circle cx="20" cy="20" r="16" fill="none" strokeWidth="4" stroke="currentColor" className="text-gray-200" />
          <circle cx="20" cy="20" r="16" fill="none" strokeWidth="4" strokeLinecap="round" stroke="currentColor"
            className={ring === 1 ? 'text-green-500' : 'text-brand-500'}
            strokeDasharray={C} strokeDashoffset={C * (1 - ring)}
            style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%', transition: 'stroke-dashoffset .5s' }} />
          <text x="20" y="20" textAnchor="middle" dominantBaseline="central" fill="currentColor" className="text-gray-900 text-[10px] font-bold">
            {done ?? 0}/{total}
          </text>
        </svg>
      ) : Icon ? (
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${iconTone}`}><Icon className="h-5 w-5" /></span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span data-es className="block text-sm font-semibold text-gray-900">{title}</span>
        <span className="block text-xs text-gray-500">{sub}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-gray-400 transition group-hover:translate-x-0.5 group-hover:text-brand-600" />
    </button>
  );
}
