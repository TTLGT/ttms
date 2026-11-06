'use client';

import {
  Bell, CalendarDays, ChevronLeft, ChevronRight, Circle, CheckCircle2, Columns3, Flame, ListOrdered,
  Plus, Route, StickyNote, Table2, Target, X, ZoomIn, ZoomOut, Trophy,
} from 'lucide-react';
import { Bar, Btn, Frame, Pill, Spot } from './Frame';

/* Drawings of My tasks, the Calendar and the planning card. Made-up items. */

const TASKS = [
  { t: 'Call Acme about Friday’s load', tag: 'bg-brand-400', due: 'Today 10:00', hi: true },
  { t: 'Send quote to Rivera Farms', tag: 'bg-green-400', due: 'Today 2:00' },
  { t: 'Follow up carrier MC 123456', tag: 'bg-amber-400', due: 'Tomorrow' },
  { t: 'Add 10 new prospects', tag: 'bg-purple-400', due: 'Fri' },
];

export function TasksOverviewScreen() {
  return (
    <Frame path="/dashboard/tasks">
      <div className="mb-2 flex items-center justify-between">
        <b className="text-[13px] text-gray-900">My tasks</b>
        <span className="flex gap-1.5">
          <span className="relative"><Btn>Clear done</Btn><Spot n={6} at="tl" /></span>
          <span className="relative"><Btn primary><Plus size={10} /> Add task</Btn><Spot n={4} at="tr" /></span>
        </span>
      </div>
      <div className="mb-2 grid grid-cols-3 gap-2">
        <div className="relative col-span-2 rounded-lg border border-brand-200 bg-brand-50 p-2">
          <div className="text-[9px] font-semibold uppercase text-brand-700">Up next</div>
          <div className="font-semibold text-gray-900">Call Acme about Friday&rsquo;s load</div>
          <div className="mt-1 flex items-center gap-2 text-gray-500"><Target size={10} /> Due today 10:00 <Btn primary className="ml-auto">Focus</Btn></div>
          <Spot n={1} at="tl" />
        </div>
        <div className="relative rounded-lg border border-orange-200 bg-orange-50 p-2 text-center">
          <Flame size={14} className="mx-auto text-orange-600" />
          <div className="text-[14px] font-bold text-gray-900">6</div>
          <div className="text-[9px] text-gray-500">day streak</div>
          <Spot n={2} at="tr" />
        </div>
      </div>
      <div className="mb-2 flex items-center justify-between">
        <span className="relative flex gap-1">
          <Pill on><ListOrdered size={10} className="mr-0.5" />Queue</Pill><Pill><Route size={10} className="mr-0.5" />Path</Pill>
          <Pill><Columns3 size={10} className="mr-0.5" />Board</Pill><Pill><StickyNote size={10} className="mr-0.5" />Sticky notes</Pill><Pill><Table2 size={10} className="mr-0.5" />Table</Pill>
          <Spot n={3} at="tl" />
        </span>
        <span className="relative flex gap-1">
          {['bg-brand-400', 'bg-green-400', 'bg-amber-400', 'bg-purple-400'].map((c) => <span key={c} className={`h-3 w-3 rounded-full ${c}`} />)}
          <Spot n={5} at="tr" />
        </span>
      </div>
      <div className="flex flex-col gap-1">
        {TASKS.map((t, i) => (
          <div key={t.t} className="flex items-center gap-2 rounded-md border border-gray-200 px-2 py-1.5">
            <span className="w-4 text-center font-bold text-gray-400">{i + 1}</span>
            <Circle size={12} className="text-gray-400" />
            <span className={`h-2 w-2 rounded-full ${t.tag}`} />
            <span className="flex-1 truncate text-gray-800">{t.t}</span>
            {t.hi && <span className="rounded bg-red-50 px-1 text-[9px] text-red-700">High</span>}
            <span className="text-gray-400">{t.due}</span>
          </div>
        ))}
      </div>
    </Frame>
  );
}

