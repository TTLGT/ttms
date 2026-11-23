'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, Check, ChevronDown, ChevronRight, Plus, RotateCcw, Trash2 } from 'lucide-react';
import DateField from '@/components/DateField';
import { getQuoteRates, saveQuoteRates } from '@/lib/quoteRates';
import { useDateFormatters } from '@/lib/useDateFormatters';
import { Bi } from '@/components/spanish/Es';
import { useSaveBarEntry } from './kit/SaveBar';
import { ConfirmDialog, PreviewBox, SettingsCard } from './kit/ui';
import {
  DEFAULT_QUOTE_RATES,
  LOAD_SIZES,
  estimatePrice,
  LOAD_SIZE_LABEL,
  MARKET_EQUIPMENT,
  MARKET_EQUIPMENT_LABEL,
  PRICING_KINDS,
  PRICING_KIND_LABEL,
  newTruckId,
  rateSummary,
  type MarketEquipment,
  type PricingKind,
  type QuoteRates,
  type RateRange,
  type TowingTier,
  type TruckLimits,
  type TruckType,
} from '@/types/quoteRates';

/**
 * Settings → Quote rates: the card the quote calculator prices
 * with. See src/types/quoteRates.ts for what each number means.
 *
 * Edited as a draft and saved whole, with a Discard beside Save. A rate card is
 * a set of numbers that make sense together — raising flatbed and step deck in
 * the same sitting — and saving each box as it was typed would put a half-done
 * card in front of every broker quoting at that moment.
 */

const INPUT =
  'w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-400';
const LABEL = 'block text-[11px] font-medium text-gray-600 mb-0.5';

const clone = (r: QuoteRates): QuoteRates => JSON.parse(JSON.stringify(r)) as QuoteRates;

