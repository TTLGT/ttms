'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, Eye, Info, XOctagon } from 'lucide-react';
import { Bi } from '@/components/spanish/Es';

/**
 * The building blocks every Settings page is drawn with.
 *
 * Twenty-odd panels used to draw their own heading, spacing, warning box and
 * "Saved" line, each slightly differently. They now draw these, so a page
 * reads the same as the next one and the Spanish line comes with each piece
 * rather than being remembered panel by panel.
 */

/** Text that may be a plain string (gets its Spanish line) or markup (used as is). */
function Words({ children }: { children: ReactNode }) {
  return typeof children === 'string' ? <Bi>{children}</Bi> : <>{children}</>;
}

/**
 * One block of a page. A page with a single setting uses one card with no
 * title — the page title already says what it is. A page holding several
 * (General) gives each its own title.
 */
export function SettingsCard({
  id, title, description, aside, children, className = '', padded = true,
}: {
  /** Anchor for search results and old links. */
  id?: string;
  title?: string;
  description?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section id={id} className={`scroll-mt-6 rounded-xl border border-gray-200 bg-white ${className}`}>
      {(title || description || aside) && (
        <div className="flex flex-wrap items-start gap-3 border-b border-gray-100 px-5 py-4 sm:px-6">
          <div className="min-w-0 flex-1">
            {title && <h2 className="text-base font-semibold text-gray-900"><Bi>{title}</Bi></h2>}
            {description && <div className="mt-0.5 max-w-3xl text-sm leading-relaxed text-gray-500"><Words>{description}</Words></div>}
          </div>
          {aside && <div className="flex-shrink-0">{aside}</div>}
        </div>
      )}
      <div className={padded ? 'px-5 py-5 sm:px-6' : ''}>{children}</div>
    </section>
  );
}

