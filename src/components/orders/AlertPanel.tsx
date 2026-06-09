'use client';

import Link from 'next/link';
import type { OrderAlert } from '@/lib/alerts';

const CRITICAL = {
  row:   'bg-red-50 border-red-200',
  dot:   'bg-red-500',
  badge: 'bg-red-100 text-red-700',
  msg:   'text-red-900',
  sub:   'text-red-700',
  link:  'text-red-700 hover:text-red-900',
};

const WARNING = {
  row:   'bg-yellow-50 border-yellow-200',
  dot:   'bg-yellow-400',
  badge: 'bg-yellow-100 text-yellow-700',
  msg:   'text-yellow-900',
  sub:   'text-yellow-700',
  link:  'text-yellow-700 hover:text-yellow-900',
};

export default function AlertPanel({ alerts }: { alerts: OrderAlert[] }) {
  if (alerts.length === 0) return null;

  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-3">
        <svg className="w-4 h-4 text-red-500 shrink-0" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
        </svg>
        <h2 className="font-semibold text-gray-800">Needs Attention</h2>
        <span className="text-xs font-bold bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
          {alerts.length}
        </span>
      </div>

      <div className="space-y-2">
        {alerts.map((alert) => {
          const s = alert.severity === 'critical' ? CRITICAL : WARNING;
          return (
            <div
              key={alert.orderId}
              className={`flex items-center justify-between rounded-lg border px-4 py-3 ${s.row}`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className={`w-2 h-2 rounded-full shrink-0 ${s.dot}`} />
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${s.badge}`}>
                  {alert.orderNumber}
                </span>
                <span className={`text-sm truncate ${s.sub}`}>
                  {alert.shipperName}
                </span>
                <span className="text-gray-300 shrink-0">—</span>
                <span className={`text-sm font-medium ${s.msg}`}>
                  {alert.message}
                </span>
              </div>
              <Link
                href={`/dashboard/orders/${alert.orderId}`}
                className={`text-xs font-semibold shrink-0 ml-4 ${s.link}`}
              >
                View →
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
