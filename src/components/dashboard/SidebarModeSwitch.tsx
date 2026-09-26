'use client';

import { PanelLeft, PanelLeftClose, MousePointer2, LucideIcon } from 'lucide-react';
import { SIDEBAR_MODES, SidebarMode } from '@/lib/sidebarMode';

const OPTIONS: Record<SidebarMode, { icon: LucideIcon; label: string }> = {
  expanded:  { icon: PanelLeft,      label: 'Keep the menu open' },
  collapsed: { icon: PanelLeftClose, label: 'Fold the menu down to icons' },
  auto:      { icon: MousePointer2,  label: 'Open the menu when the pointer is over it' },
};

/*
 * The three ways the sidebar can sit on a desktop — see src/lib/sidebarMode.ts.
 * Drawn to match ThemeSwitch beside it, and hidden below `lg`, where the
 * sidebar is a drawer and none of the three means anything.
 */
export default function SidebarModeSwitch({
  mode,
  onChange,
}: {
  mode: SidebarMode;
  onChange: (next: SidebarMode) => void;
}) {
  return (
    <div className="mb-2 hidden items-center justify-between gap-2 lg:flex">
      <span className="text-xs text-blue-300">Menu</span>
      <div role="radiogroup" aria-label="How the menu sits" className="flex gap-0.5 rounded-lg bg-brand-700/50 p-0.5">
        {SIDEBAR_MODES.map((value) => {
          const { icon: Icon, label } = OPTIONS[value];
          const active = mode === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={label}
              title={label}
              onClick={() => onChange(value)}
              className={`rounded-md p-1 transition ${
                active ? 'bg-brand-500 text-white' : 'text-blue-300 hover:text-white'
              }`}
            >
              <Icon size={14} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
