'use client';

import { Ban, Pencil, RotateCcw, Trash2, X } from 'lucide-react';
import type { AllowedUser } from '@/types/allowedUser';

/**
 * Edit, suspend and remove, for one person.
 *
 * Shared by the cards and the list so the three buttons sit in the same order
 * with the same rules everywhere — the one on the right deletes somebody's
 * access, and that is not a thing to have drawn twice from two copies.
 *
 * Nothing here is hidden when it is not allowed: an admin cannot suspend or
 * remove themselves, and neither can anybody touch a bootstrap admin, so those
 * buttons are disabled and say why on hover. A button that vanishes leaves the
 * reader wondering whether they misremembered it.
 */
export default function PersonActions({
  person,
  editing,
  suspended,
  isSelf,
  isProtected,
  busy,
  canRemove = true,
  onEdit,
  onSuspend,
  onRevoke,
}: {
  person: AllowedUser;
  /** True when this person's editor is the one open. */
  editing: boolean;
  suspended: boolean;
  isSelf: boolean;
  isProtected: boolean;
  busy: string | null;
  /**
   * Whether this reader may take the person off the system entirely.
   *
   * False for a Sales Manager, who can edit and suspend the people on their
   * team but not remove them: removal deletes the account and archives their
   * payroll details, which is a company-level act rather than a team one. The
   * button is drawn dead rather than hidden, so the answer to "why can I not
   * remove them" is on screen instead of being an absence.
   */
  canRemove?: boolean;
  /** Opens the editor, or closes it when it is already this person's. */
  onEdit: (person: AllowedUser) => void;
  onSuspend: (person: AllowedUser) => void;
  onRevoke: (person: AllowedUser) => void;
}) {
  return (
    <div className="flex flex-shrink-0 items-center gap-1.5">
      <button
        onClick={() => onEdit(person)}
        title="Edit name, phone, extension and site"
        className={`rounded-lg border p-1.5 transition ${
          editing
            ? 'border-brand-300 bg-brand-50 text-brand-700'
            : 'border-gray-200 text-gray-400 hover:bg-gray-50 hover:text-gray-600'
        }`}
      >
        {editing ? <X size={14} /> : <Pencil size={14} />}
      </button>

      <button
        onClick={() => onSuspend(person)}
        disabled={isSelf || isProtected || busy === `${person.email}:suspend`}
        title={
          isSelf
            ? 'You cannot suspend your own access'
            : isProtected
            ? 'Protected accounts cannot be suspended'
            : suspended
            ? 'Restore access'
            : 'Suspend access temporarily'
        }
        className={`rounded-lg border p-1.5 transition ${
          isSelf || isProtected
            ? 'border-gray-200 text-gray-300 cursor-not-allowed'
            : suspended
            ? 'border-green-200 text-green-600 hover:bg-green-50'
            : 'border-gray-200 text-gray-400 hover:bg-amber-50 hover:text-amber-600 hover:border-amber-200'
        }`}
      >
        {suspended ? <RotateCcw size={14} /> : <Ban size={14} />}
      </button>

      <button
        onClick={() => onRevoke(person)}
        disabled={!canRemove || isSelf || isProtected || busy === `${person.email}:revoke`}
        title={
          !canRemove
            ? 'Only an admin can remove someone from the system'
            : isSelf
            ? 'You cannot remove your own access'
            : isProtected
            ? 'Protected accounts cannot be removed here'
            : 'Remove access'
        }
        className={`rounded-lg border p-1.5 transition ${
          !canRemove || isSelf || isProtected
            ? 'border-gray-200 text-gray-300 cursor-not-allowed'
            : 'border-gray-200 text-gray-400 hover:bg-red-50 hover:text-red-600 hover:border-red-200'
        }`}
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}
