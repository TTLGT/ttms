'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, Loader2, Search } from 'lucide-react';
import { Bi, EsLine } from '@/components/spanish/Es';
import { recordMark, type MarkPatch } from '@/lib/incentives';
import { StateBadge } from './IncentiveCards';
import {
  formatGoalValue,
  formatReward,
  goalState,
  summarize,
  targetFor,
  type GoalMark,
  type IncentiveAbilities,
  type IncentiveGoal,
  type IncentiveParticipant,
  type IncentiveProgram,
  type IncentiveProgress,
} from '@/types/incentive';

const INPUT = 'border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-400';

/**
 * Where somebody records progress: pick a person on the left, change their
 * goals on the right. Each goal saves on its own Save button, so a half-typed
 * note on goal 7 is never sent along with a number on goal 2 — and each save
 * is one entry in the month's log. The server decides who may be recorded
 * for; the list here is only what it already allowed.
 */
export default function RecordPanel({ month, program, progress, abilities, onSaved }: {
  month: string;
  program: IncentiveProgram;
  progress: IncentiveProgress[];
  abilities: IncentiveAbilities;
  onSaved: (p: IncentiveProgress) => void;
}) {
  const people = useMemo(
    () => program.participants
      .filter((p) => abilities.recordAll || abilities.recordUids.includes(p.uid))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [program.participants, abilities],
  );
  const [selected, setSelected] = useState<string>(people[0]?.uid ?? '');
  const [q, setQ] = useState('');
  const byUid = useMemo(() => new Map(progress.map((p) => [p.uid, p])), [progress]);

  useEffect(() => {
    if (!people.some((p) => p.uid === selected)) setSelected(people[0]?.uid ?? '');
  }, [people, selected]);

  if (people.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center text-sm text-gray-500">
        <Bi>Nobody you can record for is taking part this month.</Bi>
      </div>
    );
  }

  const person = people.find((p) => p.uid === selected);
  const shown = people.filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
      <div className="rounded-xl border border-gray-200 bg-white p-2 lg:max-h-[70vh] lg:overflow-y-auto">
        <div className="relative m-1 mb-2">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a person" aria-label="Find a person"
            className={`${INPUT} w-full pl-9`} />
        </div>
        {shown.map((p) => {
          const s = summarize(program, p, byUid.get(p.uid));
          return (
            <button key={p.uid} type="button" onClick={() => setSelected(p.uid)}
              className={`w-full text-left rounded-lg px-3 py-2 flex items-center justify-between gap-2 text-sm ${p.uid === selected ? 'bg-brand-50 text-brand-700 font-semibold' : 'hover:bg-gray-50 text-gray-700'}`}>
              <span className="truncate">{p.name}</span>
              <span className="text-xs tabular-nums text-gray-500">{s.met}/{s.counted}</span>
            </button>
          );
        })}
      </div>

      {person && (
        <div className="space-y-3" key={person.uid}>
          <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-lg font-bold text-gray-900">{person.name}</h3>
            <p className="text-sm text-gray-600 tabular-nums">
              {formatReward(summarize(program, person, byUid.get(person.uid)).earned, program.currency)} <span data-es>earned so far</span>
            </p>
          </div>
          {program.goals.map((goal, i) => (
            <GoalRow key={goal.id} month={month} goal={goal} index={i} program={program}
              participant={person} mark={byUid.get(person.uid)?.marks[goal.id]} onSaved={onSaved} />
          ))}
          {program.prize && (
            <PrizeRow month={month} program={program} participant={person}
              progress={byUid.get(person.uid)} onSaved={onSaved} />
          )}
        </div>
      )}
    </div>
  );
}

function numberText(v: number | null | undefined): string {
  return v === null || v === undefined ? '' : String(v);
}

function parseNumber(text: string): number | null | 'bad' {
  const t = text.trim().replace(/[$,%\s]/g, '');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : 'bad';
}

function useSaver(month: string, onSaved: (p: IncentiveProgress) => void) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  async function save(patch: MarkPatch) {
    setSaving(true); setError(''); setSaved(false);
    try {
      onSaved(await recordMark(month, patch));
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  }
  return { saving, saved, error, save, setError };
}

function SaveButton({ dirty, saving, saved, onClick }: { dirty: boolean; saving: boolean; saved: boolean; onClick: () => void }) {
  if (saved && !dirty) {
    return <span className="inline-flex items-center gap-1 text-sm font-semibold text-green-700"><Check className="w-4 h-4" aria-hidden /> <span data-es>Saved</span></span>;
  }
  return (
    <button type="button" onClick={onClick} disabled={!dirty || saving}
      className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40">
      {saving && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}
      <span data-es>Save</span>
    </button>
  );
}

