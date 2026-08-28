'use client';

import { useEffect, useMemo, useState } from 'react';
import { getAppSettingsOrDefaults } from './appSettings';
import { formatCalendarDate, formatDate, formatDateTime } from './dateFormat';
import type { DateLike } from './dateFormat';
import { DEFAULT_APP_SETTINGS, isDateFormat } from '@/types/appSettings';
import type { DateFormat } from '@/types/appSettings';

/**
 * The company's chosen date format, and the three formatters bound to it.
 *
 * Every page that shows a date calls this and uses what it returns, rather
 * than importing the formatters and threading the format through by hand —
 * one line per page, and no call site can be left on the wrong format.
 */

const STORAGE_KEY = 'ttms.dateFormat';

/**
 * Last format this browser saw, remembered so the first paint after a reload
 * is already right.
 *
 * The setting arrives over the network, a frame or two after the page renders.
 * Without this, every hard refresh would draw dates in the default format and
 * then visibly flip them — which reads as a bug, and on a page of dates is a
 * flicker nobody would report clearly. Firestore stays the authority: this is
 * only a guess at what it will say, replaced the moment the real answer lands.
 */
function remembered(): DateFormat {
  if (typeof window === 'undefined') return DEFAULT_APP_SETTINGS.dateFormat;
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return isDateFormat(saved) ? saved : DEFAULT_APP_SETTINGS.dateFormat;
  } catch {
    // Private browsing, or storage turned off. The default is still correct.
    return DEFAULT_APP_SETTINGS.dateFormat;
  }
}

export interface DateFormatters {
  /** What the company has chosen, for anything that needs the raw value. */
  dateFormat: DateFormat;
  /** A Timestamp, Date or ISO string as a date. `fallback` shows when there is none. */
  formatDate: (value: DateLike, fallback?: string) => string;
  /** The same, with the time after it. */
  formatDateTime: (value: DateLike, fallback?: string) => string;
  /** A stored `YYYY-MM-DD` — a birthday or a start date. '' when it is not a real date. */
  formatCalendarDate: (value: string | null | undefined) => string;
}

export function useDateFormatters(): DateFormatters {
  // Starts at the remembered format, not the default, so the first paint after
  // a reload is already what the admin chose.
  const [format, setFormat] = useState<DateFormat>(DEFAULT_APP_SETTINGS.dateFormat);

  useEffect(() => {
    // Read in an effect rather than in useState: the server renders this
    // component too, and it has no localStorage — reading it during the first
    // render would make the server and client disagree about the markup.
    setFormat(remembered());

    let live = true;
    void getAppSettingsOrDefaults().then((res) => {
      if (!live) return;
      setFormat(res.settings.dateFormat);
      try {
        window.localStorage.setItem(STORAGE_KEY, res.settings.dateFormat);
      } catch {
        // Nothing to do — the format still applies for this session.
      }
    });
    return () => {
      live = false;
    };
  }, []);

  return useMemo(
    () => ({
      dateFormat: format,
      formatDate: (value, fallback) => formatDate(value, format, fallback),
      formatDateTime: (value, fallback) => formatDateTime(value, format, fallback),
      formatCalendarDate: (value) => formatCalendarDate(value, format),
    }),
    [format],
  );
}
