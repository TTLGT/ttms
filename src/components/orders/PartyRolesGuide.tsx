'use client';

import { Building2, PackageCheck, Truck } from 'lucide-react';
import { Bi } from '@/components/spanish/Es';

/**
 * Who is who on a load, in one strip above the client box on the order forms
 * (2026-11-11). New brokers mixed the three up — most often by putting the
 * client in as the shipper because "they are the one shipping it" — and the
 * mistake is not cosmetic: the SA goes to the client and quotes what they pay
 * us, so a facility entered as the client receives our rate.
 *
 * Each line answers one question a broker can actually ask on the phone. The
 * last line is there because the honest answer is often "the same company",
 * and people were unsure that was allowed.
 */
const ROWS = [
  {
    Icon: Building2, tone: 'text-brand-600 bg-brand-50',
    title: 'Client', q: 'Who pays us?',
    text: 'Gets the SA, signs it and is invoiced. Not always where the freight is.',
  },
  {
    Icon: Truck, tone: 'text-blue-600 bg-blue-50',
    title: 'Shipper', q: 'Where does the truck load?',
    text: 'The company at the pickup dock. One per pickup, in Route below.',
  },
  {
    Icon: PackageCheck, tone: 'text-green-600 bg-green-50',
    title: 'Consignee', q: 'Where does the truck unload?',
    text: 'Who receives the freight. One per delivery, in Route below.',
  },
] as const;

export default function PartyRolesGuide() {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {ROWS.map(({ Icon, tone, title, q, text }) => (
          <div key={title} className="flex items-start gap-2.5 min-w-0">
            <span className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${tone}`}>
              <Icon className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900">
                <span data-es>{title}</span> <span data-es className="font-normal text-gray-500">{q}</span>
              </p>
              <p className="text-xs text-gray-600 mt-0.5"><Bi>{text}</Bi></p>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-gray-600">
        <Bi>The same company can be more than one of these — a dealer shipping its own car is the client and the shipper. Pick the client first: Route then offers it as the shipper or consignee in one click.</Bi>
      </p>
    </div>
  );
}