export default function QuoteRatesPanel() {
  const { formatDateTime } = useDateFormatters();
  const [saved, setSaved] = useState<QuoteRates | null>(null);
  const [draft, setDraft] = useState<QuoteRates | null>(null);
  const [meta, setMeta] = useState<{ updatedAt: string | null; updatedBy: string | null; isDefault: boolean; problem: string | null }>(
    { updatedAt: null, updatedBy: null, isDefault: true, problem: null },
  );
  const [open, setOpen] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    getQuoteRates()
      .then((res) => {
        setSaved(res.rates);
        setDraft(clone(res.rates));
        setMeta({ updatedAt: res.updatedAt, updatedBy: res.updatedBy, isDefault: res.isDefault, problem: res.problem });
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load the quote rates'));
  }, []);

  const dirty = Boolean(draft && saved && JSON.stringify(draft) !== JSON.stringify(saved));
  const [askReset, setAskReset] = useState(false);

  // Settings' Save bar saves the card; outside Settings the buttons below do.
  const { active } = useSaveBarEntry({
    dirty,
    save: async () => {
      if (!draft || !saved) return;
      const previous = saved;
      const stored = await saveQuoteRates(draft);
      setSaved(stored);
      setDraft(clone(stored));
      setMeta({ updatedAt: new Date().toISOString(), updatedBy: 'you', isDefault: false, problem: null });
      return async () => {
        const back = await saveQuoteRates(previous);
        setSaved(back);
        setDraft(clone(back));
      };
    },
    discard: () => { if (saved) setDraft(clone(saved)); setError(''); },
  });

  async function save() {
    if (!draft) return;
    setSaving(true);
    setError('');
    setJustSaved(false);
    try {
      const stored = await saveQuoteRates(draft);
      setSaved(stored);
      setDraft(clone(stored));
      setMeta({ updatedAt: new Date().toISOString(), updatedBy: 'you', isDefault: false, problem: null });
      setJustSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the quote rates');
    } finally {
      setSaving(false);
    }
  }

  const setTruck = (id: string, patch: Partial<TruckType>) =>
    setDraft((d) => d && { ...d, trucks: d.trucks.map((t) => (t.id === id ? { ...t, ...patch } : t)) });

  function moveTruck(id: string, by: -1 | 1) {
    setDraft((d) => {
      if (!d) return d;
      const i = d.trucks.findIndex((t) => t.id === id);
      const j = i + by;
      if (i < 0 || j < 0 || j >= d.trucks.length) return d;
      const trucks = [...d.trucks];
      [trucks[i], trucks[j]] = [trucks[j], trucks[i]];
      return { ...d, trucks };
    });
  }

  function addTruck() {
    if (!draft) return;
    const id = newTruckId('new truck', draft.trucks.map((t) => t.id));
    const truck: TruckType = {
      id, code: '', name: '', pricing: 'perMile',
      perMile: { partial: null, ltl: null, tl: { low: 0, high: 0 } },
      hourly: null, towing: null,
      limits: { lengthFt: null, widthFt: null, heightFt: null, weightLb: null },
      notes: '', market: null,
    };
    setDraft({ ...draft, trucks: [...draft.trucks, truck] });
    setOpen(id);
  }

  return (
    <SettingsCard>
      <p className="mb-4 text-sm text-gray-500">
        <Bi>Changes reach every broker the next time they open the calculator.</Bi>
      </p>

      {!draft ? (
        error ? <p className="text-sm text-red-700">{error}</p> : <p data-es className="text-sm text-gray-500">Loading…</p>
      ) : (
        <div className="space-y-6">
          {meta.problem && (
            <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
              The saved card could not be read ({meta.problem}), so the calculator is using the starting rates below. Saving replaces it.
            </p>
          )}
          <p className="text-xs text-gray-500">
            {meta.isDefault
              ? 'Not saved yet — these are the starting rates from the old Google Sheet.'
              : `Last saved${meta.updatedBy ? ` by ${meta.updatedBy}` : ''}${meta.updatedAt ? `, ${formatDateTime(meta.updatedAt)}` : ''}.`}
          </p>

          {/* Market */}
          <div className="space-y-3">
            <div>
              <h3 data-es className="text-xs font-semibold text-gray-800 uppercase tracking-wide">Market check</h3>
              <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                <Bi>National average spot rates per mile, broker to carrier. DAT publishes these three for free in its
                weekly truckload market update; there is no free feed TTMS could read them from, so they are copied
                in by hand. The calculator compares the driver&apos;s pay with them — they never set a price.</Bi>
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {MARKET_EQUIPMENT.map((eq) => (
                <div key={eq}>
                  <label className={LABEL}>{MARKET_EQUIPMENT_LABEL[eq]} $/mi</label>
                  <NumInput value={draft.market[eq]} onChange={(v) => setDraft({ ...draft, market: { ...draft.market, [eq]: v } })} />
                </div>
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-3">
              <div>
                <label data-es className={LABEL}>As of</label>
                <DateField value={draft.market.asOf} onChange={(v) => setDraft({ ...draft, market: { ...draft.market, asOf: v } })}
                  className={INPUT} ariaLabel="Market figures as of" />
              </div>
              <div>
                <label data-es className={LABEL}>Source</label>
                <input value={draft.market.source} maxLength={300}
                  onChange={(e) => setDraft({ ...draft, market: { ...draft.market, source: e.target.value } })}
                  className={INPUT} placeholder="e.g. DAT weekly update, week 36" />
              </div>
            </div>
          </div>

          {/* Fee targets */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label data-es className={LABEL}>Target broker fee ($)</label>
              <NumInput value={draft.targetBrokerFee} onChange={(v) => setDraft({ ...draft, targetBrokerFee: v ?? 0 })} />
              <p className="text-[11px] text-gray-500 mt-1"><Bi>A quote under this is flagged amber. Never refused.</Bi></p>
            </div>
            <div>
              <label className={LABEL}>uShip fee (%)</label>
              <NumInput value={draft.ushipFeePercent} onChange={(v) => setDraft({ ...draft, ushipFeePercent: v })} placeholder="Blank = type it each time" />
              <p className="text-[11px] text-gray-500 mt-1"><Bi>Pre-fills the uShip column. A broker can still change it per quote.</Bi></p>
            </div>
          </div>

          {/* Trucks */}
          <div className="space-y-2">
            <h3 data-es className="text-xs font-semibold text-gray-800 uppercase tracking-wide">Trucks</h3>
            <p className="text-xs text-gray-500">
              <Bi>Rates are what the client is charged. A blank load size is one the truck is not offered for. Click a
              truck to edit it.</Bi>
            </p>
            <div className="divide-y divide-gray-100 rounded-lg border border-gray-200">
              {draft.trucks.map((t, i) => (
                <div key={t.id}>
                  <div className="flex items-center gap-2 px-3 py-2">
                    <button type="button" onClick={() => setOpen(open === t.id ? '' : t.id)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left">
                      {open === t.id ? <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />}
                      <span className="font-semibold text-sm text-gray-900 truncate">{t.name || 'New truck'}</span>
                      <span className="text-[11px] text-gray-500">{t.code}</span>
                      <span className="ml-auto hidden sm:block text-xs text-gray-500 truncate">
                        {t.pricing === 'perMile' ? `TL ${rateSummary(t, 'tl')}` : rateSummary(t, 'tl')}
                      </span>
                    </button>
                    <IconButton label="Move up" disabled={i === 0} onClick={() => moveTruck(t.id, -1)}><ArrowUp className="w-3.5 h-3.5" /></IconButton>
                    <IconButton label="Move down" disabled={i === draft.trucks.length - 1} onClick={() => moveTruck(t.id, 1)}><ArrowDown className="w-3.5 h-3.5" /></IconButton>
                    <IconButton label="Remove" disabled={draft.trucks.length === 1}
                      onClick={() => setDraft({ ...draft, trucks: draft.trucks.filter((x) => x.id !== t.id) })}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </IconButton>
                  </div>
                  {open === t.id && <TruckEditor truck={t} onChange={(patch) => setTruck(t.id, patch)} />}
                </div>
              ))}
            </div>
            <button data-es type="button" onClick={addTruck}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-700">
              <Plus className="w-3.5 h-3.5" /> Add a truck type
            </button>
          </div>

          {saved && <LanePreview draft={draft} saved={saved} />}

          {error && <p className="text-sm text-red-700">{error}</p>}

          <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-4">
            {!active && (
              <>
                <button type="button" onClick={() => void save()} disabled={!dirty || saving}
                  className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
                  {saving ? 'Saving…' : 'Save rates'}
                </button>
                <button type="button" onClick={() => { if (saved) setDraft(clone(saved)); setError(''); }} disabled={!dirty || saving}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                  Discard changes
                </button>
                {justSaved && !dirty && <span data-es className="inline-flex items-center gap-1 text-xs text-green-700"><Check className="w-3.5 h-3.5" />Saved</span>}
              </>
            )}
            <button type="button" onClick={() => setAskReset(true)}
              className="ml-auto inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800">
              <RotateCcw className="w-3.5 h-3.5" /> <span data-es>Starting rates</span>
            </button>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={askReset}
        title="Put back the starting rates?"
        body="Every rate goes back to the starting rates from the old Google Sheet. Nothing is saved until you press Save, and Discard brings back what you had."
        confirmLabel="Put them back"
        onCancel={() => setAskReset(false)}
        onConfirm={() => { setDraft(clone(DEFAULT_QUOTE_RATES)); setAskReset(false); }}
      />
    </SettingsCard>
  );
}

/**
 * Example lanes, made up for the preview but real-sized. Long, middling and
 * short, because a per-mile change reads very differently on each.
 */
const SAMPLE_LANES = [
  { from: 'Dallas, TX', to: 'Atlanta, GA', miles: 781 },
  { from: 'Chicago, IL', to: 'Memphis, TN', miles: 532 },
  { from: 'Houston, TX', to: 'San Antonio, TX', miles: 197 },
];

const money0 = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

/**
 * What a full truckload on each example lane would be quoted at, from the card
 * as it is being edited, with the difference from the saved card beside it.
 * The middle of each range, the way the calculator opens.
 */
function LanePreview({ draft, saved }: { draft: QuoteRates; saved: QuoteRates }) {
  const rows = useMemo(() => draft.trucks
    .filter((t) => t.pricing !== 'hourly')
    .map((t) => {
      const before = saved.trucks.find((x) => x.id === t.id);
      return {
        truck: t,
        cells: SAMPLE_LANES.map((lane) => {
          const input = { miles: lane.miles, hours: 0, size: 'tl' as const, position: 0.5 };
          const now = estimatePrice(t, input);
          const was = before ? estimatePrice(before, input) : null;
          return { now, delta: now.missing || !was || was.missing ? null : now.price - was.price };
        }),
      };
    }), [draft, saved]);

  return (
    <PreviewBox title="What these rates quote" note="Example lanes, full truckload, the middle of each range. Green and red show the change from what is saved now. Nothing here is saved until you press Save.">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-gray-500">
              <th data-es className="py-1.5 pr-3 font-semibold">Truck</th>
              {SAMPLE_LANES.map((l) => (
                <th key={l.from} className="py-1.5 pr-3 font-semibold">
                  {l.from.split(',')[0]} → {l.to.split(',')[0]}
                  <span className="block font-normal normal-case tracking-normal text-gray-400">{l.miles} mi</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map(({ truck, cells }) => (
              <tr key={truck.id}>
                <td className="py-2 pr-3 font-medium text-gray-900">{truck.name || 'New truck'}</td>
                {cells.map((c, i) => (
                  <td key={i} className="py-2 pr-3 tabular-nums">
                    {c.now.missing ? <span className="text-gray-300">—</span> : (
                      <>
                        <span className="font-semibold text-gray-900">{money0(c.now.price)}</span>
                        {c.delta !== null && Math.abs(c.delta) >= 1 && (
                          <span className={`ml-1.5 text-xs font-semibold ${c.delta > 0 ? 'text-green-700' : 'text-red-600'}`}>
                            {c.delta > 0 ? '+' : '−'}{money0(Math.abs(c.delta))}
                          </span>
                        )}
                      </>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PreviewBox>
  );
}

function TruckEditor({ truck, onChange }: { truck: TruckType; onChange: (patch: Partial<TruckType>) => void }) {
  const limits: TruckLimits = truck.limits ?? { lengthFt: null, widthFt: null, heightFt: null, weightLb: null };

  // Switching a truck to towing or hourly fills in a shape to edit, so the
  // admin is never shown a pricing kind with nothing under it to type into.
  function setPricing(pricing: PricingKind) {
    const patch: Partial<TruckType> = { pricing };
    if (pricing === 'hourly' && !truck.hourly) patch.hourly = { low: 0, high: 0 };
    if (pricing === 'towing' && !truck.towing) patch.towing = clonePlain(DEFAULT_QUOTE_RATES.trucks.find((t) => t.towing)!.towing!);
    if (pricing === 'perMile' && !Object.values(truck.perMile).some(Boolean)) {
      patch.perMile = { partial: null, ltl: null, tl: { low: 0, high: 0 } };
    }
    onChange(patch);
  }

  return (
    <div className="space-y-4 bg-gray-50 px-4 py-4 border-t border-gray-100">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="col-span-2">
          <label data-es className={LABEL}>Name</label>
          <input value={truck.name} maxLength={40} onChange={(e) => onChange({ name: e.target.value })} className={INPUT} />
        </div>
        <div>
          <label data-es className={LABEL}>Code</label>
          <input value={truck.code} maxLength={8} onChange={(e) => onChange({ code: e.target.value.toUpperCase() })} className={INPUT} />
        </div>
        <div>
          <label data-es className={LABEL}>Priced</label>
          <select value={truck.pricing} onChange={(e) => setPricing(e.target.value as PricingKind)} className={INPUT}>
            {PRICING_KINDS.map((k) => <option key={k} value={k}>{PRICING_KIND_LABEL[k]}</option>)}
          </select>
        </div>
      </div>

      {truck.pricing === 'perMile' && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {LOAD_SIZES.map((size) => (
            <RangeInput key={size} label={`${LOAD_SIZE_LABEL[size]} $/mi`} value={truck.perMile[size]} optional
              onChange={(r) => onChange({ perMile: { ...truck.perMile, [size]: r } })} />
          ))}
        </div>
      )}

      {truck.pricing === 'hourly' && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <RangeInput label="$ per hour" value={truck.hourly} onChange={(r) => onChange({ hourly: r })} />
        </div>
      )}

      {truck.pricing === 'towing' && truck.towing && (
        <div className="space-y-3">
          <div className="max-w-[220px]">
            <label data-es className={LABEL}>Local up to (miles)</label>
            <NumInput value={truck.towing.localUpToMiles}
              onChange={(v) => onChange({ towing: { ...truck.towing!, localUpToMiles: v ?? 0 } })} />
          </div>
          {(['local', 'long'] as const).map((tier) => (
            <TowingTierInput key={tier} label={tier === 'local' ? 'Local' : 'Long distance'} value={truck.towing![tier]}
              onChange={(v) => onChange({ towing: { ...truck.towing!, [tier]: v } })} />
          ))}
        </div>
      )}

      <div>
        <p className="text-[11px] font-medium text-gray-600 mb-1"><Bi>Biggest load it takes — blank is not checked</Bi></p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {([['lengthFt', 'Length (ft)'], ['widthFt', 'Width (ft)'], ['heightFt', 'Height (ft)'], ['weightLb', 'Weight (lbs)']] as const).map(([key, label]) => (
            <div key={key}>
              <label className={LABEL}>{label}</label>
              <NumInput value={limits[key]} onChange={(v) => onChange({ limits: { ...limits, [key]: v } })} />
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-3">
        <div>
          <label data-es className={LABEL}>Market check against</label>
          <select value={truck.market ?? ''} onChange={(e) => onChange({ market: (e.target.value || null) as MarketEquipment | null })} className={INPUT}>
            <option data-es value="">Nothing</option>
            {MARKET_EQUIPMENT.map((eq) => <option key={eq} value={eq}>{MARKET_EQUIPMENT_LABEL[eq]}</option>)}
          </select>
        </div>
        <div>
          <label data-es className={LABEL}>Notes for brokers</label>
          <input value={truck.notes} maxLength={500} onChange={(e) => onChange({ notes: e.target.value })} className={INPUT}
            placeholder="Upper deck height, axles, pallet count…" />
        </div>
      </div>
    </div>
  );
}

function clonePlain<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function TowingTierInput({ label, value, onChange }: { label: string; value: TowingTier; onChange: (v: TowingTier) => void }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-lg border border-gray-200 bg-white p-3">
      <p className="sm:col-span-3 text-xs font-semibold text-gray-800">{label}</p>
      <RangeInput label="Hook-up $" value={value.hookup} onChange={(r) => onChange({ ...value, hookup: r ?? { low: 0, high: 0 } })} />
      <div>
        <label data-es className={LABEL}>Miles included in hook-up</label>
        <NumInput value={value.includedMiles} onChange={(v) => onChange({ ...value, includedMiles: v ?? 0 })} />
      </div>
      <RangeInput label="Then $/mi" value={value.perMile} onChange={(r) => onChange({ ...value, perMile: r ?? { low: 0, high: 0 } })} />
    </div>
  );
}

/**
 * Low and high. Leaving the high blank means one figure, as the sheet's
 * merged cells did; leaving both blank, where allowed, means "not offered".
 */
function RangeInput({ label, value, onChange, optional = false }: {
  label: string;
  value: RateRange | null;
  onChange: (r: RateRange | null) => void;
  optional?: boolean;
}) {
  const set = (low: number | null, high: number | null) => {
    if (low === null && high === null) { onChange(optional ? null : { low: 0, high: 0 }); return; }
    const l = low ?? high ?? 0;
    onChange({ low: l, high: high ?? l });
  };
  return (
    <div>
      <label className={LABEL}>{label}</label>
      <div className="flex items-center gap-1.5">
        <NumInput value={value?.low ?? null} placeholder={optional ? '—' : 'Low'} onChange={(v) => set(v, value?.high ?? null)} />
        <span className="text-gray-400 text-xs">to</span>
        <NumInput value={value && value.high !== value.low ? value.high : null} placeholder={value ? String(value.low) : 'High'}
          onChange={(v) => set(value?.low ?? null, v)} />
      </div>
    </div>
  );
}

/**
 * A number box that keeps what is being typed ("2." on the way to "2.5")
 * instead of redrawing it from the parsed figure under the cursor.
 */
function NumInput({ value, onChange, placeholder }: {
  value: number | null;
  onChange: (v: number | null) => void;
  placeholder?: string;
}) {
  const [text, setText] = useState(value === null ? '' : String(value));
  useEffect(() => {
    const parsed = text.trim() === '' ? null : Number(text);
    if (parsed !== value) setText(value === null ? '' : String(value));
    // Only the parent's figure is watched; `text` changing is the typing.
  }, [value]);
  return (
    <input value={text} inputMode="decimal" placeholder={placeholder}
      onChange={(e) => {
        const t = e.target.value.replace(/[^\d.]/g, '');
        setText(t);
        const n = t.trim() === '' ? null : Number(t);
        if (n === null || Number.isFinite(n)) onChange(n);
      }}
      className={INPUT} />
  );
}

function IconButton({ label, onClick, disabled, children }: {
  label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode;
}) {
  return (
    <button type="button" title={label} aria-label={label} onClick={onClick} disabled={disabled}
      className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30 disabled:hover:bg-transparent">
      {children}
    </button>
  );
}