export function TasksEditorScreen() {
  const Field = ({ label, children, n }: { label: string; children: React.ReactNode; n?: number }) => (
    <label className="relative block">
      <span className="text-[9px] font-semibold uppercase tracking-wide text-gray-500">{label}</span>
      <div className="mt-0.5 rounded-md border border-gray-300 px-2 py-1 text-gray-800">{children}</div>
      {n && <Spot n={n} at="r" />}
    </label>
  );
  return (
    <Frame path="/dashboard/tasks" sidebar={false}>
      <div className="mx-auto max-w-md rounded-xl border border-gray-200 bg-white p-3 shadow-xl">
        <div className="mb-2 flex items-center justify-between">
          <span className="relative flex gap-1"><Pill on>Task</Pill><Pill>Event</Pill><Spot n={1} at="tr" /></span>
          <X size={12} className="text-gray-400" />
        </div>
        <div className="flex flex-col gap-2">
          <Field label="Title" n={2}>Call Acme about Friday&rsquo;s load</Field>
          <div className="relative grid grid-cols-2 gap-2"><Field label="Starts">Tue 9:00</Field><Field label="Ends">Tue 9:30</Field><Spot n={3} at="r" /></div>
          <div className="relative grid grid-cols-2 gap-2"><Field label="Due by">Thu, Nov 12</Field><Field label="Due time">12:00</Field><Spot n={4} at="r" /></div>
          <div className="relative grid grid-cols-3 gap-2">
            <Field label="Status">To do</Field><Field label="Priority">High</Field><Field label="Repeats">No</Field>
            <Spot n={5} at="r" />
          </div>
          <div className="relative flex flex-wrap gap-1 rounded-md border border-dashed border-gray-300 p-1.5 text-gray-500">
            With: <Pill>Ana López</Pill> Order: <Pill>#10482</Pill> Notes: <Bar w="w-16" />
            <Spot n={6} at="r" />
          </div>
          <div className="relative flex items-center gap-1.5 text-gray-600"><Bell size={11} /> Remind me: <Pill>15 min before</Pill> <Pill>+ Add</Pill><Spot n={7} at="r" /></div>
        </div>
        <div className="mt-3 flex justify-between">
          <span className="flex gap-1"><Btn>Duplicate</Btn><Btn className="text-red-600">Delete</Btn></span>
          <span className="relative"><Btn primary>Save</Btn><Spot n={8} at="tr" /></span>
        </div>
      </div>
    </Frame>
  );
}

export function TasksBoardScreen() {
  const cols = [
    { name: 'To do', items: ['Add 10 prospects', 'Quote Rivera'] },
    { name: 'In progress', items: ['Cover load 10482'] },
    { name: 'Waiting on someone', items: ['Acme to confirm', 'Carrier COI'] },
    { name: 'Done', items: ['Morning review'] },
  ];
  return (
    <Frame path="/dashboard/tasks">
      <div className="mb-2 flex items-center justify-between">
        <span className="flex gap-1"><Pill>Queue</Pill><Pill>Path</Pill><Pill on>Board</Pill></span>
        <span className="relative"><Btn><Columns3 size={10} /> Columns</Btn><Spot n={3} at="tr" /></span>
      </div>
      <div className="relative grid grid-cols-4 gap-2">
        <Spot n={1} at="tl" />
        {cols.map((c, i) => (
          <div key={c.name} className="rounded-lg bg-gray-50 p-1.5">
            <div className="mb-1 truncate text-[10px] font-semibold text-gray-700">{c.name} <span className="text-gray-400">{c.items.length}</span></div>
            {c.items.map((t, j) => (
              <div key={t} className={`relative mb-1 rounded-md border border-gray-200 bg-white px-1.5 py-1 shadow-sm ${i === 1 && j === 0 ? 'rotate-2 border-brand-300 shadow-md' : ''}`}>
                {i === 3 ? <span className="flex items-center gap-1 text-gray-400 line-through"><CheckCircle2 size={10} className="text-green-600" />{t}</span> : t}
                {i === 1 && j === 0 && <Spot n={2} at="tr" />}
              </div>
            ))}
          </div>
        ))}
      </div>
    </Frame>
  );
}

