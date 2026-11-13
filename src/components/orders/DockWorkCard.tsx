import Link from 'next/link';
import { ArrowDownToLine, ArrowUpFromLine, Building2, HardHat, PackageOpen, TriangleAlert, Truck, Warehouse } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Bi } from '@/components/spanish/Es';
import {
  DOCK_HELP_LABEL, DOCK_PARTY_LABEL, SERVICE_ARRANGER_LABEL,
  dockConditionsOf, dockEndOf, dockEndProblem, dockPartiesOdd,
  type DockEnd, type DockParty, type Order, type ServiceArranger,
} from '@/types/order';
import { SectionHeading } from './OrderSection';
import { Pill } from './DetailBits';

/** A picture for each answer, on its tag. */
const PARTY_ICON: Record<DockParty, LucideIcon> = {
  shipper: Warehouse, consignee: Building2, driver: Truck, third_party: HardHat,
};

/** "Mechanic" → "a mechanic", "Rigging crew" → "a rigging crew"; an acronym keeps its capitals. */
function withArticle(word: string): string {
  const w = /^[A-Z][a-z]/.test(word) ? word[0].toLowerCase() + word.slice(1) : word;
  return `${/^[aeiou]/i.test(w) ? 'an' : 'a'} ${w}`;
}

function hirer(by: ServiceArranger): React.ReactNode {
  return by === 'ttl'
    ? <><strong className="font-semibold">TTL</strong> hires them.</>
    : <>The <strong className="font-semibold">{SERVICE_ARRANGER_LABEL[by].toLowerCase()}</strong> hires them.</>;
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function End({ order, end }: { order: Order; end: DockEnd }) {
  const { by, help } = dockEndOf(order, end);
  const problem = dockEndProblem(order, end);
  const conditions = dockConditionsOf(order, end);
  const what = help?.service === 'other' ? help.label?.trim() || '' : help?.service ? DOCK_HELP_LABEL[help.service] : '';
  const verb = end === 'pickup' ? 'loads it' : 'unloads it';
  const Dir = end === 'pickup' ? ArrowDownToLine : ArrowUpFromLine;
  const provider = help?.providerId ? (
    <Link href={`/dashboard/providers/${help.providerId}`} className="font-medium text-brand-600 hover:underline">
      {help.providerName || 'the provider'}
    </Link>
  ) : null;

  // The answer said as a sentence. Built from pieces at run time, so it has
  // no Spanish line; the tags under it carry the same facts as words that do.
  // Several parties (2026-11-12) are joined: "The shipper and a forklift from
  // Acme load it. TTL hires them."
  const third = by.includes('third_party');
  const named = by.filter((p) => p !== 'third_party');
  let sentence: React.ReactNode;
  if (!by.length) {
    sentence = <span className="text-amber-800">Nobody is set to do this yet.</span>;
  } else {
    const parts: React.ReactNode[] = named.map((p, i) => (
      <span key={p}>{i === 0 ? 'The' : 'the'} <strong className="font-semibold">{DOCK_PARTY_LABEL[p].toLowerCase()}</strong></span>
    ));
    if (third) {
      // "A mechanic from Test Mechanic LLC loads it. TTL hires them."
      const [article, ...noun] = (what ? withArticle(what) : 'a 3rd party').split(' ');
      parts.push(
        <span key="third_party">
          {parts.length ? article : capitalise(article)} <strong className="font-semibold">{noun.join(' ')}</strong>
          {provider && <> from {provider}</>}
        </span>,
      );
    }
    const joined = parts.flatMap((p, i) => (i === 0 ? [p] : [i === parts.length - 1 ? ' and ' : ', ', p]));
    const plural = parts.length > 1 ? (end === 'pickup' ? 'load it' : 'unload it') : verb;
    sentence = (
      <>
        {joined} {plural}.
        {third && help?.hiredBy && <> {hirer(help.hiredBy)}</>}
      </>
    );
  }

  return (
    <div className={`min-w-0 rounded-xl border p-4 ${problem ? 'border-amber-200 bg-amber-50' : 'border-gray-200 bg-gray-50'}`}>
      <p className={`inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide ${end === 'pickup' ? 'text-blue-700' : 'text-green-700'}`}>
        <Dir className="h-3.5 w-3.5" />
        <span data-es>{end === 'pickup' ? 'At pickup' : 'At delivery'}</span>
      </p>

      <p className="mt-2 text-[15px] leading-relaxed text-gray-900">{sentence}</p>

      {by.length > 0 && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {by.map((p) => <Pill key={p} tone="violet" icon={PARTY_ICON[p]}>{DOCK_PARTY_LABEL[p]}</Pill>)}
          {third && (what
            ? <Pill tone="violet">{what}</Pill>
            : <Pill tone="amber">Service not set</Pill>)}
          {third && (help?.hiredBy
            ? <Pill tone="gray">Hired by {SERVICE_ARRANGER_LABEL[help.hiredBy]}</Pill>
            : <Pill tone="amber">Who hires them is not set</Pill>)}
        </div>
      )}

      {dockPartiesOdd(by) && (
        <p className="mt-2 flex gap-1.5 text-xs text-amber-800">
          <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" />
          <Bi>Both the shipper and the consignee are set to work this dock. That is unusual — check it is right.</Bi>
        </p>
      )}

      {conditions && (
        <div className="mt-3 rounded-lg border border-gray-200 bg-white px-3 py-2">
          <p data-es className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">At the dock</p>
          <p className="mt-0.5 whitespace-pre-line text-sm text-gray-800">{conditions}</p>
        </div>
      )}

      {problem && (
        <p className="mt-3 flex gap-1.5 text-xs text-amber-800">
          <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>{problem} <Bi>Needed before the SA, the Dispatch Sheet or the BOL goes out.</Bi></span>
        </p>
      )}
    </div>
  );
}

/**
 * Loading and Unloading on the order page — who does the work at each end
 * and, for a 3rd party, what it is and who hires them. Drawn on every load
 * from the quote on, empty or not, so the gap shows before the SA is asked
 * for rather than at the dock.
 *
 * Pickup, the truck, delivery, from left to right (2026-11-11, chosen by the
 * office from a set of drafts): each end said as one sentence, the same facts
 * as tags under it, and the dock instructions in a box of their own.
 */
export default function DockWorkCard({ order, action }: { order: Order; action?: React.ReactNode }) {
  return (
    <div id="dock" className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6 scroll-mt-4">
      <SectionHeading icon={PackageOpen} tone="rose" title="Loading and Unloading" action={action}
        sub={<Bi>Printed on the SA, the Dispatch Sheet and the BOL.</Bi>}
        summary={(['pickup', 'delivery'] as const).map((end) => {
          const { by, help } = dockEndOf(order, end);
          const what = help?.service === 'other' ? help.label?.trim() || '' : help?.service ? DOCK_HELP_LABEL[help.service] : '';
          const crew = [what, help?.providerName].filter(Boolean).join(', ');
          const who = by.map((p) => (p === 'third_party' && crew ? `${DOCK_PARTY_LABEL[p]} (${crew})` : DOCK_PARTY_LABEL[p])).join(', ');
          return `${end === 'pickup' ? 'Loads' : 'Unloads'}: ${who || 'not set'}`;
        }).join(' · ')} />
      <div className="grid grid-cols-1 items-center gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        <End order={order} end="pickup" />
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-gray-200 bg-gray-50 text-gray-400" aria-hidden>
          <Truck className="h-5 w-5 rotate-90 sm:rotate-0" />
        </div>
        <End order={order} end="delivery" />
      </div>
    </div>
  );
}
