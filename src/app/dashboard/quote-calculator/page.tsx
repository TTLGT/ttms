'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Settings } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import QuoteCalculator from '@/components/quotes/QuoteCalculator';

/**
 * The quote calculator on its own, for a price asked for on the phone before
 * there is an order to put it on. The same calculator opens over the order
 * form from Price and Terms, where it can write its answer into the order.
 *
 * Gated on `orders.create` like the nav item: an intern has no loads to price.
 * The rates themselves are gated again by /api/quote-rates — this is the
 * courtesy, that is the boundary.
 */
export default function QuoteCalculatorPage() {
  const { can, loading } = useAuth();
  const router = useRouter();
  const allowed = can('orders.create') || can('quoteRates.manage') || can('settings.manage');
  const canEditRates = can('quoteRates.manage') || can('settings.manage');

  useEffect(() => {
    if (!loading && !allowed) router.replace('/dashboard');
  }, [loading, allowed, router]);

  if (loading || !allowed) return null;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Quote calculator</h1>
          <p className="text-sm text-gray-500 mt-1">
            What to charge the client, what to pay the driver, and what is left as our fee.
            Everything updates as you type; nothing here is saved.
          </p>
        </div>
        {canEditRates && (
          <Link href="/dashboard/settings/operations#quote-rates"
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
            <Settings className="w-3.5 h-3.5" />
            Edit rates
          </Link>
        )}
      </div>
      <QuoteCalculator />
    </div>
  );
}
