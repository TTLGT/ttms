'use client';

import { use, useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { getMonthlyUpdate } from '@/lib/monthlyUpdates';
import type { MonthlyUpdate } from '@/types/monthlyUpdate';

/**
 * A monthly update page, unlisted — see src/types/monthlyUpdate.ts.
 *
 * The report is its own complete HTML page with its own styles and scripts,
 * so it is drawn in a sandboxed frame rather than mixed into the app:
 * `allow-scripts` without `allow-same-origin` lets its demos run while giving
 * it no access to TTMS's cookies, storage or signed-in session. Its own
 * language switch remembers nothing as a result, which it already tolerates.
 *
 * The frame follows the TTMS theme the reader picked, through the report's
 * `data-theme` hook, rather than the computer's setting.
 */
export default function MonthlyUpdatePage({ params }: { params: Promise<{ month: string }> }) {
  const { month } = use(params);
  const { user } = useAuth();
  const [update, setUpdate] = useState<MonthlyUpdate | null>(null);
  const [error, setError] = useState('');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    if (!user) return;
    getMonthlyUpdate(month).then(setUpdate).catch((e) => setError(e.message));
  }, [user, month]);

  useEffect(() => {
    const root = document.documentElement;
    const read = () => setTheme(root.classList.contains('dark') ? 'dark' : 'light');
    read();
    const watch = new MutationObserver(read);
    watch.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => watch.disconnect();
  }, []);

  useEffect(() => {
    if (update) document.title = `${update.title} · TTMS`;
  }, [update]);

  if (error) {
    return <p className="p-6 text-sm text-red-700">{error}</p>;
  }
  if (!update) {
    return <p className="p-6 text-sm text-gray-500">Loading…</p>;
  }

  return (
    <iframe
      title={update.title}
      srcDoc={update.html.replace('<html>', `<html data-theme="${theme}">`)}
      sandbox="allow-scripts"
      className="block h-full w-full border-0"
    />
  );
}
