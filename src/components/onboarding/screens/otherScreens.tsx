'use client';

import {
  ArrowRight, Building2, Calculator, CheckCircle2, Copy, Factory, Handshake, LayoutGrid, Link2,
  List, MessageCircle, Network, Phone, Printer, Search, Truck, UserRound, Users, Warehouse, Clock,
} from 'lucide-react';
import { Avatar, Bar, Btn, Diagram, Frame, Pill, Spot } from './Frame';

/* Drawings of the Directory, the Quote calculator, and the freight diagrams. */

const PEOPLE = [
  { n: 'Ana López', r: 'Freight Broker', x: '214', tone: 'bg-pink-100 text-pink-700' },
  { n: 'Carlos Ruiz', r: 'Dispatcher', x: '108', tone: 'bg-indigo-100 text-indigo-700' },
  { n: 'Marta Díaz', r: 'Sales Manager', x: '301', tone: 'bg-green-100 text-green-700' },
  { n: 'Luis Pérez', r: 'Finance', x: '120', tone: 'bg-amber-100 text-amber-800' },
  { n: 'Sofía Gil', r: 'HR', x: '102', tone: 'bg-cyan-100 text-cyan-700' },
  { n: 'Diego Mora', r: 'Freight Broker', x: '233', tone: 'bg-purple-100 text-purple-700' },
];

export function DirectoryCardsScreen() {
  return (
    <Frame path="/dashboard/directory">
      <div className="mb-2 flex items-center justify-between">
        <b className="text-[13px] text-gray-900">Directory</b>
        <span className="relative flex gap-1"><Btn><Printer size={10} /> Print extension sheet</Btn><Btn>Export CSV</Btn><Spot n={5} at="tr" /></span>
      </div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="relative flex flex-1 items-center gap-1 rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-gray-400">
          <Search size={11} /> Search name, role, email, phone or extension<Spot n={1} at="tl" />
        </span>
        <span className="relative flex gap-1"><Pill on>My office</Pill><Pill>My team</Pill><Spot n={2} at="tr" /></span>
        <span className="relative flex gap-1 text-gray-500"><LayoutGrid size={12} className="text-brand-600" /><UserRound size={12} /><List size={12} /><Network size={12} /><Spot n={3} at="tr" /></span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {PEOPLE.map((p, i) => (
          <div key={p.n} className="relative flex items-center gap-2 rounded-lg border border-gray-200 p-2">
            <span className="relative"><Avatar tone={p.tone} label={p.n[0]} size="h-8 w-8" />{i < 4 && <span className="absolute -bottom-0 -right-0 h-2 w-2 rounded-full border border-white bg-green-500" />}</span>
            <div className="min-w-0">
              <div className="truncate font-semibold text-gray-900">{p.n}</div>
              <div className="truncate text-gray-500">{p.r}</div>
              <div className="text-gray-400">Ext. {p.x}</div>
            </div>
            {i === 0 && <Spot n={4} at="tr" />}
          </div>
        ))}
      </div>
    </Frame>
  );
}

export function DirectoryProfileScreen() {
  return (
    <Frame path="/dashboard/directory/ana">
      <div className="mb-3 flex items-center gap-3">
        <Avatar tone="bg-pink-100 text-pink-700" label="A" size="h-12 w-12" />
        <div className="flex-1"><div className="text-[13px] font-bold text-gray-900">Ana López</div><div className="text-gray-500">Freight Broker · Team North</div></div>
        <span className="relative"><Btn primary><MessageCircle size={10} /> Message</Btn><Spot n={1} at="tr" /></span>
        <span className="relative text-gray-400"><Link2 size={13} /><Spot n={5} at="tr" /></span>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="relative rounded-lg border border-gray-200 p-2">
          <div className="mb-1 font-semibold text-gray-900">How to reach them</div>
          <div className="flex items-center gap-1"><Phone size={10} /> (214) 555-0182 <Copy size={10} className="ml-auto text-gray-400" /></div>
          <div>Ext. 214</div><div className="truncate text-brand-700">ana@…</div>
          <Spot n={2} at="tr" />
        </div>
        <div className="relative rounded-lg border border-gray-200 p-2">
          <div className="mb-1 font-semibold text-gray-900">Where they sit</div>
          <div>Guatemala office</div><div className="text-brand-700">Team North</div><div className="text-gray-500">Lead: Marta Díaz</div>
          <Spot n={3} at="tr" />
        </div>
        <div className="relative rounded-lg border border-gray-200 p-2">
          <div className="mb-1 font-semibold text-gray-900">Book of business</div>
          <div className="flex justify-between"><span>Clients</span><b>24</b></div>
          <div className="flex justify-between"><span>Open loads</span><b>7</b></div>
          <Spot n={4} at="tr" />
        </div>
      </div>
    </Frame>
  );
}

