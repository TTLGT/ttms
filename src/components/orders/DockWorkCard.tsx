import Link from 'next/link';
import { PackageOpen } from 'lucide-react';
import { Bi } from '@/components/spanish/Es';
import { DOCK_HELP_LABEL, DOCK_PARTY_LABEL, SERVICE_ARRANGER_LABEL, dockEndOf, dockEndProblem, type DockEnd, type Order } from '@/types/order';
import { SectionHeading } from './OrderSection';

function End({ order, end }: { order: Order; end: DockEnd }) {
  const { by, help } = dockEndOf(order, end);
  const problem = dockEndProblem(order, end);
  const what = help?.service === 'other' ? help.label?.trim() || 'Other' : help?.service ? DOCK_HELP_LABEL[help.service] : '';
  return (
    <div className={`rounded-xl border p-4 ${problem ? 'border-amber-200 bg-amber-50' : 'border-gray-200'}`}>
      <p data-es className="text-xs font-semibold uppercase tracking-wide text-gray-500">
        {end === 'pickup' ? 'Loading at pickup' : 'Unloading at delivery'}
      </p>
      <p className="mt-1 text-base font-semibold text-gray-900">
        {by ? <span data-es>{DOCK_PARTY_LABEL[by]}</span> : <span data-es className="text-amber-700">Not set</span>}
      </p>
      {by === 'third_party' && (
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt data-es className="text-gray-500">What</dt>
          <dd className="text-gray-900">{what || <span data-es className="text-amber-700">Not set</span>}</dd>
          {help?.providerId && (<>
            <dt data-es className="text-gray-500">Provider</dt>
            <dd>
              <Link href={`/dashboard/providers/${help.providerId}`} className="font-medium text-brand-700 hover:underline">
                {help.providerName || 'Open provider'}
              </Link>
            </dd>
          </>)}
          <dt data-es className="text-gray-500">Hired by</dt>
          <dd className="text-gray-900">
            {help?.hiredBy ? <span data-es>{SERVICE_ARRANGER_LABEL[help.hiredBy]}</span> : <span data-es className="text-amber-700">Not set</span>}
          </dd>
        </dl>
      )}
      {problem && <p className="mt-2 text-xs text-amber-800">{problem} <Bi>Needed before the SA is sent.</Bi></p>}
    </div>
  );
}

/**
 * Loading and Unloading on the order page — who does the work at each end
 * and, for a 3rd party, what it is and who hires them. Drawn on every load
 * from the quote on, empty or not, so the gap shows before the SA is asked
 * for rather than at the dock.
 */
export default function DockWorkCard({ order, action }: { order: Order; action?: React.ReactNode }) {
  return (
    <div id="dock" className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6 scroll-mt-4">
      <SectionHeading icon={PackageOpen} tone="rose" title="Loading and Unloading" action={action}
        sub={<Bi>Printed on the SA, the Dispatch Sheet and the BOL.</Bi>} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <End order={order} end="pickup" />
        <End order={order} end="delivery" />
      </div>
    </div>
  );
}
