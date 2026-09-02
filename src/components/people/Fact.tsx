import type { LucideIcon } from 'lucide-react';
import CopyValue from '@/components/CopyValue';

/**
 * One fact about a person on a card: an icon, and a value that is allowed to
 * wrap onto a second line.
 *
 * Nothing in here truncates, and that is the point. These details used to be
 * joined into a single line ending in `truncate`, which quietly cut whatever
 * happened to sit last — in practice the office name, because it came after
 * the phone number and the extension. A card one line taller is a far smaller
 * problem than a card missing the answer someone opened it for.
 *
 * Renders two grid cells rather than its own box, so the parent owns the
 * column widths and every fact lines up down the card. The parent needs
 * `grid-cols-[14px_1fr]` or similar.
 */
export default function Fact({
  Icon,
  children,
  href,
  copy,
  copyLabel,
}: {
  Icon: LucideIcon;
  children: React.ReactNode;
  /** Makes the value a link — `tel:` or `mailto:` on the directory. */
  href?: string;
  /**
   * The exact text a copy button puts on the clipboard, when this is a fact
   * somebody retypes somewhere else. Passed in rather than taken from
   * `children`, which carries labelling the clipboard must not: "ext. 214" and
   * "GT 5512-8830" are read here and pasted without the prefix.
   */
  copy?: string;
  /** What is being copied, for the tooltip: "Copy work phone". */
  copyLabel?: string;
}) {
  const value = href ? (
    <a
      href={href}
      className="min-w-0 break-words text-xs text-gray-600 hover:text-brand-700 hover:underline"
    >
      {children}
    </a>
  ) : (
    <span className="min-w-0 break-words text-xs text-gray-600">{children}</span>
  );

  return (
    <>
      <Icon size={13} className="mt-0.5 flex-shrink-0 text-gray-400" />
      {copy ? <CopyValue value={copy} label={copyLabel ?? 'this'}>{value}</CopyValue> : value}
    </>
  );
}