export function MoneyFlowScreen() {
  return (
    <Diagram>
      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
        <Node Icon={Factory} title="Client" sub="pays TTL" tone="bg-blue-50 text-blue-700" />
        <Arrow label="$2,000" />
        <Node Icon={Handshake} title="TTL" sub="keeps the broker fee" tone="bg-brand-50 text-brand-700" big extra={<span className="mt-1 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-bold text-green-800">$300 fee</span>} />
        <Arrow label="$1,700" />
        <Node Icon={Truck} title="Carrier" sub="paid to move it" tone="bg-amber-50 text-amber-800" />
      </div>
    </Diagram>
  );
}

function Node({ Icon, title, sub, tone, big = false, extra }: {
  Icon: typeof Truck; title: string; sub: string; tone: string; big?: boolean; extra?: React.ReactNode;
}) {
  return (
    <div className={`flex flex-1 flex-col items-center rounded-xl border border-gray-200 bg-white p-3 text-center shadow-sm ${big ? 'sm:scale-105' : ''}`}>
      <span className={`mb-1 flex h-10 w-10 items-center justify-center rounded-full ${tone}`}><Icon size={20} /></span>
      <b className="text-sm text-gray-900">{title}</b>
      <span className="text-xs text-gray-500">{sub}</span>
      {extra}
    </div>
  );
}

function Arrow({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center text-gray-500">
      <span className="text-xs font-bold text-gray-800">{label}</span>
      <ArrowRight size={20} className="rotate-90 sm:rotate-0" />
    </div>
  );
}

export function QuoteCalculatorScreen() {
  const Card = ({ n, title, children }: { n: number; title: string; children: React.ReactNode }) => (
    <div className="relative rounded-lg border border-gray-200 p-2">
      <div className="mb-1 text-[9px] font-semibold uppercase tracking-wide text-gray-900">{title}</div>
      {children}
      <Spot n={n} at="tr" />
    </div>
  );
  return (
    <Frame path="/dashboard/quote-calculator">
      <div className="mb-2 flex items-center gap-1.5"><Calculator size={14} className="text-brand-600" /><b className="text-[13px] text-gray-900">Quote calculator</b></div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Card n={1} title="1 · Distance">
          <div className="mb-1 flex gap-1"><Pill on>From ZIP codes</Pill><Pill>Type it</Pill></div>
          <div className="flex gap-1"><span className="flex-1 rounded border border-gray-300 px-1.5 py-0.5">77001</span><span className="flex-1 rounded border border-gray-300 px-1.5 py-0.5">30301</span></div>
          <div className="mt-1 text-gray-500">≈ 790 mi <span className="text-[9px]">(estimate)</span></div>
        </Card>
        <Card n={2} title="2 · Freight">
          <div className="grid grid-cols-4 gap-1 text-center">{['L 20', 'W 8', 'H 9', '12,000'].map((v) => <span key={v} className="rounded border border-gray-300 py-0.5">{v}</span>)}</div>
          <div className="mt-1 text-gray-500">ft · lb</div>
        </Card>
        <Card n={3} title="3 · Truck">
          {[['Flatbed', 'Fits', 'text-green-700'], ['Step deck', 'Fits', 'text-green-700'], ['Hotshot', 'Too big', 'text-red-600']].map(([t, f, c], i) => (
            <div key={t} className={`flex items-center justify-between rounded px-1 py-0.5 ${i === 0 ? 'bg-brand-50' : ''}`}><span>{t}</span><span className={`font-semibold ${c}`}>{f}</span></div>
          ))}
        </Card>
        <Card n={4} title="4 · Price">
          <div className="flex justify-between text-[9px] text-gray-500"><span>Low</span><span>Mid</span><span>High</span></div>
          <div className="relative my-1 h-1.5 rounded-full bg-gray-200"><div className="absolute left-0 h-1.5 w-1/2 rounded-full bg-brand-500" /><span className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-brand-600 shadow" /></div>
          <div className="flex justify-between"><span>Price to the client</span><b className="text-gray-900">$2,000</b></div>
        </Card>
        <div className="sm:col-span-2">
          <Card n={5} title="5 · Driver and fee">
            <div className="flex flex-wrap items-center gap-2">
              <span>Driver pay <span className="rounded border border-gray-300 px-1.5 py-0.5">$1,700</span></span>
              <span className="relative flex gap-1"><Pill>Market $1,660</Pill><Pill>Leave $300 fee</Pill><Spot n={6} at="tr" /></span>
              <span className="ml-auto rounded-md bg-green-50 px-2 py-1 font-bold text-green-800">Broker fee $300 · 15%</span>
            </div>
            <div className="mt-1 flex items-center gap-1 text-gray-500"><CheckCircle2 size={10} className="text-green-600" /> At or above the target. Driver pay is within the market range.</div>
          </Card>
        </div>
      </div>
    </Frame>
  );
}

