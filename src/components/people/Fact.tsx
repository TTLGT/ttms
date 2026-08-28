import type { LucideIcon } from 'lucide-react';

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
}: {
  Icon: LucideIcon;
  children: React.ReactNode;
  /** Makes the value a link — `tel:` or `mailto:` on the directory. */
  href?: string;
}) {
  return (
    <>
      <Icon size={13} className="mt-0.5 flex-shrink-0 text-gray-400" />
      {href ? (
        <a
          href={href}
          className="min-w-0 break-words text-xs text-gray-600 hover:text-brand-700 hover:underline"
        >
          {children}
        </a>
      ) : (
        <span className="min-w-0 break-words text-xs text-gray-600">{children}</span>
      )}
    </>
  );
}
