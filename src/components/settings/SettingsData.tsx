'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { getAppSettings, type AppSettingsResponse } from '@/lib/appSettings';
import { getQuoteRates, type QuoteRatesResponse } from '@/lib/quoteRates';
import { getAgreementTerms, type AgreementTermsResponse } from '@/lib/agreementTerms';
import { fetchConfig, fetchSchedules, type SchedulesResponse } from '@/lib/attendance';
import type { AttendanceConfig } from '@/types/attendance';
import { useSaveVersion } from './kit/SaveBar';
import type { SettingsAccess } from './settingsSections';

/**
 * What Settings needs to know about itself before any page is opened: the
 * company settings, and the handful of facts that decide whether something
 * "needs a look" — an amber dot in the side menu and a card on Home.
 *
 * Loaded once by the layout and kept while moving between pages (a layout
 * does not remount), then re-read after every save. Each source is fetched
 * only for somebody who could act on what it says: a finance person's
 * Settings never asks for the attendance schedules. About a dozen document
 * reads on arrival, which is noise beside one dashboard load.
 */

export interface Attention {
  page: string;
  text: string;
  tone: 'amber' | 'blue';
}

export interface SettingsData {
  app: AppSettingsResponse | null;
  quoteRates: QuoteRatesResponse | null;
  terms: AgreementTermsResponse | null;
  schedules: SchedulesResponse | null;
  attendanceConfig: AttendanceConfig | null;
  attention: Attention[];
  loaded: boolean;
}

const EMPTY: SettingsData = {
  app: null, quoteRates: null, terms: null, schedules: null, attendanceConfig: null, attention: [], loaded: false,
};

const Ctx = createContext<SettingsData>(EMPTY);

export function useSettingsData(): SettingsData {
  return useContext(Ctx);
}

/** Days since a `YYYY-MM-DD`, or null. */
function daysSince(date: string): number | null {
  const t = Date.parse(`${date}T12:00:00`);
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86_400_000);
}

export function attentionFor(d: Omit<SettingsData, 'attention' | 'loaded'>, a: SettingsAccess): Attention[] {
  const out: Attention[] = [];
  const settingsAdmin = a.can('settings.manage');

  if (d.app && (settingsAdmin || a.can('laneDistance.manage'))) {
    const mode = d.app.settings.laneDistanceMode;
    if (mode === 'routes' && !d.app.routesKeyConfigured) {
      out.push({ page: 'lane-distance', tone: 'amber', text: 'Lane distance is set to Google, but no Google key is on the server, so orders fall back to the estimate.' });
    } else if (mode === 'routes') {
      out.push({ page: 'lane-distance', tone: 'amber', text: 'Lane distance is on Google Routes, which is billed for every new lane looked up.' });
    }
  }
  if (d.app && settingsAdmin && !(d.app.chosen ?? []).includes('reminderEmails')) {
    out.push({ page: 'general', tone: 'blue', text: 'Nobody has decided yet whether calendar reminders may go out by email. They are off until somebody does.' });
  }
  if (d.schedules && !d.schedules.fallback) {
    out.push({ page: 'schedules', tone: 'amber', text: 'There is no company work schedule yet, so nobody is marked late or absent.' });
  }
  if (d.attendanceConfig && d.attendanceConfig.officeNetworks.length === 0) {
    out.push({ page: 'office-network', tone: 'blue', text: 'No office network is set, so no clock-in is marked as from the office.' });
  }
  if (d.terms?.canApprove) {
    const waiting = d.terms.client.pending.length + d.terms.carrier.pending.length;
    if (waiting > 0) {
      out.push({ page: 'agreement-terms', tone: 'amber', text: `${waiting} proposed change${waiting === 1 ? '' : 's'} to the agreement terms ${waiting === 1 ? 'is' : 'are'} waiting for you.` });
    }
  }
  if (d.quoteRates) {
    if (d.quoteRates.isDefault) {
      out.push({ page: 'quote-rates', tone: 'blue', text: 'The quote calculator is still on the starting rates from the old Google Sheet.' });
    } else {
      const age = d.quoteRates.rates.market.asOf ? daysSince(d.quoteRates.rates.market.asOf) : null;
      // DAT publishes weekly; a month and a half old is a month and a half of
      // driver pay checked against last season's market.
      if (age !== null && age > 45) {
        out.push({ page: 'quote-rates', tone: 'amber', text: `The market figures the calculator checks driver pay against are ${Math.round(age / 7)} weeks old.` });
      }
    }
  }
  return out;
}

export function SettingsDataProvider({ access, children }: { access: SettingsAccess; children: ReactNode }) {
  const version = useSaveVersion();
  const [data, setData] = useState<SettingsData>(EMPTY);
  const { can } = access;

  const load = useCallback(async () => {
    const settingsAdmin = can('settings.manage');
    const opt = <T,>(when: boolean, fn: () => Promise<T>) => (when ? fn().catch(() => null) : Promise.resolve(null));
    const [app, quoteRates, terms, schedules, config] = await Promise.all([
      opt(true, getAppSettings),
      opt(settingsAdmin || can('quoteRates.manage'), getQuoteRates),
      opt(can('agreementTerms.approve'), getAgreementTerms),
      opt(can('attendance.manage'), fetchSchedules),
      opt(can('attendance.manage'), fetchConfig),
    ]);
    const base = { app, quoteRates, terms, schedules, attendanceConfig: config?.config ?? null };
    setData({ ...base, attention: attentionFor(base, access), loaded: true });
    // `access` is rebuilt every render; `can` is what actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [can]);

  useEffect(() => { void load(); }, [load, version]);

  return <Ctx.Provider value={data}>{children}</Ctx.Provider>;
}