export function PartiesScreen() {
  return (
    <Diagram>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:items-center">
        <Node Icon={Warehouse} title="Shipper" sub="where it is picked up" tone="bg-blue-50 text-blue-700" />
        <ArrowRight size={18} className="mx-auto rotate-90 text-gray-400 sm:rotate-0" />
        <Node Icon={Truck} title="Carrier + driver" sub="moves it" tone="bg-amber-50 text-amber-800" />
        <ArrowRight size={18} className="mx-auto rotate-90 text-gray-400 sm:rotate-0" />
        <Node Icon={Building2} title="Consignee" sub="where it is delivered" tone="bg-green-50 text-green-700" />
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-brand-300 bg-brand-50 p-2 text-xs text-brand-800">
          <Handshake size={16} /> <span><b>TTL, the broker,</b> arranges it all: finds the carrier, agrees both prices, does the paperwork, follows the load.</span>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-gray-300 p-2 text-xs text-gray-700">
          <Users size={16} /> <span><b>The client</b> pays TTL. Often the shipper — but it can be anyone who needs the freight moved.</span>
        </div>
      </div>
    </Diagram>
  );
}

const STATUSES: { n: number; label: string; tone: string }[] = [
  { n: 1, label: 'Quote', tone: 'bg-gray-100 text-gray-700' },
  { n: 2, label: 'Booked', tone: 'bg-blue-50 text-blue-700' },
  { n: 3, label: 'Client Signed', tone: 'bg-indigo-50 text-indigo-700' },
  { n: 4, label: 'Carrier Signed', tone: 'bg-purple-50 text-purple-700' },
  { n: 5, label: 'In Transit', tone: 'bg-amber-50 text-amber-800' },
  { n: 6, label: 'Delivered', tone: 'bg-cyan-50 text-cyan-700' },
  { n: 7, label: 'Completed', tone: 'bg-green-50 text-green-700' },
];

export function LoadLifecycleScreen() {
  return (
    <Diagram>
      <div className="flex flex-wrap items-center justify-center gap-y-4">
        {STATUSES.map((s, i) => (
          <div key={s.n} className="flex items-center">
            <span className={`relative rounded-full border border-gray-200 px-3 py-1.5 text-xs font-semibold ${s.tone}`}>
              {s.label}<Spot n={s.n} at="tr" />
            </span>
            {i < STATUSES.length - 1 && <ArrowRight size={14} className="mx-1 text-gray-400" />}
          </div>
        ))}
      </div>
    </Diagram>
  );
}

export function CallFlowScreen() {
  const parts = ['Open', 'Reason', 'Questions', 'Offer', 'Next step'];
  return (
    <Diagram>
      <div className="flex flex-wrap items-stretch justify-center gap-2">
        {parts.map((p, i) => (
          <div key={p} className="relative flex min-w-[6rem] flex-1 flex-col items-center rounded-lg border border-gray-200 bg-white p-2 text-center shadow-sm">
            <span className="mb-1 flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-[11px] font-bold text-white">{i + 1}</span>
            <b className="text-xs text-gray-900">{p}</b>
            <span className="text-[10px] text-gray-500">{['10 sec', '15 sec', 'most of it', '15 sec', 'always'][i]}</span>
            <Spot n={i + 1} at="tr" />
          </div>
        ))}
      </div>
    </Diagram>
  );
}

export function AppShellScreen() {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
      <div className="flex">
        <div className="relative flex w-28 flex-shrink-0 flex-col gap-1 bg-brand-900 p-2 text-[10px] text-white/80">
          <b className="mb-1 [font-family:var(--font-rajdhani)] text-sm text-white">TTMS</b>
          {['Dashboard', 'Orders', 'Quote calculator', 'Clients', 'Directory', 'Chat', 'My tasks', 'Calendar', 'My onboarding'].map((l, i) => (
            <span key={l} className={`rounded px-1.5 py-0.5 ${i === 8 ? 'bg-brand-600 text-white' : ''}`}>{l}</span>
          ))}
          <Spot n={1} at="r" />
          <div className="relative mt-2 rounded bg-brand-800 p-1.5"><span className="flex items-center gap-1"><Clock size={10} /> Clocked in 7:02</span><Spot n={2} at="r" /></div>
          <div className="relative mt-1 flex items-center gap-1 rounded p-1"><Avatar label="Y" size="h-5 w-5" /> You<Spot n={3} at="r" /></div>
        </div>
        <div className="relative flex-1 p-3">
          <Spot n={4} at="tl" />
          <Bar w="w-24" className="mb-2 h-2.5" />
          <div className="grid grid-cols-3 gap-2">{[0, 1, 2].map((i) => <div key={i} className="h-12 rounded-lg border border-gray-200 bg-gray-50" />)}</div>
          <div className="mt-2 h-16 rounded-lg border border-gray-200 bg-gray-50" />
          <span className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-brand-500 text-white shadow-lg"><MessageCircle size={14} /><Spot n={5} at="tl" /></span>
        </div>
      </div>
    </div>
  );
}
