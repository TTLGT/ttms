'use client';

import { useSpanish } from '@/context/SpanishContext';

/*
 * The Spanish line under a heading, a paragraph, a message — anywhere with
 * room for a second line. See SpanishContext for the whole arrangement.
 *
 * For anything small (a button, a tab, a column heading, a badge) do not use
 * these: put `data-es` on the element instead and SpanishTips shows the
 * Spanish in a bubble on hover. A second line there makes buttons twice as
 * tall and tables unreadable.
 *
 * Draws nothing when the switch is off or the phrase has no Spanish yet, so
 * wrapping a string is always safe.
 *
 * `data-learn-skip` keeps Learn English from underlining the Spanish, and
 * `lang="es"` lets a screen reader say it in Spanish.
 */

// One look for every Spanish line, wherever it sits: a muted teal in italics,
// slightly faded. Asked for so the Spanish reads as a separate layer at a
// glance rather than as more of the page's own grey text. Teal is one of the
// families tailwind.config.ts remaps for dark mode (700 becomes 300 there), so
// it stays readable on every theme. Keep it one colour everywhere — a line
// that takes its colour from the box it is in (red in an error, blue in a
// notice) stops looking like the Spanish.
const LINE = 'block mt-0.5 font-normal italic normal-case tracking-normal leading-snug text-[0.85em] text-teal-700/80';

interface EsProps {
  /** The English, exactly as the dictionary holds it. */
  children: string;
  vars?: Record<string, string | number>;
  /** Extra classes, for a background the teal cannot be read on. Rarely needed. */
  className?: string;
}

/** Only the Spanish line — for when the English beside it is built up in pieces. */
export function Es({ children, vars, className = '' }: EsProps) {
  const { es } = useSpanish();
  const spanish = es(children, vars);
  if (!spanish) return null;
  return (
    <span lang="es" data-learn-skip className={`${LINE} ${className}`}>
      {spanish}
    </span>
  );
}

/** The English, and the Spanish under it. The usual one. */
export function Bi({ children, vars, className }: EsProps) {
  return (
    <>
      {vars ? children.replace(/\{(\w+)\}/g, (w, n: string) => (n in vars ? String(vars[n]) : w)) : children}
      <Es vars={vars} className={className}>{children}</Es>
    </>
  );
}