export function TasksGameScreen() {
  return (
    <Frame path="/dashboard/tasks">
      <div className="relative mb-2 overflow-hidden rounded-lg bg-gradient-to-r from-brand-900 to-indigo-900 p-3 text-white">
        <div className="flex items-center gap-2">
          <Trophy size={18} className="text-amber-300" />
          <div>
            <div className="text-[9px] uppercase tracking-wide text-white/60">Level 7 · Freight brokerage</div>
            <div className="text-[13px] font-bold">Carrier Wrangler</div>
          </div>
          <div className="ml-auto text-right"><div className="font-bold">1,240 XP</div><div className="text-[9px] text-white/60">160 to Deal Closer</div></div>
        </div>
        <div className="mt-2 h-1.5 rounded-full bg-white/20"><div className="h-1.5 w-3/4 rounded-full bg-amber-300" /></div>
        <Spot n={1} at="tl" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="relative rounded-lg border border-gray-200 p-2">
          <div className="mb-1 font-semibold text-gray-900">Missions</div>
          {['Finish 3 tasks today · 2/3', 'Finish a Hard task this week · 0/1', 'Be active 5 days · 4/5'].map((m) => (
            <div key={m} className="flex items-center gap-1 py-0.5"><Target size={10} className="text-brand-600" /> {m}</div>
          ))}
          <Spot n={2} at="tr" />
        </div>
        <div className="relative rounded-lg border border-gray-200 p-2">
          <div className="mb-1 font-semibold text-gray-900">Difficulty</div>
          {[['Trivial', 5], ['Easy', 15], ['Medium', 30], ['Hard', 60], ['Very hard', 90], ['Epic', 120]].map(([l, xp]) => (
            <div key={l} className="flex justify-between py-px"><span>{l}</span><span className="font-semibold text-brand-700">+{xp} XP</span></div>
          ))}
          <Spot n={3} at="tr" />
        </div>
      </div>
    </Frame>
  );
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function CalendarMonthScreen() {
  return (
    <Frame path="/dashboard/calendar">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="relative flex items-center gap-1"><Btn>Today</Btn><ChevronLeft size={12} /><ChevronRight size={12} /><b className="ml-1 text-[12px] text-gray-900">November</b><Spot n={1} at="tl" /></span>
        <span className="relative ml-auto flex gap-1"><Pill>Day</Pill><Pill>4 days</Pill><Pill>Week</Pill><Pill on>Month</Pill><Spot n={2} at="tr" /></span>
      </div>
      <div className="flex gap-2">
        <div className="hidden w-28 flex-shrink-0 flex-col gap-2 sm:flex">
          <div className="relative rounded-md border border-gray-200 p-1.5">
            <div className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-brand-500" /> My tasks</div>
            <div className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-cyan-500" /> My events</div>
            <Spot n={3} at="tr" />
          </div>
          <div className="relative grid grid-cols-7 gap-px rounded-md border border-gray-200 p-1 text-center text-[8px] text-gray-500">
            {Array.from({ length: 28 }).map((_, i) => <span key={i} className={i === 11 ? 'rounded bg-brand-600 text-white' : ''}>{i + 1}</span>)}
            <Spot n={4} at="tr" />
          </div>
        </div>
        <div className="grid flex-1 grid-cols-7 gap-px overflow-hidden rounded-md border border-gray-200 bg-gray-200">
          {DAYS.map((d) => <div key={d} className="bg-gray-50 px-1 py-0.5 text-[9px] font-semibold text-gray-500">{d}</div>)}
          {Array.from({ length: 14 }).map((_, i) => (
            <div key={i} className={`relative h-12 bg-white p-0.5 ${i === 9 ? 'ring-1 ring-inset ring-brand-400' : ''}`}>
              <span className={`text-[9px] ${i === 9 ? 'font-bold text-brand-700' : 'text-gray-400'}`}>{i + 2}</span>
              {i === 1 && <div className="truncate rounded bg-brand-100 px-0.5 text-[8px] text-brand-800">Call Acme</div>}
              {i === 3 && <div className="truncate rounded bg-cyan-100 px-0.5 text-[8px] text-cyan-800">Team huddle</div>}
              {i === 4 && <div className="truncate rounded bg-cyan-100 px-0.5 text-[8px] text-cyan-800">Weekly planning</div>}
              {i === 9 && <><div className="truncate rounded bg-brand-100 px-0.5 text-[8px] text-brand-800">Quote Rivera</div><Plus size={9} className="absolute right-0.5 top-0.5 text-brand-600" /><Spot n={5} at="br" /></>}
              {i === 6 && <><div className="truncate rounded bg-green-100 px-0.5 text-[8px] text-green-800">Holiday</div><Spot n={6} at="br" /></>}
            </div>
          ))}
        </div>
      </div>
    </Frame>
  );
}

export function CalendarWeekScreen() {
  const hours = ['8 AM', '9 AM', '10 AM', '11 AM', '12 PM', '1 PM'];
  return (
    <Frame path="/dashboard/calendar">
      <div className="mb-2 flex items-center gap-2">
        <Btn>Today</Btn><b className="text-[12px] text-gray-900">Nov 9 – 13</b>
        <span className="relative ml-auto flex gap-1 text-gray-500"><ZoomOut size={12} /><ZoomIn size={12} /><Spot n={4} at="tr" /></span>
      </div>
      <div className="relative mb-1 grid grid-cols-[2.5rem_repeat(5,1fr)] gap-px text-[9px]">
        <span className="text-gray-400">All day</span>
        <span /><span className="rounded bg-green-100 px-1 text-green-800">Payday</span><span /><span /><span />
        <Spot n={5} at="l" />
      </div>
      <div className="grid grid-cols-[2.5rem_repeat(5,1fr)] gap-px overflow-hidden rounded-md border border-gray-200 bg-gray-200">
        <div className="bg-gray-50" />
        {['Mon 9', 'Tue 10', 'Wed 11', 'Thu 12', 'Fri 13'].map((d) => <div key={d} className="bg-gray-50 px-1 py-0.5 text-[9px] font-semibold text-gray-600">{d}</div>)}
        {hours.map((h, r) => (
          <div key={h} className="contents">
            <div className="bg-white px-1 text-[8px] text-gray-400">{h}</div>
            {[0, 1, 2, 3, 4].map((c) => (
              <div key={c} className="relative h-7 bg-white">
                {r === 0 && c === 0 && <div className="absolute inset-x-0.5 top-0.5 h-12 rounded bg-cyan-100 px-1 text-[8px] text-cyan-800">Prospecting</div>}
                {r === 1 && c === 1 && <div className="absolute inset-x-0.5 top-0.5 z-[1] h-6 rotate-1 rounded bg-brand-100 px-1 text-[8px] text-brand-800 shadow-md">Call Acme<Spot n={2} at="tr" /></div>}
                {r === 2 && c === 3 && <div className="absolute inset-x-0.5 top-0.5 h-9 rounded bg-cyan-100 px-1 text-[8px] text-cyan-800">Huddle<span className="absolute inset-x-2 bottom-0 h-1 cursor-ns-resize rounded bg-cyan-400" /><Spot n={3} at="br" /></div>}
                {r === 4 && c === 2 && <div className="absolute inset-0.5 rounded border-2 border-dashed border-brand-300"><Spot n={1} at="tr" /></div>}
              </div>
            ))}
          </div>
        ))}
      </div>
    </Frame>
  );
}

export function PlanningPromptScreen() {
  return (
    <Frame path="/dashboard" sidebar={false}>
      <div className="mx-auto max-w-md rounded-xl border border-gray-200 bg-white p-3 shadow-xl">
        <div className="relative mb-2 flex items-center gap-2">
          <CalendarDays size={16} className="text-brand-600" />
          <div><b className="text-[12px] text-gray-900">When will you plan tomorrow?</b><div className="text-gray-500">End-of-day planning — a reminder at that time.</div></div>
          <Spot n={1} at="tr" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="relative rounded-md border border-gray-200 p-2">
            <div className="text-[9px] font-semibold uppercase text-gray-500">Start time</div>
            <div className="text-[14px] font-bold text-gray-900">3:30 PM</div>
            <div className="mt-1 flex gap-1"><Pill>15 min</Pill><Pill on>20 min</Pill><Pill>30 min</Pill></div>
            <Spot n={2} at="tr" />
          </div>
          <div className="rounded-md border border-gray-200 p-2">
            <div className="text-[9px] font-semibold uppercase text-gray-500">Your day</div>
            {[['7:00', 'Shift starts'], ['8:00', 'Prospecting'], ['1:00', 'Prospecting'], ['3:30', 'Planning'], ['4:00', 'Shift ends']].map(([t, l]) => (
              <div key={t} className={`flex gap-1.5 ${l === 'Planning' ? 'font-semibold text-brand-700' : ''}`}><span className="w-7 text-gray-400">{t}</span>{l}</div>
            ))}
          </div>
        </div>
        <label className="relative mt-2 flex items-center gap-1.5 text-gray-700">
          <span className="flex h-3 w-3 items-center justify-center rounded border border-brand-600 bg-brand-600 text-[8px] text-white">✓</span>
          Repeat every weekday at this time
          <Spot n={3} at="r" />
        </label>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <Btn primary>Add to my calendar</Btn>
          <span className="relative"><Btn>Use one you have</Btn><Spot n={4} at="tr" /></span>
          <span className="relative ml-auto flex gap-1.5 text-gray-500">Not now · Don&rsquo;t ask again<Spot n={5} at="tr" /></span>
        </div>
      </div>
    </Frame>
  );
}

export function BrokerDayScreen() {
  const blocks = [
    { t: '7:00', l: 'Morning review', w: 'w-[6%]', c: 'bg-brand-200' },
    { t: '7:15', l: 'Loads on the road', w: 'w-[9%]', c: 'bg-amber-200' },
    { t: '8:00', l: 'Prospecting', w: 'w-[17%]', c: 'bg-green-300' },
    { t: '9:30', l: 'Quotes', w: 'w-[6%]', c: 'bg-purple-200' },
    { t: '10:15', l: 'Cover loads', w: 'w-[20%]', c: 'bg-amber-200' },
    { t: '12:00', l: 'Lunch', w: 'w-[11%]', c: 'bg-gray-200' },
    { t: '1:00', l: 'Prospecting', w: 'w-[17%]', c: 'bg-green-300' },
    { t: '2:30', l: 'Follow-ups', w: 'w-[11%]', c: 'bg-purple-200' },
    { t: '3:30', l: 'Plan tomorrow', w: 'w-[6%]', c: 'bg-brand-200' },
  ];
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">A broker&rsquo;s day · 7:00 – 4:00</div>
      <div className="flex h-12 overflow-hidden rounded-lg">
        {blocks.map((b, i) => (
          <div key={i} className={`${b.w} ${b.c} flex flex-col justify-center border-r border-white px-1 text-[8px] leading-tight text-gray-800`} title={`${b.t} ${b.l}`}>
            <b>{b.t}</b><span className="truncate">{b.l}</span>
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-gray-600">
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-green-300" /> Finding new clients</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-amber-200" /> Running loads</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-purple-200" /> Quotes and follow-ups</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-brand-200" /> Planning</span>
      </div>
    </div>
  );
}
