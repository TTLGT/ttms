'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, Loader2, Plus, Trash2, UserPlus, X } from 'lucide-react';
import { Bi } from '@/components/spanish/Es';
import { fetchPeople, saveMonth, type IncentivePerson } from '@/lib/incentives';
import {
  GOAL_KINDS,
  GOAL_KIND_LABEL,
  MAX_GOALS,
  MAX_LINKS,
  emptyProgram,
  formatReward,
  maxReward,
  monthLabel,
  newGoalId,
  type IncentiveGoal,
  type IncentiveLink,
  type IncentivePrize,
  type IncentiveProgram,
} from '@/types/incentive';

const INPUT = 'border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-400';
const LABEL = 'block text-xs font-semibold text-gray-600 mb-1';

/**
 * Setting a month up: what it is called, its goals and what each pays, the
 * prize, who takes part, and anybody's own targets. Everything is edited in
 * the page and sent as one save, which the server cleans and logs. The
 * English is required; each Spanish box is optional and shows under the
 * English for anybody with the Spanish switch on.
 */
export default function ProgramEditor({ month, program, previous, onSaved }: {
  month: string;
  /** This month's, or null when it has not been set up yet. */
  program: IncentiveProgram | null;
  /** The latest earlier month, offered as a starting point. */
  previous: IncentiveProgram | null;
  onSaved: (p: IncentiveProgram) => void;
}) {
  const [draft, setDraft] = useState<IncentiveProgram | null>(program);
  const [people, setPeople] = useState<IncentivePerson[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => { setDraft(program); }, [program]);
  useEffect(() => {
    fetchPeople().then(setPeople).catch((e) => setError(e instanceof Error ? e.message : 'Could not load people'));
  }, []);

  if (!draft) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center space-y-4">
        <p className="text-sm text-gray-600"><Bi>Nothing is set up for this month yet.</Bi></p>
        <div className="flex flex-wrap justify-center gap-2">
          {previous && (
            <button type="button" onClick={() => setDraft(emptyProgram(month, previous))}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
              Start from {monthLabel(previous.month)}
            </button>
          )}
          <button type="button" onClick={() => setDraft(emptyProgram(month))}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
            <span data-es>Start blank</span>
          </button>
        </div>
        {previous && (
          <p className="text-xs text-gray-500">
            <Bi>Starting from another month copies its goals, prize and people. Nobody’s progress or own targets are copied.</Bi>
          </p>
        )}
      </div>
    );
  }

  const d = draft;
  const set = (patch: Partial<IncentiveProgram>) => setDraft({ ...d, ...patch });
  const setGoal = (id: string, patch: Partial<IncentiveGoal>) =>
    set({ goals: d.goals.map((g) => (g.id === id ? { ...g, ...patch } : g)) });
  const moveGoal = (i: number, by: number) => {
    const goals = [...d.goals];
    const [g] = goals.splice(i, 1);
    goals.splice(i + by, 0, g);
    set({ goals });
  };
  const perPersonGoals = d.goals.filter((g) => g.perPerson);

  async function save() {
    setSaving(true); setError('');
    try {
      const saved = await saveMonth(month, d);
      setSavedAt(new Date().toLocaleTimeString());
      onSaved(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 pb-24">
      {/* ── The month ─────────────────────────────────────────────── */}
      <section className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
        <h3 className="font-bold text-gray-900"><Bi>The month</Bi></h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <label><span data-es className={LABEL}>Title</span>
            <input value={d.title} onChange={(e) => set({ title: e.target.value })} className={`${INPUT} w-full`} placeholder="TTL Black Friday Bonus" /></label>
          <label><span data-es className={LABEL}>Title in Spanish (optional)</span>
            <input value={d.titleEs ?? ''} onChange={(e) => set({ titleEs: e.target.value })} className={`${INPUT} w-full`} /></label>
          <label><span data-es className={LABEL}>A line under the title</span>
            <textarea value={d.intro} onChange={(e) => set({ intro: e.target.value })} rows={2} className={`${INPUT} w-full`} /></label>
          <label><span data-es className={LABEL}>The same in Spanish (optional)</span>
            <textarea value={d.introEs ?? ''} onChange={(e) => set({ introEs: e.target.value })} rows={2} className={`${INPUT} w-full`} /></label>
          <label><span data-es className={LABEL}>Rewards are paid in</span>
            <select value={d.currency} onChange={(e) => set({ currency: e.target.value === 'USD' ? 'USD' : 'GTQ' })} className={INPUT}>
              <option value="GTQ">Quetzales (Q)</option>
              <option value="USD">Dollars ($)</option>
            </select></label>
          <div className="self-end text-sm text-gray-600">
            <span data-es>Most one person can earn:</span>{' '}
            <span className="font-bold text-gray-900">{formatReward(maxReward(d), d.currency)}</span>
          </div>
        </div>
      </section>

      {/* ── Goals ─────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-bold text-gray-900"><Bi>Goals</Bi></h3>
          <button type="button" disabled={d.goals.length >= MAX_GOALS}
            onClick={() => {
              const g: IncentiveGoal = { id: newGoalId(), title: '', reward: 0, kind: 'count', compare: 'atLeast', target: 1, perPerson: false, how: '', links: [] };
              set({ goals: [...d.goals, g] });
              setOpen(g.id);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40">
            <Plus className="w-4 h-4" aria-hidden /> <span data-es>Add goal</span>
          </button>
        </div>
        {d.goals.length === 0 && <p className="text-sm text-gray-500"><Bi>No goals yet.</Bi></p>}
        {d.goals.map((g, i) => (
          <div key={g.id} className="rounded-lg border border-gray-200">
            <div className="flex items-center gap-2 px-3 py-2">
              <button type="button" onClick={() => setOpen(open === g.id ? null : g.id)} className="flex flex-1 min-w-0 items-center gap-2 text-left">
                <ChevronDown className={`w-4 h-4 flex-shrink-0 text-gray-400 transition-transform ${open === g.id ? 'rotate-180' : ''}`} aria-hidden />
                <span className="text-gray-400 text-sm">{i + 1}.</span>
                <span className="truncate font-semibold text-gray-900">{g.title || 'Untitled goal'}</span>
                <span className="ml-auto text-sm font-semibold text-brand-700 tabular-nums whitespace-nowrap">{formatReward(g.reward, d.currency)}</span>
              </button>
              <button type="button" onClick={() => moveGoal(i, -1)} disabled={i === 0} aria-label="Move up" className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30"><ArrowUp className="w-4 h-4" /></button>
              <button type="button" onClick={() => moveGoal(i, 1)} disabled={i === d.goals.length - 1} aria-label="Move down" className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30"><ArrowDown className="w-4 h-4" /></button>
              <button type="button" aria-label="Remove goal"
                onClick={() => { if (window.confirm(`Remove “${g.title || 'this goal'}”? Anything recorded against it stops counting.`)) set({ goals: d.goals.filter((x) => x.id !== g.id) }); }}
                className="p-1 text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
            </div>
            {open === g.id && (
              <div className="border-t border-gray-100 p-4 grid gap-4 sm:grid-cols-2">
                <label><span data-es className={LABEL}>Goal</span>
                  <input value={g.title} onChange={(e) => setGoal(g.id, { title: e.target.value })} className={`${INPUT} w-full`} placeholder="Reactivate 2 clients" /></label>
                <label><span data-es className={LABEL}>Goal in Spanish (optional)</span>
                  <input value={g.titleEs ?? ''} onChange={(e) => setGoal(g.id, { titleEs: e.target.value })} className={`${INPUT} w-full`} /></label>
                <label><span data-es className={LABEL}>Pays</span>
                  <NumberBox value={g.reward} onChange={(n) => setGoal(g.id, { reward: Math.max(0, n ?? 0) })} className={`${INPUT} w-40 tabular-nums`} /></label>
                <label><span data-es className={LABEL}>Measured as</span>
                  <select value={g.kind} onChange={(e) => {
                    const kind = e.target.value as IncentiveGoal['kind'];
                    setGoal(g.id, { kind, ...(kind === 'check' ? { target: null, perPerson: false } : { target: g.target ?? 1 }) });
                  }} className={`${INPUT} w-full`}>
                    {GOAL_KINDS.map((k) => <option key={k} value={k}>{GOAL_KIND_LABEL[k]}</option>)}
                  </select></label>
                {g.kind !== 'check' && (
                  <>
                    <div>
                      <span data-es className={LABEL}>Target</span>
                      <div className="flex flex-wrap items-center gap-2">
                        <select value={g.compare} onChange={(e) => setGoal(g.id, { compare: e.target.value === 'above' ? 'above' : 'atLeast' })} className={INPUT}>
                          <option value="atLeast">At least</option>
                          <option value="above">More than</option>
                        </select>
                        <NumberBox value={g.target} onChange={(n) => setGoal(g.id, { target: n })} className={`${INPUT} w-28 tabular-nums`} />
                        <span className="text-sm text-gray-500">{g.kind === 'percent' ? '%' : g.kind === 'usd' ? 'dollars' : ''}</span>
                      </div>
                    </div>
                    <label className="flex items-start gap-2 text-sm text-gray-700 sm:pt-5">
                      <input type="checkbox" checked={g.perPerson} onChange={(e) => setGoal(g.id, { perPerson: e.target.checked })} className="mt-0.5 w-4 h-4 rounded border-gray-300" />
                      <span><Bi>Each person has their own target</Bi>
                        <span className="block text-xs text-gray-500"><Bi>Set them under People below. The target above is used for anybody without one.</Bi></span></span>
                    </label>
                    <label className="sm:col-span-2"><span data-es className={LABEL}>What the target means (optional)</span>
                      <input value={g.targetNote ?? ''} onChange={(e) => setGoal(g.id, { targetNote: e.target.value })} className={`${INPUT} w-full`}
                        placeholder="Your best broker-fee month from June to October" /></label>
                  </>
                )}
                <label><span data-es className={LABEL}>How to get it — one step per line</span>
                  <textarea value={g.how} onChange={(e) => setGoal(g.id, { how: e.target.value })} rows={5} className={`${INPUT} w-full`} /></label>
                <label><span data-es className={LABEL}>The same in Spanish (optional, line for line)</span>
                  <textarea value={g.howEs ?? ''} onChange={(e) => setGoal(g.id, { howEs: e.target.value })} rows={5} className={`${INPUT} w-full`} /></label>
                <div className="sm:col-span-2">
                  <LinksEditor links={g.links} onChange={(links) => setGoal(g.id, { links })} />
                </div>
              </div>
            )}
          </div>
        ))}
      </section>

      {/* ── Prize ─────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-bold text-gray-900"><Bi>Prize for first place</Bi></h3>
          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={Boolean(d.prize)} className="w-4 h-4 rounded border-gray-300"
              onChange={(e) => set({ prize: e.target.checked ? { title: '', description: '', kind: 'percent', how: '', links: [] } : null })} />
            <span data-es>This month has a prize</span>
          </label>
        </div>
        {d.prize && <PrizeEditor prize={d.prize} onChange={(prize) => set({ prize })} />}
      </section>

      {/* ── People ────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-bold text-gray-900"><Bi>People</Bi> <span className="text-sm font-normal text-gray-500">({d.participants.length})</span></h3>
          <AddPerson people={people} taken={new Set(d.participants.map((p) => p.uid))}
            onAdd={(p) => set({ participants: [...d.participants, { uid: p.uid, name: p.name, targets: {} }] })} />
        </div>
        {d.participants.length === 0 ? (
          <p className="text-sm text-gray-500"><Bi>Nobody is taking part yet.</Bi></p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500">
                  <th data-es className="py-2 pr-4 font-semibold">Person</th>
                  {perPersonGoals.map((g) => (
                    <th key={g.id} className="py-2 pr-4 font-semibold whitespace-nowrap" title={g.title}>
                      {d.goals.indexOf(g) + 1}. {g.title.length > 22 ? `${g.title.slice(0, 22)}…` : g.title}
                    </th>
                  ))}
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {[...d.participants].sort((a, b) => a.name.localeCompare(b.name)).map((p) => (
                  <tr key={p.uid}>
                    <td className="py-2 pr-4 font-medium text-gray-900 whitespace-nowrap">{p.name}</td>
                    {perPersonGoals.map((g) => (
                      <td key={g.id} className="py-2 pr-4">
                        <NumberBox value={p.targets[g.id] ?? null} placeholder={g.target === null ? '' : String(g.target)}
                          label={`${p.name}: ${g.title}`}
                          onChange={(n) => {
                            const targets = { ...p.targets };
                            if (n === null) delete targets[g.id]; else targets[g.id] = n;
                            set({ participants: d.participants.map((x) => (x.uid === p.uid ? { ...x, targets } : x)) });
                          }}
                          className={`${INPUT} w-24 tabular-nums`} />
                      </td>
                    ))}
                    <td className="py-2 text-right">
                      <button type="button" aria-label={`Remove ${p.name}`}
                        onClick={() => set({ participants: d.participants.filter((x) => x.uid !== p.uid) })}
                        className="p-1 text-gray-400 hover:text-red-600"><X className="w-4 h-4" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {perPersonGoals.length > 0 && (
              <p className="mt-2 text-xs text-gray-500"><Bi>An empty box uses the goal’s own target, shown faintly.</Bi></p>
            )}
          </div>
        )}
      </section>

      {/* ── Save ──────────────────────────────────────────────────── */}
      <div className="sticky bottom-0 -mx-1 flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur">
        <button type="button" onClick={save} disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
          {saving && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}
          Save {monthLabel(month)}
        </button>
        {savedAt && !error && <span className="text-sm text-green-700">Saved at {savedAt}</span>}
        {error && <span className="text-sm text-red-600">{error}</span>}
        <span className="ml-auto text-xs text-gray-500"><Bi>Everybody signed in sees what you save here.</Bi></span>
      </div>
    </div>
  );
}

/**
 * A number typed as text. The text is kept as typed ("13." on the way to
 * "13.5") and only a complete number is passed up; an empty box is null.
 */
function NumberBox({ value, onChange, className, placeholder, label }: {
  value: number | null;
  onChange: (n: number | null) => void;
  className: string;
  placeholder?: string;
  label?: string;
}) {
  const [text, setText] = useState(value === null ? '' : String(value));
  // Follow a change made from outside (a goal switched to "done or not"),
  // but not the echo of what was just typed.
  useEffect(() => {
    setText((t) => (Number(t.replace(/,/g, '')) === value && t.trim() !== '' ? t : value === null ? '' : String(value)));
  }, [value]);
  return (
    <input value={text} inputMode="decimal" placeholder={placeholder} aria-label={label} className={className}
      onChange={(e) => {
        const t = e.target.value;
        setText(t);
        const clean = t.replace(/[,$%\s]/g, '');
        if (clean === '') onChange(null);
        else if (Number.isFinite(Number(clean))) onChange(Number(clean));
      }} />
  );
}

function LinksEditor({ links, onChange }: { links: IncentiveLink[]; onChange: (l: IncentiveLink[]) => void }) {
  return (
    <div>
      <span data-es className={LABEL}>Links on the card (forms, sheets)</span>
      <div className="space-y-2">
        {links.map((l, i) => (
          <div key={i} className="flex flex-wrap gap-2">
            <input value={l.label} placeholder="Button text" onChange={(e) => onChange(links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} className={`${INPUT} w-48`} />
            <input value={l.url} placeholder="https://…" onChange={(e) => onChange(links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} className={`${INPUT} flex-1 min-w-[12rem]`} />
            <button type="button" aria-label="Remove link" onClick={() => onChange(links.filter((_, j) => j !== i))} className="p-2 text-gray-400 hover:text-red-600"><X className="w-4 h-4" /></button>
          </div>
        ))}
        {links.length < MAX_LINKS && (
          <button type="button" onClick={() => onChange([...links, { label: '', url: '' }])}
            className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline">
            <Plus className="w-4 h-4" aria-hidden /> <span data-es>Add link</span>
          </button>
        )}
      </div>
    </div>
  );
}

function PrizeEditor({ prize, onChange }: { prize: IncentivePrize; onChange: (p: IncentivePrize) => void }) {
  const set = (patch: Partial<IncentivePrize>) => onChange({ ...prize, ...patch });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label><span data-es className={LABEL}>Prize goes to</span>
        <input value={prize.title} onChange={(e) => set({ title: e.target.value })} className={`${INPUT} w-full`} placeholder="Best sales percentage of the month" /></label>
      <label><span data-es className={LABEL}>The same in Spanish (optional)</span>
        <input value={prize.titleEs ?? ''} onChange={(e) => set({ titleEs: e.target.value })} className={`${INPUT} w-full`} /></label>
      <label><span data-es className={LABEL}>What is won</span>
        <input value={prize.description} onChange={(e) => set({ description: e.target.value })} className={`${INPUT} w-full`} placeholder="A new TV, 43 inches or larger" /></label>
      <label><span data-es className={LABEL}>Ranked on</span>
        <select value={prize.kind} onChange={(e) => set({ kind: e.target.value as IncentivePrize['kind'] })} className={`${INPUT} w-full`}>
          <option value="percent">A percentage (highest wins)</option>
          <option value="usd">A dollar amount (highest wins)</option>
          <option value="count">A number (highest wins)</option>
        </select></label>
      <label><span data-es className={LABEL}>How it is decided — one step per line</span>
        <textarea value={prize.how} onChange={(e) => set({ how: e.target.value })} rows={3} className={`${INPUT} w-full`} /></label>
      <label><span data-es className={LABEL}>The same in Spanish (optional)</span>
        <textarea value={prize.howEs ?? ''} onChange={(e) => set({ howEs: e.target.value })} rows={3} className={`${INPUT} w-full`} /></label>
      <div className="sm:col-span-2"><LinksEditor links={prize.links} onChange={(links) => set({ links })} /></div>
    </div>
  );
}

function AddPerson({ people, taken, onAdd }: {
  people: IncentivePerson[] | null;
  taken: Set<string>;
  onAdd: (p: IncentivePerson) => void;
}) {
  const [value, setValue] = useState('');
  const free = useMemo(() => (people ?? []).filter((p) => !taken.has(p.uid)), [people, taken]);
  return (
    <div className="flex items-center gap-2">
      <select value={value} onChange={(e) => setValue(e.target.value)} className={INPUT} aria-label="Person to add" disabled={!people}>
        <option value="">{people ? 'Choose a person…' : 'Loading…'}</option>
        {free.map((p) => <option key={p.uid} value={p.uid}>{p.name}</option>)}
      </select>
      <button type="button" disabled={!value}
        onClick={() => { const p = free.find((x) => x.uid === value); if (p) { onAdd(p); setValue(''); } }}
        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40">
        <UserPlus className="w-4 h-4" aria-hidden /> <span data-es>Add</span>
      </button>
    </div>
  );
}
