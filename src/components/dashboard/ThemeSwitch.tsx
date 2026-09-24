'use client';

import { Monitor, Moon, Sun, LucideIcon } from 'lucide-react';
import { THEME_CHOICES, ThemeChoice, useTheme } from '@/lib/theme';

const OPTIONS: Record<ThemeChoice, { icon: LucideIcon; label: string }> = {
  light:  { icon: Sun,     label: 'Light' },
  dark:   { icon: Moon,    label: 'Dark' },
  system: { icon: Monitor, label: 'Match this computer' },
};

/*
 * Light, dark, or whatever the operating system says. Lives at the foot of
 * the sidebar, beside Sign out, because it is a setting about this screen
 * rather than about the person — see src/lib/theme.ts — and so has no place
 * on the profile page among details HR keeps.
 *
 * Drawn for the sidebar, which is brand-900 in both themes.
 */
export default function ThemeSwitch() {
  const { choice, setChoice } = useTheme();

  return (
    <div role="radiogroup" aria-label="Colour theme" className="flex gap-0.5 rounded-lg bg-brand-700/50 p-0.5">
      {THEME_CHOICES.map((value) => {
        const { icon: Icon, label } = OPTIONS[value];
        const active = choice === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => setChoice(value)}
            className={`rounded-md p-1 transition ${
              active ? 'bg-brand-500 text-white' : 'text-blue-300 hover:text-white'
            }`}
          >
            <Icon size={14} />
          </button>
        );
      })}
    </div>
  );
}
