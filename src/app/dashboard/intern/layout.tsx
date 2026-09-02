'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

/**
 * The intern's own corner of TTMS: their guide, their onboarding survey and
 * their task list.
 *
 * An intern holds three permissions and this is the only one of them that is a
 * section of their own — the directory and chat are things everybody has. It
 * exists because the alternative was an account that signs in to a sidebar
 * with nothing on it and a dashboard about loads they cannot open.
 *
 * The three pages under here are deliberately empty for now. They are routes
 * rather than a single "coming soon" page because each is a different piece of
 * work with a different shape — a document, a form and a checklist — and
 * building them as one page would mean pulling it apart again.
 *
 * Gated in the layout rather than in each page, the same way Settings is: a
 * page added under here cannot be added without the check.
 */

const TABS = [
  { href: '/dashboard/intern',        label: 'Guide'  },
  { href: '/dashboard/intern/survey', label: 'Onboarding survey' },
  { href: '/dashboard/intern/tasks',  label: 'Tasks'  },
];

export default function InternLayout({ children }: { children: React.ReactNode }) {
  const { can, loading } = useAuth();
  const router   = useRouter();
  const pathname = usePathname();

  const allowed = can('intern.section');

  useEffect(() => {
    if (!loading && !allowed) router.replace('/dashboard');
  }, [loading, allowed, router]);

  if (loading || !allowed) return null;

  return (
    <div className="p-8 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My onboarding</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Everything you need for your first weeks at Total Transport Logistics.
        </p>
      </div>

      <nav className="mt-5 flex gap-1 border-b border-gray-200">
        {TABS.map((tab) => {
          // Guide is the parent of the other two, so it matches exactly —
          // a prefix test would leave it lit on every tab.
          const current = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={current ? 'page' : undefined}
              className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition ${
                current
                  ? 'border-brand-600 text-brand-700'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      <div className="pt-6">{children}</div>
    </div>
  );
}
