import { roleLabels } from '@/types/allowedUser';
import { ROLE_DETAILS, ROLE_LABELS, ROLE_ORDER, type RoleFlagSet } from '@/types/permission';

/**
 * What somebody does, as chips.
 *
 * The directory used to say where a colleague sits and how to reach them, and
 * nothing about what they do — so "who do I ask about this load?" was a
 * question the phone book could not answer. These are the same labels the
 * access list uses, drawn from the same catalog, so a person cannot read as a
 * Dispatcher on one screen and something else on another.
 *
 * Broker is spelled out rather than left blank. It is the default and most of
 * the company holds it, and an empty space next to a name reads as "not loaded"
 * rather than "the ordinary one".
 *
 * Deliberately not shown here: anything granted to somebody individually. See
 * the note on DirectoryPerson — a role is ordinary working information, a
 * permission is between that person and an admin.
 */
export default function RoleBadges({
  person,
  size = 'normal',
}: {
  person: RoleFlagSet;
  /** `small` for the list view, where the chip shares a row with eight columns. */
  size?: 'normal' | 'small';
}) {
  const pad = size === 'small'
    ? 'px-1.5 py-0.5 text-[10px]'
    : 'px-2 py-0.5 text-[11px]';

  const labels = roleLabels(person);

  /** The tooltip: what the role means, in the words the access screen uses. */
  const detail = (label: string) => {
    const role = ROLE_ORDER.find((r) => ROLE_LABELS[r] === label);
    return role
      ? ROLE_DETAILS[role]
      : 'The default — their own clients and loads, and nothing they do not own.';
  };

  return (
    <div className="flex flex-wrap items-center gap-1">
      {labels.map((label) => (
        <span
          key={label}
          title={detail(label)}
          /* Admin reads differently from the rest on purpose. It is the one
             role where knowing at a glance is worth a second colour — the
             others are all "who does this job", and this one is "who can
             change anything". */
          className={`rounded-md border font-medium ${pad} ${
            label === 'Admin'
              ? 'border-brand-200 bg-brand-50 text-brand-700'
              : 'border-gray-200 bg-gray-50 text-gray-600'
          }`}
        >
          {label}
        </span>
      ))}
    </div>
  );
}
