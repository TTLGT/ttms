'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, Lock } from 'lucide-react';
import {
  PERMISSION_GROUPS,
  effectivePermissions,
  isPermission,
  roleGivenPermissions,
  type Permission,
} from '@/types/permission';
import type { AllowedUser } from '@/types/allowedUser';

/**
 * What one person is allowed to do, beyond what their role already gives them.
 *
 * The point of this panel is the distinction it draws. A permission is shown
 * one of three ways:
 *
 * - **Given by their role** — ticked and locked, with a padlock. It cannot be
 *   switched off here because permissions are additive: unticking it would do
 *   nothing, and a switch that does nothing is worse than no switch. Taking it
 *   away means changing the role.
 * - **Given to them individually** — ticked and removable. This is the set this
 *   panel actually writes.
 * - **Not held** — untickable into the set above.
 *
 * Collapsed by default. Most people have no individual grants at all, and an
 * access screen that opens with forty checkboxes on every card is one nobody
 * reads. The summary line says whether there is anything in here worth opening.
 */
export default function PersonPermissions({
  person,
  canEdit,
  /**
   * Which permissions this admin may hand over. A Sales Manager may only pass
   * on what they hold themselves, and the server enforces that independently —
   * this greys out the ones they would be refused rather than letting them
   * tick a box that fails on save.
   */
  grantable,
  busy,
  onSave,
}: {
  person: AllowedUser;
  canEdit: boolean;
  grantable: (permission: Permission) => boolean;
  busy: boolean;
  onSave: (permissions: Permission[]) => void;
}) {
  const [open, setOpen] = useState(false);

  const fromRole = useMemo(() => roleGivenPermissions(person), [person]);
  // Filtered rather than trusted: a key removed from the catalog can still be
  // sitting in a stored grant, and drawing a checkbox for it would offer to
  // toggle something nothing tests any more.
  const granted = useMemo(
    () => new Set((person.grantedPermissions ?? []).filter(isPermission)),
    [person],
  );

  /** Extras only — the ones their role does not already cover. */
  const extras = [...granted].filter((p) => !fromRole.has(p));

  const toggle = (key: Permission) => {
    const next = new Set(granted);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onSave([...next]);
  };

  const total = effectivePermissions(person, [...granted]).length;

  return (
    <div className="mt-3 border-t border-gray-100 pt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
          Permissions
        </span>
        <span className="flex items-center gap-1.5 text-[11px] text-gray-500">
          {extras.length > 0
            ? `${extras.length} added on top of their role`
            : `${total} from their role`}
          <ChevronDown
            size={13}
            className={`transition ${open ? 'rotate-180' : ''}`}
          />
        </span>
      </button>

      {open && (
        <div className="mt-3 space-y-4">
          {!canEdit && (
            <p className="text-[11px] text-gray-400">
              Read-only. Ask an admin to change what someone can do.
            </p>
          )}

          {PERMISSION_GROUPS.map((group) => (
            <div key={group.title}>
              <p className="text-[11px] font-medium text-gray-500">{group.title}</p>
              <div className="mt-1.5 space-y-1">
                {group.permissions.map(({ key, label, detail }) => {
                  const byRole  = fromRole.has(key);
                  const held    = byRole || granted.has(key);
                  // A role-given permission is locked rather than hidden: "why
                  // can this person do that" is answered by seeing it ticked
                  // with a padlock, and not at all by it being absent.
                  const locked  = !canEdit || byRole || !grantable(key);

                  return (
                    <label
                      key={key}
                      title={byRole ? `${detail} Comes with their role.` : detail}
                      className={`flex items-start gap-2 rounded-lg px-2 py-1.5 ${
                        locked ? 'opacity-70' : 'cursor-pointer hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={held}
                        disabled={locked || busy}
                        onChange={() => toggle(key)}
                        className="mt-0.5 h-3.5 w-3.5 rounded border-gray-300 text-brand-600 focus:ring-brand-400"
                      />
                      <span className="min-w-0">
                        <span className="flex items-center gap-1 text-xs text-gray-800">
                          {label}
                          {byRole && <Lock size={10} className="text-gray-400" />}
                        </span>
                        <span className="block text-[11px] leading-snug text-gray-400">
                          {detail}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
