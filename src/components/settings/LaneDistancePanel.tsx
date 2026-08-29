'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Check } from 'lucide-react';
import { getAppSettings, saveLaneDistanceMode } from '@/lib/appSettings';
import { DEFAULT_APP_SETTINGS } from '@/types/appSettings';
import type { LaneDistanceMode } from '@/types/appSettings';

/**
 * Admin choice of how orders work out the distance between their two
 * addresses. Applies to everyone — a broker cannot pick a different method,
 * which is deliberate: one of the options costs money per order.
 */

const OPTIONS: {
  mode: LaneDistanceMode;
  title: string;
  detail: string;
}[] = [
  {
    mode: 'off',
    title: 'Off',
    detail: 'No distance is shown on orders. Nothing is calculated or stored.',
  },
  {
    mode: 'estimate',
    title: 'Estimate — free',
    detail:
      'Worked out from the two ZIP codes, in TTMS, at no cost. Usually within about 5% of the real driving distance; mountain routes such as Denver to Salt Lake City read low, because the interstate detours a long way around. Fine for checking a quote. Never bill per mile from it.',
  },
  {
    mode: 'routes',
    title: 'Google Routes — exact, but charged',
    detail:
      'Real road miles from Google. Google charges for every lookup, so this bills on each new order and each time an address changes. Needs GOOGLE_MAPS_API_KEY set on the server. If Google is ever unreachable, orders fall back to the free estimate and say so.',
  },
];

export default function LaneDistancePanel() {
  const [mode, setMode] = useState<LaneDistanceMode>(DEFAULT_APP_SETTINGS.laneDistanceMode);
  const [keyConfigured, setKeyConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<LaneDistanceMode | ''>('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getAppSettings()
      .then((res) => {
        setMode(res.settings.laneDistanceMode);
        setKeyConfigured(res.routesKeyConfigured);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load the setting'))
      .finally(() => setLoading(false));
  }, []);

  async function choose(next: LaneDistanceMode) {
    if (next === mode || saving) return;
    const previous = mode;
    setMode(next);
    setSaving(next);
    setError('');
    setSaved(false);
    try {
      await saveLaneDistanceMode(next);
      setSaved(true);
    } catch (e) {
      // Put the radio back where it was — leaving it on a mode that did not
      // save would misrepresent what orders are actually doing.
      setMode(previous);
      setError(e instanceof Error ? e.message : 'Failed to save the setting');
    } finally {
      setSaving('');
    }
  }

  return (
    <section className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Lane Distance</h2>
      <p className="text-sm text-gray-500 mt-1 mb-4">
        How an order works out the distance between its pickup and delivery addresses.
      </p>

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        <div className="space-y-2">
          {OPTIONS.map((option) => {
            const selected = mode === option.mode;
            const blocked = option.mode === 'routes' && !keyConfigured;
            return (
              <label
                key={option.mode}
                className={`flex gap-3 rounded-lg border p-4 transition ${
                  blocked
                    ? 'border-gray-200 bg-gray-50 cursor-not-allowed opacity-70'
                    : selected
                      ? 'border-brand-400 bg-brand-50/50 cursor-pointer'
                      : 'border-gray-200 hover:border-gray-300 cursor-pointer'
                }`}
              >
                <input
                  type="radio"
                  name="laneDistanceMode"
                  className="mt-1 accent-brand-600"
                  checked={selected}
                  disabled={blocked || Boolean(saving)}
                  onChange={() => void choose(option.mode)}
                />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">
                    {option.title}
                    {saving === option.mode && <span className="ml-2 text-xs font-normal text-gray-500">Saving…</span>}
                  </p>
                  <p className="text-xs text-gray-600 mt-1 leading-relaxed">{option.detail}</p>
                  {blocked && (
                    <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-700">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                      <span>
                        Unavailable until <span className="font-mono">GOOGLE_MAPS_API_KEY</span> is added to the
                        server settings file. See the Admin Handbook.
                      </span>
                    </p>
                  )}
                </div>
              </label>
            );
          })}
        </div>
      )}

      {saved && !error && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-green-700">
          <Check className="w-3.5 h-3.5" /> Saved. New orders use this from now on.
        </p>
      )}
      {error && (
        <div className="mt-3 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600">{error}</div>
      )}
    </section>
  );
}
