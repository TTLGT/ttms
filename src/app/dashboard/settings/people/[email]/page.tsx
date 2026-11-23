'use client';

import { use } from 'react';
import PersonPage from '@/components/settings/PersonPage';

/**
 * Settings → People → one person. Reached by anybody who can open People;
 * whether they can change anything is decided inside, per person, and again
 * by /api/admin/users.
 */
export default function Page({ params }: { params: Promise<{ email: string }> }) {
  const { email } = use(params);
  return <PersonPage email={email} />;
}
