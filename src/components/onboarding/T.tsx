'use client';

import { EsLine } from '@/components/spanish/Es';
import { useSpanish } from '@/context/SpanishContext';
import type { Bilingual } from '@/types/onboarding';

/**
 * Bilingual text from the onboarding content: the English, and with the
 * Spanish switch on, the Spanish line under it. The whole of My onboarding is
 * written in both languages in its data files, so nothing here goes through
 * the dictionary in src/lib/i18n.
 */
export function T({ v, className }: { v: Bilingual; className?: string }) {
  return (
    <>
      {v.en}
      <EsLine className={className}>{v.es}</EsLine>
    </>
  );
}

/**
 * For places with room for one string only — a placeholder, a title, a
 * button too small for a second line. Spanish on means Spanish there, with
 * the English kept on the hover title by the caller where it helps.
 */
export function useBi(): (v: Bilingual) => string {
  const { on } = useSpanish();
  return (v) => (on ? v.es : v.en);
}
