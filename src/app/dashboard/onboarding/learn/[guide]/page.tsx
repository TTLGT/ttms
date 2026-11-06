'use client';

import { use } from 'react';
import Link from 'next/link';
import GuideView from '@/components/onboarding/GuideView';
import { guideById } from '@/lib/onboarding/guides';
import { useBi } from '@/components/onboarding/T';

export default function GuidePage({ params }: { params: Promise<{ guide: string }> }) {
  const { guide: id } = use(params);
  const guide = guideById(id);
  const bi = useBi();
  if (!guide) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center">
        <p className="text-sm text-gray-600">{bi({ en: 'That guide does not exist any more.', es: 'Esa guía ya no existe.' })}</p>
        <Link href="/dashboard/onboarding/learn" className="mt-3 inline-block text-sm font-medium text-brand-700">{bi({ en: 'See all guides', es: 'Ver todas las guías' })}</Link>
      </div>
    );
  }
  return <GuideView guide={guide} />;
}