/** A label on the left, the control on the right, help under the label. Stacks on a phone. */
export function SettingRow({
  label, help, children, htmlFor,
}: {
  label: string;
  help?: ReactNode;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="grid gap-x-8 gap-y-2 border-b border-gray-100 py-4 first:pt-0 last:border-0 last:pb-0 md:grid-cols-[minmax(0,1fr)_minmax(220px,320px)]">
      <div className="min-w-0">
        <label htmlFor={htmlFor} className="text-sm font-semibold text-gray-900"><Bi>{label}</Bi></label>
        {help && <div className="mt-1 text-sm leading-relaxed text-gray-500"><Words>{help}</Words></div>}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

type Tone = 'amber' | 'red' | 'blue' | 'green';

const TONE: Record<Tone, { box: string; Icon: typeof Info }> = {
  amber: { box: 'border-amber-200 bg-amber-50 text-amber-800', Icon: AlertTriangle },
  red:   { box: 'border-red-200 bg-red-50 text-red-700', Icon: XOctagon },
  blue:  { box: 'border-blue-200 bg-blue-50 text-blue-800', Icon: Info },
  green: { box: 'border-green-200 bg-green-50 text-green-800', Icon: CheckCircle2 },
};

/** A warning, an error, a note or a confirmation — one shape for all four. */
export function Notice({
  tone = 'blue', title, children, className = '',
}: {
  tone?: Tone;
  title?: string;
  children?: ReactNode;
  className?: string;
}) {
  const { box, Icon } = TONE[tone];
  return (
    <div className={`flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-sm ${box} ${className}`}>
      <Icon size={16} className="mt-0.5 flex-shrink-0" />
      <div className="min-w-0">
        {title && <p className="font-semibold"><Bi>{title}</Bi></p>}
        {children && <div className={title ? 'mt-0.5' : ''}><Words>{children}</Words></div>}
      </div>
    </div>
  );
}

/** The small amber chip beside a page title, or a "Changed" marker. */
export function Chip({ children, tone = 'amber' }: { children: string; tone?: 'amber' | 'brand' | 'gray' | 'green' }) {
  const cls = {
    amber: 'bg-amber-100 text-amber-800',
    brand: 'bg-brand-100 text-brand-700',
    gray:  'bg-gray-100 text-gray-600',
    green: 'bg-green-100 text-green-700',
  }[tone];
  return <span data-es className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{children}</span>;
}

export interface Option<T extends string | number | boolean> {
  value: T;
  title: string;
  detail?: ReactNode;
  disabled?: boolean;
  /** Said under a disabled option — why it cannot be picked. */
  disabledNote?: ReactNode;
  /** A word drawn small beside the title: "Free", "Billed". */
  tag?: { text: string; tone: 'amber' | 'brand' | 'gray' | 'green' };
}

/**
 * Pick one, drawn as cards. The option that differs from what is saved says
 * "Not saved yet", so it is obvious which card the bar at the foot is about.
 */
export function OptionCards<T extends string | number | boolean>({
  name, value, saved, options, onChange, columns = 1, disabled = false,
}: {
  name: string;
  value: T;
  saved?: T;
  options: Option<T>[];
  onChange: (v: T) => void;
  columns?: 1 | 2 | 3;
  disabled?: boolean;
}) {
  const grid = columns === 3 ? 'md:grid-cols-3' : columns === 2 ? 'md:grid-cols-2' : '';
  return (
    <div role="radiogroup" className={`grid gap-2 ${grid}`}>
      {options.map((o) => {
        const selected = o.value === value;
        const off = disabled || o.disabled;
        const pending = selected && saved !== undefined && saved !== value;
        return (
          <label
            key={String(o.value)}
            className={`flex gap-3 rounded-xl border p-4 transition ${
              off ? 'cursor-not-allowed border-gray-200 bg-gray-50 opacity-70'
                : selected ? 'cursor-pointer border-brand-400 bg-brand-50/60 ring-1 ring-brand-400'
                : 'cursor-pointer border-gray-200 hover:border-gray-300 hover:bg-gray-50'
            }`}
          >
            <input
              type="radio"
              name={name}
              className="mt-1 accent-brand-600"
              checked={selected}
              disabled={off}
              onChange={() => onChange(o.value)}
            />
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-2">
                <span data-es className="text-sm font-semibold text-gray-900">{o.title}</span>
                {o.tag && <Chip tone={o.tag.tone}>{o.tag.text}</Chip>}
                {pending && <Chip tone="brand">Not saved yet</Chip>}
              </span>
              {o.detail && <span className="mt-1 block text-xs leading-relaxed text-gray-600"><Words>{o.detail}</Words></span>}
              {o.disabled && o.disabledNote && (
                <span className="mt-2 flex items-start gap-1.5 text-xs text-amber-700">
                  <AlertTriangle size={13} className="mt-px flex-shrink-0" />
                  <span>{o.disabledNote}</span>
                </span>
              )}
            </span>
          </label>
        );
      })}
    </div>
  );
}

/**
 * A live preview of what a setting will do. Dashed, and labelled, so it can
 * never be mistaken for the thing itself — and it says nothing in it is saved.
 */
export function PreviewBox({
  title = 'Preview', note, children, className = '',
}: {
  title?: string;
  note?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-dashed border-brand-300 bg-brand-50/40 p-4 ${className}`}>
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-brand-700">
        <Eye size={13} /> <span data-es>{title}</span>
      </p>
      <div className="mt-3">{children}</div>
      {note && <p className="mt-3 text-xs text-gray-500"><Bi>{note}</Bi></p>}
    </div>
  );
}

/** A small "Loading…" that holds its place. */
export function Loading({ label = 'Loading…' }: { label?: string }) {
  return <p data-es className="py-6 text-center text-sm text-gray-400">{label}</p>;
}

/**
 * TTMS's own confirm box, in place of the browser's `confirm()` — which reads
 * "localhost says", cannot carry a Spanish line, and looks like a security
 * warning to the people it is shown to.
 */
export function ConfirmDialog({
  open, title, body, confirmLabel, tone = 'brand', busy = false, onConfirm, onCancel, children,
}: {
  open: boolean;
  title: string;
  body?: ReactNode;
  confirmLabel: string;
  tone?: 'brand' | 'red';
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onMouseDown={onCancel}>
      <div
        role="alertdialog"
        aria-modal="true"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-gray-900"><Bi>{title}</Bi></h2>
        {body && <div className="mt-2 text-sm leading-relaxed text-gray-600"><Words>{body}</Words></div>}
        {children && <div className="mt-4">{children}</div>}
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button ref={cancelRef} type="button" data-es onClick={onCancel}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button type="button" data-es onClick={onConfirm} disabled={busy}
            className={`rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${
              tone === 'red' ? 'bg-red-600 hover:bg-red-700' : 'bg-brand-600 hover:bg-brand-700'
            }`}>
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Empty states ────────────────────────────────────────────────────────────

export type EmptyArt = 'road' | 'calendar' | 'people' | 'list' | 'office';

/**
 * An empty list, drawn rather than left blank — in the line style of the
 * anniversary card's highway, so it reads as TTMS. Plain SVG on purpose:
 * `currentColor` and the mapped Tailwind inks keep it right in every theme.
 */
export function EmptyState({
  art = 'list', title, body, action,
}: {
  art?: EmptyArt;
  title: string;
  body?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-4 py-10 text-center">
      <EmptyDrawing art={art} />
      <p className="mt-4 text-sm font-semibold text-gray-800"><Bi>{title}</Bi></p>
      {body && <div className="mt-1 max-w-sm text-sm text-gray-500"><Words>{body}</Words></div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

function EmptyDrawing({ art }: { art: EmptyArt }) {
  // Two inks: the road and outlines in a soft grey, one accent in brand blue.
  const line = 'text-gray-300';
  const accent = 'text-brand-400';
  return (
    <svg viewBox="0 0 160 90" width="160" height="90" aria-hidden className="max-w-full">
      {/* The ground every drawing stands on: a road running into the distance. */}
      <g className={line} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M10 78 H150" />
        <path d="M58 78 L74 52 M102 78 L86 52" />
        <path d="M80 75 v-4 M80 66 v-3 M80 59 v-2" strokeDasharray="0" />
      </g>
      {art === 'road' && (
        <g className={accent} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
          {/* A truck waiting at the side of the road. */}
          <rect x="112" y="56" width="26" height="14" rx="1.5" />
          <path d="M138 61 h7 l4 5 v4 h-11 z" />
          <circle cx="119" cy="72" r="3" fill="currentColor" stroke="none" />
          <circle cx="143" cy="72" r="3" fill="currentColor" stroke="none" />
        </g>
      )}
      {art === 'calendar' && (
        <g className={accent} fill="none" stroke="currentColor" strokeWidth="1.6">
          <rect x="60" y="14" width="40" height="34" rx="3" />
          <path d="M60 24 H100 M70 10 v8 M90 10 v8" />
          <circle cx="80" cy="36" r="4" fill="currentColor" stroke="none" />
        </g>
      )}
      {art === 'people' && (
        <g className={accent} fill="none" stroke="currentColor" strokeWidth="1.6">
          <circle cx="68" cy="24" r="7" />
          <path d="M56 46 c2-9 22-9 24 0" />
          <circle cx="94" cy="26" r="6" />
          <path d="M84 46 c2-8 18-8 20 0" />
        </g>
      )}
      {art === 'list' && (
        <g className={accent} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <rect x="58" y="10" width="44" height="40" rx="3" />
          <path d="M66 21 h28 M66 30 h22 M66 39 h16" />
        </g>
      )}
      {art === 'office' && (
        <g className={accent} fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M62 48 V18 h36 v30" />
          <path d="M70 26 h6 M84 26 h6 M70 34 h6 M84 34 h6" />
          <path d="M76 48 v-7 h8 v7" />
        </g>
      )}
    </svg>
  );
}

// ── Staged actions from search ──────────────────────────────────────────────

/**
 * What the search box asked this page to stage — `?stage=reminderEmails:off`
 * — for one key. Read from the address once on arrival (not through
 * `useSearchParams`, which would need a Suspense boundary on every page) and
 * then dropped from it, so a reload does not stage it again.
 */
export function useStagedAction(key: string): string | null {
  const [value, setValue] = useState<string | null>(null);
  useEffect(() => {
    const url = new URL(window.location.href);
    const stage = url.searchParams.get('stage');
    if (!stage || !stage.startsWith(`${key}:`)) return;
    setValue(stage.slice(key.length + 1));
    url.searchParams.delete('stage');
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
  }, [key]);
  return value;
}
