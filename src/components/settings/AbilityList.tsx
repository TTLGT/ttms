'use client';

import { useMemo, useState } from 'react';
import { Check, ChevronDown, Lock, Minus } from 'lucide-react';
import { PERMISSION_GROUPS, type Permission } from '@/types/permission';
import { Bi } from '@/components/spanish/Es';

/**
 * What somebody will be able to do, in plain sentences — "Can see every load",
 * "Can record payments" — grouped the way the permission catalog groups them.
 *
 * Built for the moment before access changes hands: ticking a role on Invite
 * people, or changing someone's roles on their page. With `before`, whatever
 * the change adds is marked green ("New") and whatever it takes away red, so
 * the consequence of a tick is read before anybody presses Save. Sensitive
 * abilities — the payroll fields, every client, money, the access list itself
 * — carry an amber flag, because those are the ones handed over by mistake.
 *
 * Reads only the catalog's own labels and details, so it cannot describe an
 * ability differently from the screen that grants it.
 */

/**
 * The abilities worth a second look before they are given. Reaching beyond
 * somebody's own book, touching money or pay, or changing who can do what.
 */
export const SENSITIVE: ReadonlySet<Permission> = new Set<Permission>([
  'orders.viewAll', 'clients.viewAll', 'shippers.viewAll', 'consignees.viewAll',
  'orders.delete', 'parties.delete', 'orders.payments', 'orders.waiveSignature',
  'people.view', 'people.manage', 'settings.manage', 'ownership.change',
  'access.grantOwnership', 'access.decideAny', 'attendance.view', 'attendance.manage',
  'agreementTerms.approve', 'plans.viewAll', 'analytics.view',
]);

/** Retired keys the catalog still carries — never shown as an ability. */
const HIDDEN: ReadonlySet<Permission> = new Set<Permission>(['intern.section']);

export default function AbilityList({
  held, before, fromRole, who = 'They', compact = false,
}: {
  /** What they will hold. */
  held: ReadonlySet<Permission>;
  /** What they hold now, to mark the difference. Omit for somebody new. */
  before?: ReadonlySet<Permission>;
  /** Abilities that come with a role, drawn with a padlock. */
  fromRole?: ReadonlySet<Permission>;
  /** "They", "Luis" — the subject of the summary line. */
  who?: string;
  compact?: boolean;
}) {
  const [showCannot, setShowCannot] = useState(false);

  const all = useMemo(
    () => PERMISSION_GROUPS.flatMap((g) => g.permissions).filter((p) => !HIDDEN.has(p.key)),
    [],
  );
  const can = all.filter((p) => held.has(p.key));
  const lost = before ? all.filter((p) => before.has(p.key) && !held.has(p.key)) : [];
  const gained = before ? all.filter((p) => !before.has(p.key) && held.has(p.key)) : [];
  const cannot = all.filter((p) => !held.has(p.key) && !lost.some((l) => l.key === p.key));
  const sensitiveCount = can.filter((p) => SENSITIVE.has(p.key)).length;

  return (
    <div className={compact ? 'text-xs' : 'text-sm'}>
      <p className="text-gray-700">
        <Bi vars={{ who, n: can.length, total: all.length }}>{'{who} will be able to do {n} of {total} things.'}</Bi>
        {sensitiveCount > 0 && (
          <span className="ml-1 text-amber-700">
            <Bi vars={{ n: sensitiveCount }}>{'{n} of them are sensitive.'}</Bi>
          </span>
        )}
      </p>
      {before && (gained.length > 0 || lost.length > 0) && (
        <p className="mt-1 text-xs text-gray-500">
          <Bi vars={{ added: gained.length, removed: lost.length }}>{'This change adds {added} and takes away {removed}.'}</Bi>
        </p>
      )}

      <div className="mt-3 space-y-3">
        {PERMISSION_GROUPS.map((group) => {
          const items = group.permissions.filter((p) => !HIDDEN.has(p.key) && (held.has(p.key) || lost.some((l) => l.key === p.key)));
          if (items.length === 0) return null;
          return (
            <div key={group.title}>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{group.title}</p>
              <ul className="mt-1 space-y-0.5">
                {items.map((p) => {
                  const isLost = !held.has(p.key);
                  const isNew = gained.some((g) => g.key === p.key);
                  return (
                    <li key={p.key}
                      className={`flex items-start gap-2 rounded-md px-1.5 py-1 transition-colors ${
                        isNew ? 'bg-green-50' : isLost ? 'bg-red-50' : ''
                      }`}>
                      <span className={`mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full ${
                        isLost ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-700'
                      }`}>
                        {isLost ? <Minus size={10} /> : <Check size={10} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={`flex flex-wrap items-center gap-1.5 ${isLost ? 'text-red-700 line-through' : 'text-gray-900'}`}>
                          {p.label}
                          {fromRole?.has(p.key) && !isLost && <Lock size={10} className="text-gray-400" aria-label="Comes with their role" />}
                          {isNew && <span className="rounded bg-green-100 px-1 text-[10px] font-semibold text-green-700 no-underline">New</span>}
                          {isLost && <span className="rounded bg-red-100 px-1 text-[10px] font-semibold text-red-700">Taken away</span>}
                          {SENSITIVE.has(p.key) && !isLost && (
                            <span className="rounded bg-amber-100 px-1 text-[10px] font-semibold uppercase tracking-wide text-amber-800">Sensitive</span>
                          )}
                        </span>
                        {!compact && <span className="block text-xs leading-snug text-gray-500">{p.detail}</span>}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>

      {cannot.length > 0 && (
        <div className="mt-3 border-t border-gray-100 pt-2">
          <button type="button" onClick={() => setShowCannot((v) => !v)}
            className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-800">
            <ChevronDown size={13} className={`transition ${showCannot ? 'rotate-180' : ''}`} />
            <Bi vars={{ n: cannot.length }}>{'What they cannot do ({n})'}</Bi>
          </button>
          {showCannot && (
            <ul className="mt-1.5 space-y-0.5 text-xs text-gray-400">
              {cannot.map((p) => <li key={p.key}>— {p.label}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
