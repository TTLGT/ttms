'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Eye, X } from 'lucide-react';
import { Bi } from '@/components/spanish/Es';
import {
  PREVIEW_ROLES,
  SETTINGS_GROUPS,
  SETTINGS_PAGES,
  TOTAL_PAGES,
  accessForRole,
  pageHref,
  visiblePages,
  type PreviewRole,
  type SettingsAccess,
} from './settingsSections';
import { useSettingsData } from './SettingsData';

/**
 * The Settings side menu: every page this reader can open, grouped, with the
 * current one marked.
 *
 * Three things beside the links, each for a reason:
 *
 * - **An amber dot** on a page that needs a look (`useSettingsData()`) — the
 *   same list Home shows in words, so a dot always has an explanation one
 *   click away.
 * - **"You see 4 of 22"** when somebody sees less than everything. Hiding a
 *   control they would be refused is right; leaving them to wonder whether a
 *   setting exists is not. The line says so and who to ask.
 * - **"See it as"**, for whoever manages people: the menu as an HR person, a
 *   dispatcher or a broker would get it, from the same role table the server
 *   uses. It previews the menu only — opening a page still opens it as you.
 */
export default function SettingsNav({
  access,
  currentId,
  canPreview,
  onNavigate,
}: {
  access: SettingsAccess;
  currentId: string | null;
  canPreview: boolean;
  /** Closes the phone sheet after a pick. */
  onNavigate?: () => void;
}) {
  const { attention } = useSettingsData();
  const [previewRole, setPreviewRole] = useState<PreviewRole | null>(null);
  const [picking, setPicking] = useState(false);

  const shownAccess = useMemo(
    () => (previewRole ? accessForRole(previewRole) : access),
    [previewRole, access],
  );
  const visible = useMemo(() => new Set(visiblePages(shownAccess).map((p) => p.id)), [shownAccess]);
  const needsLook = useMemo(() => new Set(previewRole ? [] : attention.map((a) => a.page)), [attention, previewRole]);
  const roleLabel = PREVIEW_ROLES.find((r) => r.id === previewRole)?.label;

  return (
    <nav aria-label="Settings" className="flex flex-col gap-4">
      {previewRole && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <p className="font-semibold">
            <Bi vars={{ role: roleLabel ?? '' }}>{'The menu as {role} sees it'}</Bi>
          </p>
          <p className="mt-0.5"><Bi>Pages still open as you. People given extra permissions one at a time may see more.</Bi></p>
          <button type="button" data-es onClick={() => setPreviewRole(null)}
            className="mt-1.5 inline-flex items-center gap-1 font-semibold underline-offset-2 hover:underline">
            <X size={12} /> Back to my menu
          </button>
        </div>
      )}

      {SETTINGS_GROUPS.map((group) => {
        const pages = SETTINGS_PAGES.filter((p) => p.group === group.id && (p.id === 'home' || visible.has(p.id)));
        if (pages.length === 0) return null;
        return (
          <div key={group.id}>
            {group.label && (
              <p data-es className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                {group.label}
              </p>
            )}
            <ul className="flex flex-col gap-px">
              {pages.map((p) => {
                const current = p.id === currentId;
                const readOnly = p.access(shownAccess) === 'view' && p.id !== 'home' && p.id !== 'change-log';
                return (
                  <li key={p.id}>
                    <Link
                      href={pageHref(p.id)}
                      onClick={onNavigate}
                      aria-current={current ? 'page' : undefined}
                      className={`group flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition ${
                        current
                          ? 'bg-white font-semibold text-brand-700 shadow-sm ring-1 ring-gray-200'
                          : 'text-gray-600 hover:bg-white/70 hover:text-gray-900'
                      }`}
                    >
                      <p.Icon size={15} className={current ? 'text-brand-600' : 'text-gray-400 group-hover:text-gray-500'} />
                      <span data-es className="min-w-0 flex-1 truncate">{p.label}</span>
                      {readOnly && (
                        <span data-es className="rounded border border-gray-200 px-1 text-[10px] font-medium text-gray-400">View</span>
                      )}
                      {needsLook.has(p.id) && (
                        <span className="h-2 w-2 flex-shrink-0 rounded-full bg-amber-500" title="Needs a look — see Home" />
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}

      {visible.size < TOTAL_PAGES && (
        <p className="px-2.5 text-xs leading-relaxed text-gray-400">
          <Bi vars={{ n: visible.size, total: TOTAL_PAGES }}>
            {'You see {n} of {total} settings pages. Ask an admin if you need one of the others.'}
          </Bi>
        </p>
      )}

      {canPreview && (
        <div className="border-t border-gray-200 px-2.5 pt-3">
          {picking ? (
            <div>
              <p data-es className="mb-1.5 text-xs font-semibold text-gray-600">See the menu as</p>
              <div className="flex flex-wrap gap-1">
                {PREVIEW_ROLES.map((r) => (
                  <button key={r.id} type="button" data-es
                    onClick={() => { setPreviewRole(r.id); setPicking(false); }}
                    className={`rounded-md border px-2 py-1 text-xs transition ${
                      previewRole === r.id ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-600 hover:bg-white'
                    }`}>
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setPicking(true)}
              className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-800">
              <Eye size={13} /> <span data-es>See it as another role</span>
            </button>
          )}
        </div>
      )}
    </nav>
  );
}
