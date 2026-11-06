'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, ClipboardCheck, Map, Users } from 'lucide-react';
import { OnboardingProvider, useOnboarding } from '@/components/onboarding/OnboardingProvider';
import { useBi } from '@/components/onboarding/T';

/**
 * My onboarding: everybody's, interns included, so no permission gates the
 * section — what each person sees is their own programme. Team progress is
 * offered to `onboarding.manage` and to a Sales Manager with a team; the
 * routes behind it check for themselves.
 *
 * It replaced the intern-only area at /dashboard/intern (2026-11-05), which
 * now redirects here.
 */
export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <OnboardingProvider>
      <Shell>{children}</Shell>
    </OnboardingProvider>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data } = useOnboarding();
  const bi = useBi();
  const tabs = [
    { href: '/dashboard/onboarding', label: bi({ en: 'My journey', es: 'Mi recorrido' }), en: 'My journey', Icon: Map, exact: true },
    { href: '/dashboard/onboarding/learn', label: bi({ en: 'Learn', es: 'Aprender' }), en: 'Learn', Icon: BookOpen },
    { href: '/dashboard/onboarding/surveys', label: bi({ en: 'Surveys', es: 'Encuestas' }), en: 'Surveys', Icon: ClipboardCheck },
    ...(data && (data.manages || data.leadsTeam)
      ? [{ href: '/dashboard/onboarding/team', label: bi({ en: 'Team progress', es: 'Avance del equipo' }), en: 'Team progress', Icon: Users }]
      : []),
  ];
  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
      <nav className="flex gap-1 overflow-x-auto whitespace-nowrap border-b border-gray-200 tab-scroll [&>*]:flex-shrink-0">
        {tabs.map((t) => {
          const current = t.exact ? pathname === t.href : pathname.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={current ? 'page' : undefined}
              className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition ${
                current ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
              }`}
            >
              <t.Icon size={15} /> {t.label}
            </Link>
          );
        })}
      </nav>
      <div className="pt-6">{children}</div>
    </div>
  );
}
