'use client';

import { isBroker } from '@/lib/accessControl';
import { ROLE_CHIPS, roleLabels } from '@/types/allowedUser';
import type { AllowedUser, AllowedUserRole } from '@/types/allowedUser';

/**
 * What someone is allowed to do, as a row of chips — clickable for an admin,
 * plain text for HR.
 *
 * HR reads this page and cannot act on it, so they get words instead of a row
 * of greyed-out buttons: what a colleague is allowed to do is the first thing
 * anyone reads an access entry for, and disabled buttons would only invite a
 * support call asking why none of them work.
 *
 * Shared by all three views on purpose. Roles are the subject of this page, so
 * they are drawn the same way and are never among the details the Show picker
 * can hide — the answer to "what can this person do" must not be something a
 * reader can switch off by accident.
 */
export default function PersonRoles({
  person,
  canEdit,
  suspended,
  isSelf,
  isProtected,
  busy,
  onMakeBroker,
  onToggle,
  size = 'normal',
}: {
  person: AllowedUser;
  canEdit: boolean;
  suspended: boolean;
  /** The reader's own entry — an admin may not take their own admin away. */
  isSelf: boolean;
  /** A bootstrap admin: the lockout escape hatch, never demotable. */
  isProtected: boolean;
  /** The `${email}:${role}` key of whatever write is in flight, or null. */
  busy: string | null;
  onMakeBroker: (person: AllowedUser) => void;
  onToggle: (person: AllowedUser, field: AllowedUserRole) => void;
  /** `small` for the list view, where five chips share a row with everything else. */
  size?: 'normal' | 'small';
}) {
  // Same chips either way, drawn tighter in the list. Small is a padding
  // change and nothing else: a role that reads differently in one view from
  // another is the kind of thing that gets a permission misread.
  const pad = size === 'small' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs';

  if (!canEdit) {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {roleLabels(person).map((label) => (
          <span
            key={label}
            className={`rounded-lg border border-gray-200 bg-gray-50 font-medium text-gray-600 ${pad}`}
          >
            {label}
          </span>
        ))}
      </div>
    );
  }

  const chipClass = (active: boolean, locked: boolean) =>
    `rounded-lg border font-medium transition ${pad} ${
      locked
        ? 'border-gray-200 text-gray-300 cursor-not-allowed'
        : active && suspended
        ? 'border-gray-200 bg-gray-100 text-gray-500'
        : active
        ? 'border-brand-200 bg-brand-50 text-brand-700'
        : 'border-gray-200 text-gray-500 hover:bg-gray-50'
    }`;

  const brokerActive = isBroker(person);
  // Demoting to broker means dropping admin, which these two accounts are
  // never allowed to do.
  const brokerLocked = (isSelf && person.isAdmin) || (isProtected && person.isAdmin);
  const brokerBusy   = busy === `${person.email}:broker`;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        onClick={() => onMakeBroker(person)}
        disabled={brokerActive || brokerLocked || brokerBusy}
        title={
          brokerLocked
            ? 'This admin role cannot be removed'
            : brokerActive
            ? 'The default role — their own clients and loads'
            : 'Remove the other roles and leave them a broker'
        }
        className={`${chipClass(brokerActive, brokerLocked)} ${
          brokerActive && !brokerLocked && !suspended ? 'cursor-default' : ''
        }`}
      >
        {brokerBusy ? '…' : 'Broker'}
      </button>

      {ROLE_CHIPS.map(({ field, label }) => {
        const active = !!person[field];
        // Roles stay editable while suspended — they are what the person comes
        // back to — but read as inactive.
        const locked  = field === 'isAdmin' && (isSelf || isProtected);
        const working = busy === `${person.email}:${field}`;
        return (
          <button
            key={field}
            onClick={() => onToggle(person, field)}
            disabled={locked || working}
            title={locked ? 'This admin role cannot be removed' : undefined}
            className={chipClass(active, locked)}
          >
            {working ? '…' : label}
          </button>
        );
      })}
    </div>
  );
}
