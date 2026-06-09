'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';

const NAV_ITEMS = [
  { href: '/dashboard',            label: 'Dashboard',  icon: '▦',  adminOnly: false },
  { href: '/dashboard/orders',     label: 'Orders',     icon: '📋', adminOnly: false },
  { href: '/dashboard/carriers',   label: 'Carriers',   icon: '🚛', adminOnly: false },
  { href: '/dashboard/shippers',   label: 'Shippers',   icon: '🏢', adminOnly: false },
  { href: '/dashboard/customers',  label: 'Customers',  icon: '👤', adminOnly: false },
  { href: '/dashboard/documents',  label: 'Documents',  icon: '📁', adminOnly: false },
  { href: '/dashboard/settings',   label: 'Settings',   icon: '⚙️',  adminOnly: true  },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout, isAdmin } = useAuth();
  const router                             = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-60 flex-shrink-0 bg-brand-900 text-white flex flex-col">
        <div className="px-5 py-5 border-b border-brand-700">
          <p className="text-xs font-semibold uppercase tracking-widest text-blue-300 mb-0.5">Total Transport</p>
          <p className="text-lg font-bold leading-tight">TMS</p>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin).map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-blue-100 hover:bg-brand-700 hover:text-white transition"
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="px-4 py-4 border-t border-brand-700">
          <div className="flex items-center gap-3 mb-3">
            {user.photoURL && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.photoURL} alt="avatar" className="w-8 h-8 rounded-full" />
            )}
            <div className="overflow-hidden">
              <p className="text-sm font-medium text-white truncate">{user.displayName}</p>
              <p className="text-xs text-blue-300 truncate">{user.email}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="w-full text-xs text-blue-300 hover:text-white transition text-left"
          >
            Sign out →
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto bg-gray-50">
        {children}
      </main>
    </div>
  );
}
