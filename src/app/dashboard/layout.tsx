'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import {
  LayoutDashboard,
  ClipboardList,
  Truck,
  Building2,
  PackageCheck,
  ShieldCheck,
  Users,
  Folder,
  BarChart2,
  Settings,
  LucideIcon,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { listAccessRequests } from '@/lib/parties';

const NAV_ITEMS: { href: string; label: string; Icon: LucideIcon; adminOnly: boolean }[] = [
  { href: '/dashboard',           label: 'Dashboard', Icon: LayoutDashboard, adminOnly: false },
  { href: '/dashboard/orders',    label: 'Orders',    Icon: ClipboardList,   adminOnly: false },
  { href: '/dashboard/carriers',  label: 'Carriers',  Icon: Truck,           adminOnly: false },
  { href: '/dashboard/clients',   label: 'Clients',   Icon: Users,           adminOnly: false },
  { href: '/dashboard/shippers',  label: 'Shippers',  Icon: Building2,       adminOnly: false },
  { href: '/dashboard/consignees', label: 'Consignees', Icon: PackageCheck,  adminOnly: false },
  { href: '/dashboard/approvals', label: 'Approvals', Icon: ShieldCheck,      adminOnly: false },
  { href: '/dashboard/documents', label: 'Documents', Icon: Folder,          adminOnly: false },
  { href: '/dashboard/analytics', label: 'Analytics', Icon: BarChart2,       adminOnly: true  },
  { href: '/dashboard/settings',  label: 'Settings',  Icon: Settings,        adminOnly: true  },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout, isAdmin } = useAuth();
  const router                             = useRouter();
  const [pendingApprovals, setPending]     = useState(0);

  // A request that nobody notices blocks the requester's order, so the count
  // sits in the nav rather than only on the Approvals screen.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    listAccessRequests('incoming')
      .then((rs) => { if (!cancelled) setPending(rs.filter((r) => r.status === 'pending').length); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [user]);

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
        <div className="px-4 py-4 border-b border-brand-700 flex items-center gap-3">
          <Image src="/logo-circle.png" alt="TTL" width={44} height={44} className="flex-shrink-0" />
          <div>
            <p className="font-[family-name:var(--font-rajdhani)] text-3xl font-bold tracking-[0.2em] pl-[0.2em] leading-tight text-white">TTMS</p>
            <p className="text-[10px] font-medium uppercase tracking-widest text-blue-300 mt-0.5">Total Transportation Management System</p>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin).map(({ href, label, Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-blue-100 hover:bg-brand-700 hover:text-white transition"
            >
              <Icon size={16} className="flex-shrink-0" />
              <span className="flex-1">{label}</span>
              {href === '/dashboard/approvals' && pendingApprovals > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-amber-400 text-brand-900 text-[10px] font-bold">
                  {pendingApprovals}
                </span>
              )}
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