function GoalRow({ month, goal, index, program, participant, mark, onSaved }: {
  month: string;
  goal: IncentiveGoal;
  index: number;
  program: IncentiveProgram;
  participant: IncentiveParticipant;
  mark: GoalMark | undefined;
  onSaved: (p: IncentiveProgress) => void;
}) {
  const target = targetFor(goal, participant);
  const [value, setValue] = useState(numberText(mark?.value));
  const [done, setDone] = useState(mark?.done ?? false);
  const [na, setNa] = useState(mark?.na ?? false);
  const [note, setNote] = useState(mark?.note ?? '');
  const { saving, saved, error, save, setError } = useSaver(month, onSaved);

  const dirty = goal.kind === 'check'
    ? done !== (mark?.done ?? false) || na !== (mark?.na ?? false) || note !== (mark?.note ?? '')
    : value !== numberText(mark?.value) || na !== (mark?.na ?? false) || note !== (mark?.note ?? '');

  function submit() {
    const patch: MarkPatch = { uid: participant.uid, goalId: goal.id, na, note };
    if (goal.kind === 'check') patch.done = done;
    else {
      const n = parseNumber(value);
      if (n === 'bad') { setError('Type a number, or leave it empty for “not recorded”.'); return; }
      patch.value = n;
    }
    void save(patch);
  }

  // What the saved mark would read as, so the badge moves as they type.
  const preview: GoalMark = {
    value: goal.kind === 'check' ? null : (() => { const n = parseNumber(value); return n === 'bad' ? null : n; })(),
    done, na, note, at: '', byUid: '', byName: '',
  };
  const touched = goal.kind === 'check' ? Boolean(mark) || dirty : true;
  const state = goalState(goal, target, touched ? preview : undefined);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-gray-900">
            <span className="text-gray-400 mr-1.5">{index + 1}.</span>{goal.title}
            <EsLine>{goal.titleEs ?? ''}</EsLine>
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {formatReward(goal.reward, program.currency)}
            {goal.kind !== 'check' && <> · <span data-es>target</span> {goal.compare === 'above' ? 'more than ' : ''}{formatGoalValue(goal.kind, target)}</>}
            {goal.targetNote && <> · {goal.targetNote}</>}
          </p>
        </div>
        <StateBadge state={state} />
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        {goal.kind === 'check' ? (
          <label className="inline-flex items-center gap-2 text-sm text-gray-800">
            <input type="checkbox" checked={done} onChange={(e) => setDone(e.target.checked)} disabled={na}
              className="w-4 h-4 rounded border-gray-300" />
            <span data-es>Done</span>
          </label>
        ) : (
          <label className="text-sm text-gray-700">
            <span data-es className="block text-xs text-gray-500 mb-1">
              {goal.kind === 'percent' ? 'Percent' : goal.kind === 'usd' ? 'Dollars' : 'How many'}
            </span>
            <input value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" disabled={na}
              placeholder="Not recorded" className={`${INPUT} w-36 tabular-nums`} />
          </label>
        )}
        <label className="inline-flex items-center gap-2 text-sm text-gray-600 pb-2">
          <input type="checkbox" checked={na} onChange={(e) => setNa(e.target.checked)} className="w-4 h-4 rounded border-gray-300" />
          <span data-es>Does not apply</span>
        </label>
        <label className="flex-1 min-w-[14rem] text-sm">
          <span data-es className="block text-xs text-gray-500 mb-1">Note on the card (which clients, which orders)</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={1}
            className={`${INPUT} w-full resize-y`} />
        </label>
        <SaveButton dirty={dirty} saving={saving} saved={saved} onClick={submit} />
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}

function PrizeRow({ month, program, participant, progress, onSaved }: {
  month: string;
  program: IncentiveProgram;
  participant: IncentiveParticipant;
  progress: IncentiveProgress | undefined;
  onSaved: (p: IncentiveProgress) => void;
}) {
  const prize = program.prize!;
  const [value, setValue] = useState(numberText(progress?.prizeValue));
  const [note, setNote] = useState(progress?.prizeNote ?? '');
  const { saving, saved, error, save, setError } = useSaver(month, onSaved);
  const dirty = value !== numberText(progress?.prizeValue) || note !== (progress?.prizeNote ?? '');

  function submit() {
    const n = parseNumber(value);
    if (n === 'bad') { setError('Type a number, or leave it empty for “not recorded”.'); return; }
    void save({ uid: participant.uid, goalId: 'prize', value: n, note });
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
      <p className="font-semibold text-gray-900">
        <span data-es className="text-amber-700 mr-1.5">Prize:</span>{prize.title}
        <EsLine>{prize.titleEs ?? ''}</EsLine>
      </p>
      <p className="text-xs text-gray-500 mt-0.5">{prize.description}</p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="text-sm text-gray-700">
          <span data-es className="block text-xs text-gray-500 mb-1">
            {prize.kind === 'percent' ? 'Percent' : prize.kind === 'usd' ? 'Dollars' : 'How many'}
          </span>
          <input value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal"
            placeholder="Not recorded" className={`${INPUT} w-36 tabular-nums`} />
        </label>
        <label className="flex-1 min-w-[14rem] text-sm">
          <span data-es className="block text-xs text-gray-500 mb-1">Note</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={1} className={`${INPUT} w-full resize-y`} />
        </label>
        <SaveButton dirty={dirty} saving={saving} saved={saved} onClick={submit} />
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
