'use client';

import { useEffect, useState } from 'react';
import { getAppSettings, saveLaneDistanceMode } from '@/lib/appSettings';
import { DEFAULT_APP_SETTINGS, isLaneDistanceMode } from '@/types/appSettings';
import type { LaneDistanceMode } from '@/types/appSettings';
import { Bi } from '@/components/spanish/Es';
import { useSaveBarEntry } from './kit/SaveBar';
import { Loading, Notice, OptionCards, PreviewBox, SettingsCard, useStagedAction } from './kit/ui';

/**
 * Admin choice of how orders work out the distance between their two
 * addresses. Applies to everyone — a broker cannot pick a different method,
 * which is deliberate: one of the options costs money per order.
 *
 * Beside the choice sits a cost calculator. **It is arithmetic in the browser
 * and nothing else** — it never asks Google anything, because a preview that
 * spent money to show what money would be spent is the one thing this page
 * must not do.
 */

const OPTIONS: { mode: LaneDistanceMode; title: string; detail: string; tag?: { text: string; tone: 'amber' | 'green' | 'gray' } }[] = [
  {
    mode: 'off',
    title: 'Off',
    detail: 'No distance is shown on orders. Nothing is calculated or stored.',
  },
  {
    mode: 'estimate',
    title: 'Estimate',
    tag: { text: 'Free', tone: 'green' },
    detail:
      'Worked out from the two ZIP codes, in TTMS, at no cost. Usually within about 5% of the real driving distance; mountain routes such as Denver to Salt Lake City read low, because the interstate detours a long way around. Fine for checking a quote. Never bill per mile from it.',
  },
  {
    mode: 'routes',
    title: 'Google Routes',
    tag: { text: 'Billed', tone: 'amber' },
    detail:
      'Real road miles from Google. Google charges for every lane it has not been asked about before, so on this setting the order shows a button and works the distance out only when somebody asks for it. A lane already paid for is reused for nothing, on every later order. If Google is ever unreachable, orders fall back to the free estimate and say so.',
  },
];

/**
 * Google's list price for a Compute Routes request, per thousand, as an
 * editable starting point — this account's real price and any free monthly
 * allowance are on its Google Cloud billing page, which TTMS cannot read.
 */
const DEFAULT_PRICE_PER_THOUSAND = 5;

export default function LaneDistancePanel() {
  const [saved, setSaved] = useState<LaneDistanceMode>(DEFAULT_APP_SETTINGS.laneDistanceMode);
  const [draft, setDraft] = useState<LaneDistanceMode>(DEFAULT_APP_SETTINGS.laneDistanceMode);
  const [keyConfigured, setKeyConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const staged = useStagedAction('laneDistance');

  useEffect(() => {
    getAppSettings()
      .then((res) => {
        setSaved(res.settings.laneDistanceMode);
        setDraft(res.settings.laneDistanceMode);
        setKeyConfigured(res.routesKeyConfigured);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load the setting'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!loading && staged && isLaneDistanceMode(staged)) setDraft(staged);
  }, [loading, staged]);

  const { active } = useSaveBarEntry({
    dirty: !loading && draft !== saved,
    save: async () => {
      const previous = saved;
      await saveLaneDistanceMode(draft);
      setSaved(draft);
      return async () => { await saveLaneDistanceMode(previous); setSaved(previous); setDraft(previous); };
    },
    discard: () => setDraft(saved),
  });

  return (
    <div className="space-y-6">
      <SettingsCard>
        {loading ? <Loading /> : (
          <OptionCards
            name="laneDistanceMode"
            value={draft}
            saved={saved}
            onChange={setDraft}
            options={OPTIONS.map((o) => ({
              value: o.mode,
              title: o.title,
              tag: o.tag,
              detail: o.detail,
              disabled: o.mode === 'routes' && !keyConfigured,
              disabledNote: (
                <span>
                  Unavailable until <span className="font-mono">GOOGLE_MAPS_API_KEY</span> is added to the
                  server settings. See the Admin Handbook.
                </span>
              ),
            }))}
          />
        )}
        {draft === 'routes' && saved !== 'routes' && (
          <Notice tone="amber" className="mt-4" title="This starts a bill">
            From the moment this is saved, every lane nobody has asked about before is charged by Google when somebody presses the button on an order.
          </Notice>
        )}
        {!active && draft !== saved && (
          <button type="button" onClick={() => void saveLaneDistanceMode(draft).then(() => setSaved(draft))}
            className="mt-4 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white">Save</button>
        )}
        {error && <Notice tone="red" className="mt-4">{error}</Notice>}
      </SettingsCard>

      <SettingsCard title="What would it cost?" description="Worked out here from the numbers you type. It never asks Google anything, so trying numbers costs nothing.">
        <CostCalculator />
      </SettingsCard>
    </div>
  );
}

const usd = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: n < 10 ? 2 : 0 });

function CostCalculator() {
  const [lanes, setLanes] = useState('200');
  const [price, setPrice] = useState(String(DEFAULT_PRICE_PER_THOUSAND));
  const nLanes = Math.max(0, Number(lanes) || 0);
  const nPrice = Math.max(0, Number(price) || 0);
  const month = (nLanes * nPrice) / 1000;
  const input = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-400';

  return (
    <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
      <div className="space-y-3">
        <label className="block text-sm">
          <span className="font-semibold text-gray-900"><Bi>New lanes a month</Bi></span>
          <span className="block text-xs text-gray-500"><Bi>Pickup-and-delivery pairs nobody has looked up before. Repeat lanes are free.</Bi></span>
          <input id="lanes-month" inputMode="numeric" value={lanes} onChange={(e) => setLanes(e.target.value.replace(/[^\d]/g, ''))} className={`mt-1 ${input}`} />
        </label>
        <label className="block text-sm">
          <span className="font-semibold text-gray-900"><Bi>Google’s price per 1,000 lookups</Bi></span>
          <span className="block text-xs text-gray-500"><Bi>Google’s list price to start with. Check this account’s billing page for its real price and any free monthly allowance.</Bi></span>
          <input id="price-thousand" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ''))} className={`mt-1 ${input}`} />
        </label>
      </div>
      <PreviewBox title="Per month">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-gray-200 bg-white p-3">
            <p data-es className="text-xs text-gray-500">Estimate</p>
            <p className="font-[family-name:var(--font-rajdhani)] text-3xl font-bold tabular-nums text-green-700">$0</p>
            <p className="text-xs text-gray-500"><Bi>About 5% off the real distance, more on mountain lanes.</Bi></p>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p data-es className="text-xs text-amber-800">Google Routes</p>
            <p className="font-[family-name:var(--font-rajdhani)] text-3xl font-bold tabular-nums text-amber-800">{usd(month)}</p>
            <p className="text-xs text-amber-800">
              <Bi vars={{ year: usd(month * 12) }}>{'About {year} a year, before any free allowance.'}</Bi>
            </p>
          </div>
        </div>
      </PreviewBox>
    </div>
  );
}
