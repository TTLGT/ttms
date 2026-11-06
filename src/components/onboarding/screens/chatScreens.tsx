'use client';

import {
  AtSign, Bell, BellOff, Image as ImageIcon, MessageSquarePlus, MoreHorizontal, Paperclip, Pin,
  Search, Send, Settings, Smile, Star, Sticker, Tag, ArrowUp, ArrowDown, MessageSquare, X, LogOut, History,
} from 'lucide-react';
import { Avatar, Bar, Btn, Frame, Pill, Spot } from './Frame';

/*
 * Drawings of the Chat screens. Names in them are made up; nothing here reads
 * a conversation. See Frame.tsx for why these are drawings.
 */

const ROWS = [
  { name: 'Dispatch', tone: 'bg-cyan-100 text-cyan-700', unread: 3, bold: true, room: true },
  { name: 'Ana López', tone: 'bg-pink-100 text-pink-700', unread: 0 },
  { name: 'Load 10482', tone: 'bg-amber-100 text-amber-800', unread: 1, bold: true, room: true },
  { name: 'Everyone', tone: 'bg-green-100 text-green-700', unread: 0, room: true },
  { name: 'Carlos Ruiz', tone: 'bg-indigo-100 text-indigo-700', unread: 0 },
];

function ConversationColumn({ spots = true }: { spots?: boolean }) {
  return (
    <div className="flex w-[42%] flex-shrink-0 flex-col gap-2 border-r border-gray-200 pr-2">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-bold text-gray-900">Chats</span>
        <span className="flex items-center gap-1.5 text-gray-500">
          <ImageIcon size={12} /><Bell size={12} />
          <span className="relative inline-flex rounded-md bg-brand-600 p-1 text-white">
            <MessageSquarePlus size={12} />{spots && <Spot n={4} at="tr" />}
          </span>
        </span>
      </div>
      <div className="relative flex items-center gap-1 rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-gray-400">
        <Search size={11} /> Search rooms, people, messages
        {spots && <Spot n={2} at="r" />}
      </div>
      <div className="relative flex flex-wrap gap-1">
        <Pill on>All</Pill><Pill>Favorites</Pill><Pill>Unread</Pill><Pill>Rooms</Pill><Pill>Loads</Pill>
        {spots && <Spot n={3} at="r" />}
      </div>
      <div className="relative flex flex-col gap-1">
        {spots && <Spot n={1} at="l" />}
        {ROWS.map((r, i) => (
          <div key={r.name} className={`flex items-center gap-2 rounded-md px-1.5 py-1 ${i === 0 ? 'bg-brand-50' : ''}`}>
            <Avatar tone={r.tone} label={r.name[0]} />
            <div className="min-w-0 flex-1">
              <div className={`truncate ${r.bold ? 'font-bold text-gray-900' : 'text-gray-700'}`}>{r.name}</div>
              <Bar w="w-20" />
            </div>
            {r.unread > 0 && <span className="rounded-full bg-brand-600 px-1.5 text-[9px] font-bold text-white">{r.unread}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function Bubble({ who, text, mine = false, tone = 'bg-cyan-100 text-cyan-700' }: { who: string; text: string; mine?: boolean; tone?: string }) {
  return (
    <div className={`flex items-end gap-1.5 ${mine ? 'flex-row-reverse' : ''}`}>
      {!mine && <Avatar tone={tone} label={who[0]} size="h-5 w-5" />}
      <div className={`max-w-[80%] rounded-2xl px-2.5 py-1.5 ${mine ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-800'}`}>
        {!mine && <div className="mb-0.5 text-[9px] font-semibold opacity-70">{who}</div>}
        {text}
      </div>
    </div>
  );
}

function Composer({ spots = false }: { spots?: boolean }) {
  return (
    <div className="relative mt-2 flex items-center gap-1.5 border-t border-gray-200 pt-2">
      <span className="relative text-gray-500"><Paperclip size={14} />{spots && <Spot n={3} at="tl" />}</span>
      <span className="relative text-gray-500"><Smile size={14} />{spots && <Spot n={4} at="tl" />}</span>
      <span className="relative text-gray-500"><Sticker size={14} />{spots && <Spot n={5} at="tl" />}</span>
      <span className="relative flex-1 rounded-full border border-gray-300 px-3 py-1.5 text-gray-400">
        {spots ? <span className="text-gray-700">Driver is 20 min out, <b>*on time*</b> for <span className="rounded bg-brand-50 px-0.5 text-brand-700">@Ana</span></span> : 'Write a message… @ to name someone'}
        {spots && <><Spot n={1} at="tl" /><Spot n={2} at="br" /></>}
      </span>
      <span className="relative rounded-full bg-brand-600 p-1.5 text-white"><Send size={12} />{spots && <Spot n={6} at="tr" />}</span>
    </div>
  );
}

export function ChatOverviewScreen() {
  return (
    <Frame path="/dashboard/chat">
      <div className="flex gap-3">
        <ConversationColumn />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="relative flex items-center justify-between border-b border-gray-200 pb-2">
            <span className="flex items-center gap-1.5"><Avatar tone="bg-cyan-100 text-cyan-700" label="D" /><b className="text-gray-900">Dispatch</b><span className="text-gray-400">· 6 people</span></span>
            <span className="flex items-center gap-2 text-gray-500"><Search size={12} /><Paperclip size={12} /><Settings size={12} /></span>
            <Spot n={5} at="tr" />
          </div>
          <div className="relative flex flex-1 flex-col gap-2 py-2">
            <Spot n={6} at="l" />
            <Bubble who="Marta" text="Load 10482 picked up, BOL photo is on the order." />
            <Bubble who="You" mine text="Thanks! I will let the client know." />
            <Bubble who="Luis" tone="bg-indigo-100 text-indigo-700" text="Who has a flatbed near Houston for Friday?" />
          </div>
          <div className="relative"><Composer /><Spot n={7} at="r" /></div>
        </div>
      </div>
    </Frame>
  );
}

export function ChatNewScreen() {
  return (
    <Frame path="/dashboard/chat" sidebar={false}>
      <div className="flex gap-3">
        <div className="hidden w-1/3 opacity-50 sm:block"><ConversationColumn spots={false} /></div>
        <div className="relative mx-auto w-full max-w-sm rounded-xl border border-gray-200 bg-white p-3 shadow-xl">
          <span className="absolute right-2 top-2 text-gray-400"><X size={12} /></span>
          <div className="text-[13px] font-bold text-gray-900">New conversation</div>
          <div className="mb-2 text-gray-500">Message one person, or set up a room for a few of you.</div>
          <div className="relative mb-2 flex gap-1">
            <Pill>One person</Pill><Pill on>A room</Pill><Pill>Announcements only</Pill>
            <Spot n={2} at="r" />
          </div>
          <div className="relative mb-2 rounded-md border border-gray-300 px-2 py-1.5 text-gray-800">
            Night shift<Spot n={3} at="r" />
          </div>
          <div className="relative rounded-md border border-gray-200">
            <div className="flex items-center gap-1 border-b border-gray-200 px-2 py-1 text-gray-400"><Search size={11} /> Search people</div>
            {['Ana López', 'Carlos Ruiz', 'Marta Díaz'].map((n, i) => (
              <div key={n} className="flex items-center gap-2 px-2 py-1">
                <span className={`flex h-3 w-3 items-center justify-center rounded border ${i < 2 ? 'border-brand-600 bg-brand-600 text-white' : 'border-gray-300'}`}>{i < 2 ? '✓' : ''}</span>
                <Avatar label={n[0]} size="h-5 w-5" /> {n}
              </div>
            ))}
            <Spot n={4} at="r" />
          </div>
          <div className="relative mt-3 flex justify-end"><Btn primary>Create room</Btn><Spot n={5} at="tr" /></div>
          <span className="absolute -left-1 -top-1"><span className="relative inline-flex rounded-md bg-brand-600 p-1 text-white"><MessageSquarePlus size={12} /><Spot n={1} at="tl" /></span></span>
        </div>
      </div>
    </Frame>
  );
}

export function ChatComposerScreen() {
  return (
    <Frame path="/dashboard/chat">
      <div className="flex flex-col gap-2">
        <Bubble who="Ana" tone="bg-pink-100 text-pink-700" text="Is the driver going to make the 2pm appointment?" />
        <div className="relative">
          <div className="absolute -top-16 left-1/3 w-40 rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
            <div className="flex items-center gap-1.5 rounded bg-brand-50 px-1.5 py-1"><AtSign size={10} /><Avatar label="A" size="h-4 w-4" /> Ana López</div>
            <div className="flex items-center gap-1.5 px-1.5 py-1"><AtSign size={10} /><Avatar label="A" size="h-4 w-4" /> Andrés Gómez</div>
          </div>
          <Composer spots />
        </div>
      </div>
    </Frame>
  );
}

export function ChatMessageScreen() {
  return (
    <Frame path="/dashboard/chat">
      <div className="flex flex-col gap-3">
        <div className="relative flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-amber-800">
          <Pin size={11} /> <b>Pinned:</b> Yard address for Monday pickups — 4100 Main St
          <Spot n={4} at="r" />
        </div>
        <div className="relative pt-6">
          <div className="absolute right-6 top-0 flex items-center gap-0.5 rounded-full border border-gray-200 bg-white px-1.5 py-0.5 shadow-md">
            <span className="relative flex gap-0.5 text-[12px]">👍 ✅ ❓ 👀 🙏 ❤️<Spot n={1} at="tl" /></span>
            <span className="mx-1 h-3 w-px bg-gray-200" />
            <span className="relative text-gray-500"><MessageSquare size={12} /><Spot n={2} at="tr" /></span>
            <span className="relative ml-1 text-gray-500"><MoreHorizontal size={12} /><Spot n={3} at="br" /></span>
          </div>
          <Bubble who="Luis" tone="bg-indigo-100 text-indigo-700" text="Can someone check the insurance on carrier MC 123456 before 3pm?" />
          <div className="ml-7 mt-1 flex gap-1"><Pill>👍 2</Pill><Pill>👀 1</Pill><span className="text-[10px] text-brand-700">3 replies</span></div>
        </div>
        <div className="ml-auto w-44 rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
          {['Reply', 'Reply privately to Luis', 'Pin to room', 'Edit', 'Delete'].map((l) => (
            <div key={l} className={`rounded px-2 py-1 ${l === 'Delete' ? 'text-red-600' : ''}`}>{l}</div>
          ))}
        </div>
      </div>
    </Frame>
  );
}

export function ChatListMenuScreen() {
  return (
    <Frame path="/dashboard/chat">
      <div className="flex gap-3">
        <div className="w-1/2"><ConversationColumn spots={false} /></div>
        <div className="w-52 self-start rounded-lg border border-gray-200 bg-white p-1 shadow-xl">
          <div className="relative rounded px-2 py-1"><span className="flex items-center gap-1.5"><Pin size={11} /> Pin to top</span><Spot n={1} at="r" /></div>
          <div className="flex items-center gap-1.5 px-2 py-1 text-gray-500"><ArrowUp size={11} /> Move up <ArrowDown size={11} className="ml-2" /> Move down</div>
          <div className="relative rounded px-2 py-1"><span className="flex items-center gap-1.5"><Star size={11} /> Add to Favorites</span><Spot n={2} at="r" /></div>
          <div className="relative border-t border-gray-100 px-2 pb-1 pt-1.5">
            <div className="text-[9px] font-semibold uppercase tracking-wide text-gray-400">Lists</div>
            <div className="flex items-center gap-1.5 py-0.5"><Tag size={11} /> My clients <span className="ml-auto text-brand-600">✓</span></div>
            <div className="flex items-center gap-1.5 py-0.5"><Tag size={11} /> New list with this chat…</div>
            <Spot n={3} at="r" />
          </div>
          <div className="relative border-t border-gray-100 px-2 pb-1 pt-1.5">
            <div className="text-[9px] font-semibold uppercase tracking-wide text-gray-400">Notify me about</div>
            <div className="flex items-center gap-1.5 py-0.5"><Bell size={11} /> All messages <span className="ml-auto text-brand-600">●</span></div>
            <div className="flex items-center gap-1.5 py-0.5"><AtSign size={11} /> Only when named</div>
            <div className="flex items-center gap-1.5 py-0.5"><BellOff size={11} /> Nothing — mute</div>
            <Spot n={4} at="r" />
          </div>
        </div>
      </div>
    </Frame>
  );
}

export function ChatRoomSettingsScreen() {
  return (
    <Frame path="/dashboard/chat" sidebar={false}>
      <div className="mx-auto max-w-md rounded-xl border border-gray-200 bg-white p-3 shadow-xl">
        <div className="mb-2 flex items-center justify-between"><b className="text-[13px] text-gray-900">Room settings</b><X size={12} className="text-gray-400" /></div>
        <div className="relative mb-3 flex items-center gap-2">
          <Avatar tone="bg-cyan-100 text-cyan-700" label="N" size="h-9 w-9" />
          <div className="flex-1 rounded-md border border-gray-300 px-2 py-1">Night shift</div>
          <Spot n={1} at="tr" />
        </div>
        <div className="relative mb-3 rounded-md border border-gray-200 p-2">
          <div className="mb-1 font-semibold text-gray-900">People</div>
          {[['Ana López', 'Admin'], ['Carlos Ruiz', ''], ['Marta Díaz', 'Muted until 3pm']].map(([n, tag]) => (
            <div key={n} className="flex items-center gap-2 py-0.5">
              <Avatar label={n[0]} size="h-5 w-5" /> {n}
              {tag && <span className={`ml-auto rounded px-1 text-[9px] ${tag === 'Admin' ? 'bg-brand-50 text-brand-700' : 'bg-amber-50 text-amber-800'}`}>{tag}</span>}
            </div>
          ))}
          <div className="mt-1 rounded border border-dashed border-gray-300 px-2 py-0.5 text-gray-400">Add someone — type a name</div>
          <Spot n={2} at="tr" />
        </div>
        <div className="relative mb-3 rounded-md border border-gray-200 p-2">
          <div className="mb-1 font-semibold text-gray-900">What the room allows</div>
          {['Send messages', 'Add and remove people', 'Attach photos and files', 'Post links', 'Pin messages'].map((l, i) => (
            <div key={l} className="flex items-center justify-between py-0.5">
              {l}
              <span className="flex overflow-hidden rounded border border-gray-200 text-[9px]">
                <span className={`px-1.5 ${i !== 1 ? 'bg-brand-600 text-white' : ''}`}>Everyone</span>
                <span className={`px-1.5 ${i === 1 ? 'bg-brand-600 text-white' : ''}`}>Admins</span>
              </span>
            </div>
          ))}
          <Spot n={3} at="tr" />
        </div>
        <div className="flex items-center justify-between">
          <span className="relative flex items-center gap-1 text-gray-600"><History size={11} /> History<Spot n={4} at="tr" /></span>
          <span className="relative flex items-center gap-1 text-red-600"><LogOut size={11} /> Leave room<Spot n={5} at="tr" /></span>
        </div>
      </div>
    </Frame>
  );
}
