'use client';

import Link from 'next/link';
import { AlertTriangle, CheckCircle2, ChevronRight, Info, XCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/**
 * The top of a record page — a carrier, a client, shipper or consignee, a 3rd
 * party provider — drawn the way the order page's load card is: who it is,
 * how it stands, and a row of numbers that answer "how much do we use them?"
 * before anybody scrolls.
 *
 * The numbers are worked out by each page from what it has already loaded
 * (its own orders, its own payments). This card fetches nothing, so it adds no
 * reads — the reason a stat that would need a query of its own is not on it.
 */

export interface HeroStat {
  label: string;
  value: React.ReactNode;
  /** A line under the value: "of 12", "3 this month". */
  note?: React.ReactNode;
  /** Draws the value in the money green, as the order card does for the fee. */
  emphasis?: boolean;
}

export default function RecordHero({ icon: Icon, iconTone, band, title, badges, sub, actions, stats }: {
  icon: LucideIcon;
  /** The icon tile's colours — the record kind's colour. */
  iconTone: string;
  /** The thin band across the top, as Tailwind gradient stops. */
  band: string;
  title: React.ReactNode;
  badges?: React.ReactNode;
  sub?: React.ReactNode;
  actions?: React.ReactNode;
  stats?: HeroStat[];
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className={`h-1 bg-gradient-to-r ${band}`} aria-hidden />
      <div className="space-y-5 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-4">
            <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${iconTone}`}>
              <Icon className="h-7 w-7" aria-hidden />
            </span>
            <div className="min-w-0">
              <h1 className="font-[family-name:var(--font-rajdhani)] text-2xl font-bold leading-tight text-gray-900 sm:text-3xl">{title}</h1>
              {badges && <div className="mt-1.5 flex flex-wrap items-center gap-1.5">{badges}</div>}
              {sub && <div className="mt-1.5 text-sm text-gray-500">{sub}</div>}
            </div>
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>

        {stats && stats.length > 0 && (
          <dl className="grid grid-cols-2 gap-x-5 gap-y-4 border-t border-gray-100 pt-4 tabular-nums sm:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label}>
                <dt data-es={s.label} className="text-[11px] font-medium text-gray-500">{s.label}</dt>
                <dd className={`text-lg font-semibold ${s.emphasis ? 'text-emerald-600' : 'text-gray-900'}`}>{s.value}</dd>
                {s.note && <dd className="text-xs text-gray-500">{s.note}</dd>}
              </div>
            ))}
          </dl>
        )}
      </div>
    </div>
  );
}

/** A small rounded label for the hero's badge row. */
export function HeroBadge({ tone = 'gray', children }: {
  tone?: 'brand' | 'green' | 'amber' | 'red' | 'gray';
  children: React.ReactNode;
}) {
  const cls = {
    brand: 'bg-brand-50 text-brand-700',
    green: 'bg-green-50 text-green-700',
    amber: 'bg-amber-50 text-amber-700',
    red:   'bg-red-50 text-red-700',
    gray:  'bg-gray-100 text-gray-600',
  }[tone];
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>{children}</span>;
}

export type AttentionLevel = 'bad' | 'warn' | 'info';

export interface Attention {
  /** Stable key for the list. */
  id: string;
  level: AttentionLevel;
  title: string;
  sub?: React.ReactNode;
  /** A section on the page ("#insurance"), or another page. */
  href?: string;
  onClick?: () => void;
}

const LEVEL: Record<AttentionLevel, { icon: LucideIcon; tile: string }> = {
  bad:  { icon: XCircle,       tile: 'bg-red-50 text-red-600' },
  warn: { icon: AlertTriangle, tile: 'bg-amber-50 text-amber-600' },
  info: { icon: Info,          tile: 'bg-gray-100 text-gray-500' },
};

/**
 * The rail's "Needs attention" card: what is missing or out of date on this
 * record, worst first, each line taking you to where it is fixed. When there
 * is nothing, it says so — an empty card reads as "did not load".
 */
export function AttentionCard({ items, allClear }: { items: Attention[]; allClear: string }) {
  const order: AttentionLevel[] = ['bad', 'warn', 'info'];
  const sorted = [...items].sort((a, b) => order.indexOf(a.level) - order.indexOf(b.level));
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4">
      <h2 data-es className="mb-3 text-sm font-semibold text-gray-900">Needs attention</h2>
      {sorted.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-green-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden /> <span data-es={allClear}>{allClear}</span>
        </p>
      ) : (
        <ul className="space-y-2">
          {sorted.map((a) => {
            const { icon: Icon, tile } = LEVEL[a.level];
            const body = (
              <>
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${tile}`}><Icon className="h-4 w-4" aria-hidden /></span>
                <span className="min-w-0 flex-1">
                  <span data-es={a.title} className="block text-sm font-medium text-gray-900">{a.title}</span>
                  {a.sub && <span className="block text-xs text-gray-500">{a.sub}</span>}
                </span>
                {(a.href || a.onClick) && <ChevronRight className="h-4 w-4 shrink-0 text-gray-400 transition group-hover:translate-x-0.5 group-hover:text-brand-600" aria-hidden />}
              </>
            );
            const base = 'flex w-full items-center gap-3 rounded-xl border border-gray-200 p-2.5 text-left';
            const cls = `group ${base} transition hover:border-brand-300 hover:shadow-sm`;
            return (
              <li key={a.id}>
                {a.onClick ? (
                  <button type="button" onClick={a.onClick} className={cls}>{body}</button>
                ) : a.href ? (
                  <Link href={a.href} className={cls}>{body}</Link>
                ) : (
                  <div className={base}>{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** A plain card in the rail, with a heading. */
export function RailCard({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 data-es className="text-sm font-semibold text-gray-900">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}

/**
 * The two-column body under the hero: the record on the left, the rail on the
 * right — sticky on a wide screen, and first on a narrow one so "needs
 * attention" is never below everything else. Same grid as the order page.
 */
export function RecordColumns({ rail, children }: { rail: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mt-6 grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <aside className="space-y-4 xl:sticky xl:top-4 xl:col-start-2 xl:row-start-1 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto xl:pb-1">
        {rail}
      </aside>
      <div className="min-w-0 space-y-6 xl:col-start-1 xl:row-start-1">{children}</div>
    </div>
  );
}

/**
 * A save bar that stays at the foot of the screen while a record is being
 * edited. Edit opens every section at once, so on a long record Save would
 * otherwise be a scroll back to the top away.
 */
export function EditBar({ saving, onSave, onCancel, label = 'Save Changes' }: {
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
  label?: string;
}) {
  return (
    <div className="sticky bottom-0 z-10 -mx-1 flex items-center justify-end gap-2 rounded-xl border border-gray-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur">
      <span data-es className="mr-auto text-sm text-gray-500">Editing — nothing is saved until you press Save.</span>
      <button type="button" onClick={onCancel} data-es
        className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50">
        Cancel
      </button>
      <button type="button" onClick={onSave} disabled={saving}
        className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50">
        {saving ? 'Saving…' : label}
      </button>
    </div>
  );
}
