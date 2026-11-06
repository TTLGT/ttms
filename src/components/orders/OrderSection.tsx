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

export function SectionHeading({ icon: Icon, tone, title, action, sub }: {
  icon: LucideIcon;
  tone: SectionTone;
  title: string;
  /** Drawn at the right — the section's Edit link, as before. */
  action?: React.ReactNode;
  /** A line under the title, for the few sections that need one. */
  sub?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 mb-4">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${TONE[tone]}`}>
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <h3 data-es className="text-base font-semibold text-gray-900">{title}</h3>
        {sub && <div className="text-xs text-gray-500">{sub}</div>}
      </div>
      {action}
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
