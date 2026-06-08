'use client';

import { useAuth } from '@/context/AuthContext';

const STAT_CARDS = [
  { label: 'Active Orders',    value: '—', color: 'bg-blue-50  border-blue-200  text-blue-700'   },
  { label: 'Pending Pick-ups', value: '—', color: 'bg-yellow-50 border-yellow-200 text-yellow-700' },
  { label: 'In Transit',       value: '—', color: 'bg-purple-50 border-purple-200 text-purple-700' },
  { label: 'Delivered Today',  value: '—', color: 'bg-green-50  border-green-200  text-green-700'  },
];

export default function DashboardPage() {
  const { user } = useAuth();
  const firstName = user?.displayName?.split(' ')[0] ?? 'there';

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Good to see you, {firstName} 👋</h1>
        <p className="text-gray-500 mt-1 text-sm">Here&apos;s what&apos;s happening across your fleet today.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        {STAT_CARDS.map((card) => (
          <div key={card.label} className={`rounded-xl border px-5 py-5 ${card.color}`}>
            <p className="text-xs font-semibold uppercase tracking-wide opacity-70">{card.label}</p>
            <p className="text-3xl font-bold mt-1">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">Recent Orders</h2>
          <a href="/dashboard/orders" className="text-sm text-brand-500 hover:underline">View all →</a>
        </div>
        <div className="px-6 py-12 text-center text-gray-400 text-sm">
          No orders yet — create your first order to get started.
        </div>
      </div>
    </div>
  );
}
