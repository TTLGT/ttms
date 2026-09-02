import type { LucideIcon } from 'lucide-react';

/**
 * The placeholder each intern page shows until its content is written.
 *
 * It says what will be here and who is writing it, rather than "coming soon".
 * An intern reading this is new, has been told to look at this screen, and the
 * useful thing to tell them is that the blank is expected and who to ask —
 * not that a feature is pending.
 */
export default function ComingSoon({
  Icon,
  title,
  detail,
}: {
  Icon: LucideIcon;
  title: string;
  detail: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-6 py-16 text-center">
      <Icon size={28} className="mx-auto text-gray-300" />
      <p className="mt-4 text-sm font-medium text-gray-900">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-gray-500">{detail}</p>
    </div>
  );
}
