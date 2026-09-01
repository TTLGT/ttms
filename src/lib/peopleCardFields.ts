'use client';

import { useCallback, useEffect, useState } from 'react';
import { OTHER_PHONE_LABEL, PHONE_LABEL } from './phone';

/**
 * Which details each card shows in Settings → People.
 *
 * This is a personal display preference, not company data, so it lives in the
 * browser's localStorage — the same reasoning as the table column widths. One
 * admin hiding birthdays while they screen-share should not take them off
 * everyone else's screen, and it is not worth a write to the live database
 * every time somebody ticks a box.
 *
 * Nothing here is an access control. Everything on the list is already in the
 * documents this page reads, and `allowedUsers` is readable by admins and HR
 * alone (`firestore.rules`), so the picker decides what is *on screen*, never
 * what the reader is allowed to have. Anyone who can open the page can also
 * export the same fields to CSV.
 */

export type PeopleCardField =
  | 'legalName'
  | 'email'
  | 'personalEmail'
  | 'phone'
  | 'phoneOther'
  | 'site'
  | 'team'
  | 'startDate'
  | 'dateOfBirth';

export const PEOPLE_CARD_FIELDS: { key: PeopleCardField; label: string; hint?: string }[] = [
  { key: 'legalName',     label: 'Full legal name', hint: 'Only shown when it differs from the everyday name' },
  { key: 'email',         label: 'Work email' },
  { key: 'personalEmail', label: 'Personal email' },
  { key: 'phone',         label: PHONE_LABEL.US, hint: 'With the desk extension' },
  { key: 'phoneOther',    label: OTHER_PHONE_LABEL },
  { key: 'site',          label: 'Office' },
  { key: 'team',          label: 'Team' },
  { key: 'startDate',     label: 'Start date' },
  { key: 'dateOfBirth',   label: 'Date of birth' },
];

export type PeopleCardFieldState = Record<PeopleCardField, boolean>;

/**
 * Everything on. The card showed all of these but the two personal ones before
 * the picker existed, and a picker that starts by hiding things nobody asked to
 * hide reads as data having gone missing.
 */
export const DEFAULT_PEOPLE_CARD_FIELDS: PeopleCardFieldState = {
  legalName:     true,
  email:         true,
  personalEmail: true,
  phone:         true,
  phoneOther:    true,
  site:          true,
  team:          true,
  startDate:     true,
  dateOfBirth:   true,
};

const STORAGE_KEY = 'ttms.people.cardFields';

export interface PeopleCardFieldControls {
  fields: PeopleCardFieldState;
  /** True once the reader has hidden something, so a Reset control can stay out of the way until it does anything. */
  customized: boolean;
  toggle: (key: PeopleCardField) => void;
  /** Put every field back on and forget the saved copy. */
  reset: () => void;
}

export function usePeopleCardFields(): PeopleCardFieldControls {
  const [fields, setFields] = useState<PeopleCardFieldState>(DEFAULT_PEOPLE_CARD_FIELDS);
  const [customized, setCustomized] = useState(false);

  // Read after mount, never during render: this page is server-rendered too,
  // there is no localStorage there, and seeding the first render from it would
  // make the server and client markup disagree.
  useEffect(() => {
    let saved: Partial<Record<string, unknown>>;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      saved = JSON.parse(raw) as Partial<Record<string, unknown>>;
    } catch {
      return; // private window, cleared storage, or hand-edited garbage
    }
    if (!saved || typeof saved !== 'object') return;

    // Only keys the picker still offers are adopted, so a field renamed or
    // dropped in a later release cannot come back as a stale entry.
    const merged = { ...DEFAULT_PEOPLE_CARD_FIELDS };
    let any = false;
    for (const { key } of PEOPLE_CARD_FIELDS) {
      if (typeof saved[key] === 'boolean') {
        merged[key] = saved[key] as boolean;
        if (!saved[key]) any = true;
      }
    }
    setFields(merged);
    setCustomized(any);
  }, []);

  const persist = useCallback((next: PeopleCardFieldState) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage full or blocked — the choice still holds for this session.
    }
  }, []);

  const toggle = useCallback((key: PeopleCardField) => {
    setFields((current) => {
      const next = { ...current, [key]: !current[key] };
      persist(next);
      setCustomized(PEOPLE_CARD_FIELDS.some(({ key: k }) => !next[k]));
      return next;
    });
  }, [persist]);

  const reset = useCallback(() => {
    setFields(DEFAULT_PEOPLE_CARD_FIELDS);
    setCustomized(false);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Nothing to clean up if storage is unavailable.
    }
  }, []);

  return { fields, customized, toggle, reset };
}
