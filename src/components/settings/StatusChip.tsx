'use client';

import type { AccessStatus } from '@/types/allowedUser';

const STATUS_CHIP: Record<AccessStatus, { label: string; className: string }> = {
  active:    { label: 'Active',    className: 'bg-green-50 text-green-700 border-green-200' },
  pending:   { label: 'Pending',   className: 'bg-amber-50 text-amber-700 border-amber-200' },
  suspended: { label: 'Suspended', className: 'bg-red-50 text-red-700 border-red-200' },
};

/**
 * The three states as a chip in the card's corner rather than a line of text
 * under the name — it is one word, and giving it a whole row was part of what
 * made the list so tall.
 */
export default function StatusChip({ status }: { status: AccessStatus }) {
  const { label, className } = STATUS_CHIP[status];
  return (
    <span
      className={`flex-shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${className}`}
      title={status === 'pending' ? 'Added, but has never signed in' : undefined}
    >
      {label}
    </span>
  );
}
