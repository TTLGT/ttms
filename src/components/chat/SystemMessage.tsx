'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle, ArrowLeftRight, ArrowUpRight, Ban, Banknote, BadgeCheck, Check, CheckCircle2,
  CircleArrowRight, ClipboardList, Copy, FileDiff, FileText, FileX, Info, Mail, MapPin,
  MessageSquare, Navigation, PackageCheck, PartyPopper, PauseCircle, PenLine, Receipt, RotateCw,
  Send, ShieldAlert, ThumbsDown, ThumbsUp, Truck, Undo, Undo2, Upload, UserMinus, XCircle,
  type LucideIcon,
} from 'lucide-react';
import { clock } from '@/lib/chatFormat';
import { useChatAlertStyle, type ChatAlertStyle } from '@/lib/chatAlertStyle';
import {
  alertCardFor, type AlertCardModel, type AlertIcon, type AlertLink, type AlertTone,
} from '@/lib/chatAlertCards';
import { STATUS_LABEL, type OrderStatus } from '@/types/order';
import type { ChatMessage } from '@/types/conversation';

/**
 * A line from the server itself, in one of two shapes — see SystemMessageKind.
 *
 * **An alert** is TTMS saying what happened to a load. It used to be one
 * grey sentence in an 11px pill, and the rooms filled with walls of them:
 * "TTL IT changed the pickup and delivery, freight after the Shipper Agreement
 * was sent. The client's link is on hold and cannot be signed until…" with a
 * raw address on the end. Nobody could tell at a glance which ones mattered.
 *
 * Now each sentence is read back into a headline, who did it, tags, somebody's
 * own words and buttons (src/lib/chatAlertCards.ts), coloured by what it
 * means — green done, amber somebody has to act, red something stopped
 * working, blue news, violet the driver — and drawn in whichever of three
 * styles the reader picked in the chat header (src/lib/chatAlertStyle.ts):
 *
 *   - **Tickets** (the default): a solid coloured band with a one-word label,
 *     then the headline. The easiest to scan, which is why it is the default.
 *   - **Cards**: a tinted card with an icon tile; small events shrink to pills.
 *   - **Timeline**: updates in a row threaded on one line down the left.
 *
 * All three stay visibly not a colleague — centred or railed, never a bubble —
 * and inert: no arrow menu, no reactions, no thread. Anything worth saying
 * about an update is said under it, by a person.
 *
 * A line the reader does not recognise and that carries no link — the room's
 * own "Ana added Luis" lines — keeps the small centred pill. It is about the
 * conversation, not the freight, and a card would overstate it.
 *
 * **An announcement** is the company addressing the room — the daily
 * birthday and work-anniversary post. Centred, every line of the text, the
 * sender's name written out. Not affected by the style choice.
 */
export default function SystemMessage({
  message, joinAbove = false, joinBelow = false,
}: {
  message: ChatMessage;
  /** The message above is also a load update, same day: draw as one run. */
  joinAbove?: boolean;
  joinBelow?: boolean;
}) {
  const { style } = useChatAlertStyle();
  const text = message.text ?? '';
  const card = useMemo(
    () => (message.systemKind === 'announcement' ? null : alertCardFor(text)),
    [message.systemKind, text],
  );

  if (message.systemKind === 'announcement') return <Announcement message={message} />;
  if (!card) return <Pill message={message} />;
  return <AlertCard card={card} time={clock(message)} style={style} joinAbove={joinAbove} joinBelow={joinBelow} />;
}

/** True when this message draws as a load-update card — for MessageThread's runs. */
export function isLoadUpdate(m: ChatMessage): boolean {
  return Boolean(m.system && m.systemKind !== 'announcement' && alertCardFor(m.text ?? ''));
}

/* ----------------------------------------------------------- the palette */

/*
 * Every class written out in full: Tailwind finds classes by reading the
 * source, so a name built from pieces (`bg-${x}-600`) is never generated.
 * Only families tailwind.config.ts maps for dark mode are used, so the pale
 * grounds go dark and the inks go light without a `dark:` class. The solid
 * band shades (600) deliberately do not move, so white on them reads in both.
 */
const TONE: Record<AlertTone, {
  band: string; ink: string; icon: string; soft: string; edge: string; btn: string; bar: string;
}> = {
  success: { band: 'bg-emerald-600', ink: 'text-emerald-700', icon: 'text-emerald-600', soft: 'bg-emerald-50', edge: 'border-emerald-200', btn: 'bg-emerald-600 hover:bg-emerald-700', bar: 'bg-emerald-500' },
  warning: { band: 'bg-amber-600',   ink: 'text-amber-700',   icon: 'text-amber-600',   soft: 'bg-amber-50',   edge: 'border-amber-200',   btn: 'bg-amber-600 hover:bg-amber-700',     bar: 'bg-amber-500' },
  danger:  { band: 'bg-red-600',     ink: 'text-red-700',     icon: 'text-red-600',     soft: 'bg-red-50',     edge: 'border-red-200',     btn: 'bg-red-600 hover:bg-red-700',         bar: 'bg-red-500' },
  info:    { band: 'bg-blue-600',    ink: 'text-blue-700',    icon: 'text-blue-600',    soft: 'bg-blue-50',    edge: 'border-blue-200',    btn: 'bg-blue-600 hover:bg-blue-700',       bar: 'bg-blue-500' },
  neutral: { band: 'bg-gray-500',    ink: 'text-gray-700',    icon: 'text-gray-500',    soft: 'bg-gray-100',   edge: 'border-gray-200',    btn: 'bg-gray-600 hover:bg-gray-700',       bar: 'bg-gray-500' },
  driver:  { band: 'bg-violet-600',  ink: 'text-violet-700',  icon: 'text-violet-600',  soft: 'bg-violet-50',  edge: 'border-violet-200',  btn: 'bg-violet-600 hover:bg-violet-700',   bar: 'bg-violet-500' },
};

const ICONS: Record<AlertIcon, LucideIcon> = {
  status: CircleArrowRight, carrier: Truck, carrierOff: UserMinus, send: Send, resend: RotateCw,
  signed: PenLine, hold: PauseCircle, cancelled: Ban, swap: ArrowLeftRight, request: ClipboardList,
  returned: Undo2, done: CheckCircle2, bol: FileText, invoice: Receipt, pod: PackageCheck,
  removed: FileX, missing: AlertTriangle, waived: ShieldAlert, opened: MessageSquare,
  driver: Navigation, location: MapPin, payment: Banknote, mail: Mail, upload: Upload,
  verified: BadgeCheck, refused: XCircle, changeOrder: FileDiff, approved: ThumbsUp,
  declined: ThumbsDown, withdrawn: Undo, warning: AlertTriangle, info: Info,
};

/** The one word on a ticket's band. */
const BAND: Record<AlertIcon, string> = {
  status: 'Status', carrier: 'Carrier', carrierOff: 'Carrier', send: 'Sent', resend: 'Sent again',
  signed: 'Signed', hold: 'On hold', cancelled: 'Cancelled', swap: 'Carrier changed',
  request: 'Request', returned: 'Sent back', done: 'Done', bol: 'BOL', invoice: 'Invoice',
  pod: 'POD', removed: 'Removed', missing: 'Missing details', waived: 'Waived',
  opened: 'Discussion', driver: 'Driver', location: 'Driver', payment: 'Payment', mail: 'Emailed',
  upload: 'To verify', verified: 'Verified', refused: 'Refused', changeOrder: 'Change order',
  approved: 'Approved', declined: 'Turned down', withdrawn: 'Withdrawn',
  warning: 'Needs attention', info: 'Update',
};

/** The steps a status update draws its progress bar over. Cancelled has none. */
const STEPS: OrderStatus[] = ['quote', 'booked', 'shipper_signed', 'carrier_signed', 'in_transit', 'delivered', 'completed'];

/* ------------------------------------------------------------ the styles */

function AlertCard({ card, time, style, joinAbove, joinBelow }: {
  card: AlertCardModel; time: string; style: ChatAlertStyle; joinAbove: boolean; joinBelow: boolean;
}) {
  if (style === 'timeline') return <TimelineItem card={card} time={time} joinAbove={joinAbove} joinBelow={joinBelow} />;
  if (style === 'cards') return <CardItem card={card} time={time} tight={joinAbove} />;
  return <TicketItem card={card} time={time} tight={joinAbove} />;
}

function TicketItem({ card, time, tight }: { card: AlertCardModel; time: string; tight: boolean }) {
  const tone = TONE[card.tone];
  const Icon = ICONS[card.icon];
  const pad = tight ? 'pt-0.5 pb-1.5' : 'py-1.5';

  if (card.compact) {
    return (
      <div className={`flex justify-center px-2 ${pad}`}>
        <span className={`inline-flex max-w-[90%] items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${tone.soft} ${tone.ink}`}>
          <Icon size={13} className="flex-shrink-0" aria-hidden />
          <span className="min-w-0 select-text break-words">{pillText(card)}</span>
          <span className="flex-shrink-0 font-normal text-gray-500">{time}</span>
        </span>
      </div>
    );
  }

  return (
    <div className={`flex justify-center px-2 ${pad}`}>
      <div className="w-full max-w-[480px] overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-200">
        <div className={`flex items-center gap-1.5 px-3 py-1.5 text-[10.5px] font-bold uppercase tracking-[0.09em] text-white ${tone.band}`}>
          <Icon size={13} strokeWidth={2.4} aria-hidden />
          <span data-es>{BAND[card.icon]}</span>
          <span className="ml-auto font-semibold normal-case tracking-normal opacity-90">{time}</span>
        </div>
        <div className="flex flex-col gap-2 px-3.5 pb-3 pt-2.5">
          <div>
            <p className="select-text text-[15px] font-bold leading-snug text-gray-900">{card.title}</p>
            {card.by && <p className="select-text text-xs text-gray-500">{card.by}</p>}
          </div>
          <Body card={card} />
        </div>
      </div>
    </div>
  );
}

function CardItem({ card, time, tight }: { card: AlertCardModel; time: string; tight: boolean }) {
  const tone = TONE[card.tone];
  const Icon = ICONS[card.icon];
  const pad = tight ? 'pt-0.5 pb-1.5' : 'py-1.5';

  if (card.compact) {
    return (
      <div className={`flex justify-center px-2 ${pad}`}>
        <span className="inline-flex max-w-[90%] items-center gap-2 rounded-full border border-gray-200 bg-white py-1 pl-1 pr-3 text-[12.5px] font-medium text-gray-800 shadow-sm">
          <span className={`flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded-full ${tone.soft} ${tone.icon}`}>
            <Icon size={13} aria-hidden />
          </span>
          <span className="min-w-0 select-text break-words">{pillText(card)}</span>
          <span className="flex-shrink-0 text-[11px] font-normal text-gray-500">{time}</span>
        </span>
      </div>
    );
  }

  return (
    <div className={`flex justify-center px-2 ${pad}`}>
      <div className={`flex w-full max-w-[520px] gap-3 rounded-xl border px-3.5 py-3 ${tone.soft} ${tone.edge}`}>
        <span className={`flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded-[10px] bg-white ${tone.icon}`}>
          <Icon size={17} aria-hidden />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div>
            <p className="flex items-baseline justify-between gap-3">
              <span className="select-text text-sm font-semibold leading-snug text-gray-900">{card.title}</span>
              <span className="flex-shrink-0 text-[11px] text-gray-500">{time}</span>
            </p>
            {card.by && <p className="select-text text-xs text-gray-500">{card.by}</p>}
          </div>
          <Body card={card} />
        </div>
      </div>
    </div>
  );
}

/**
 * One stop on a line. The line is drawn per item, in two halves — above the
 * node when the message before is an update too, below it when the next one
 * is — so a run of updates joins up and a colleague's message breaks it.
 */
function TimelineItem({ card, time, joinAbove, joinBelow }: {
  card: AlertCardModel; time: string; joinAbove: boolean; joinBelow: boolean;
}) {
  const tone = TONE[card.tone];
  const Icon = ICONS[card.icon];

  return (
    <div className="relative pl-11 pr-2">
      {joinAbove && <span aria-hidden className="absolute left-[21px] top-0 h-2 w-0.5 bg-gray-300" />}
      {joinBelow && <span aria-hidden className="absolute bottom-0 left-[21px] top-9 w-0.5 bg-gray-300" />}
      <span className={`absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-full border-2 bg-white ${tone.edge} ${tone.icon}`}>
        <Icon size={14} aria-hidden />
      </span>
      <div className={`pt-2.5 ${joinBelow ? 'pb-2' : 'pb-3'}`}>
        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[13.5px]">
          <span className={`select-text font-semibold ${tone.ink}`}>
            {card.title}
          </span>
          {card.by && <span className="select-text text-gray-600">{card.by}</span>}
          <span className="ml-auto text-[11px] text-gray-500">{time}</span>
        </p>
        {!card.compact && (
          <div className="mt-1.5 flex max-w-[560px] flex-col gap-2">
            <Body card={card} quiet />
          </div>
        )}
      </div>
    </div>
  );
}

/* --------------------------------------------------------- shared pieces */

function pillText(card: AlertCardModel): string {
  return card.tags?.length ? `${card.title}: ${card.tags.join(', ')}` : card.title;
}

/** Everything under the headline, in the same order in every style. */
function Body({ card, quiet = false }: { card: AlertCardModel; quiet?: boolean }) {
  const tone = TONE[card.tone];
  const hasTrack = card.status && card.status !== 'cancelled';
  return (
    <>
      {card.detail && (
        <p className={`select-text text-[12.5px] leading-relaxed ${quiet ? 'text-gray-500' : 'text-gray-600'}`}>{card.detail}</p>
      )}
      {hasTrack && <StatusTrack status={card.status!} bar={tone.bar} />}
      {card.tags && card.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {card.tags.map((t) => (
            <span key={t} className="max-w-full select-text break-words rounded-md bg-gray-100 px-2 py-0.5 text-[11.5px] font-medium text-gray-700 [overflow-wrap:anywhere]">
              {t}
            </span>
          ))}
        </div>
      )}
      {card.quote && (
        <blockquote className={`border-l-2 pl-2.5 ${tone.edge}`}>
          <p data-es className="text-[10.5px] font-semibold uppercase tracking-wide text-gray-500">{card.quote.label}</p>
          <p className="select-text whitespace-pre-line text-[12.5px] leading-relaxed text-gray-700">{card.quote.text}</p>
        </blockquote>
      )}
      {card.links.length > 0 && <Buttons links={card.links} btn={tone.btn} />}
    </>
  );
}

function StatusTrack({ status, bar }: { status: OrderStatus; bar: string }) {
  const at = Math.max(0, STEPS.indexOf(status === 'carrier_assigned' ? 'booked' : status));
  return (
    <div aria-label={`Step ${at + 1} of ${STEPS.length}`}>
      <div className="flex gap-[3px]">
        {STEPS.map((s, i) => (
          <span key={s} className={`h-1 flex-1 rounded-full ${i <= at ? bar : 'bg-gray-200'}`} />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-gray-500">
        <span data-es>{STATUS_LABEL.quote}</span>
        <span data-es>{STATUS_LABEL.completed}</span>
      </div>
    </div>
  );
}

function Buttons({ links, btn }: { links: AlertLink[]; btn: string }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {links.map((l, i) => {
        const look = i === 0
          ? `${btn} text-white`
          : 'border border-gray-200 text-gray-700 hover:bg-gray-50';
        const cls = `inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${look}`;
        return (
          <span key={l.href} className="contents">
            {l.kind === 'internal' ? (
              <Link href={l.href} className={cls} data-es>{l.label}<ArrowUpRight size={13} aria-hidden /></Link>
            ) : (
              <a href={l.href} target="_blank" rel="noopener noreferrer" className={cls} data-es>
                {l.label}<ArrowUpRight size={13} aria-hidden />
              </a>
            )}
            {/* A signing link is the one people paste to a client or read out
                to a driver, so it keeps a Copy button beside it. */}
            {(l.kind === 'sign' || l.kind === 'map') && <CopyLink url={l.href} />}
          </span>
        );
      })}
    </div>
  );
}

/** A line that is not a load update — "Ana added Luis". The original pill. */
function Pill({ message }: { message: ChatMessage }) {
  return (
    <div className="flex justify-center px-2 py-1.5">
      <p className="flex max-w-[85%] items-start gap-1.5 rounded-2xl bg-white px-3 py-1 text-[11px] text-gray-600 shadow-sm">
        <Truck size={11} className="mt-0.5 flex-shrink-0 text-brand-500" />
        <span className="min-w-0 select-text whitespace-pre-line break-words [overflow-wrap:anywhere]">
          {message.text}
          <span className="ml-1.5 text-gray-400">{clock(message)}</span>
        </span>
      </p>
    </div>
  );
}

function Announcement({ message }: { message: ChatMessage }) {
  return (
    <div className="flex justify-center px-2 py-2.5">
      <div className="w-full max-w-md rounded-xl border border-brand-100 bg-brand-50/60 px-4 py-3 text-center shadow-sm">
        <PartyPopper size={16} className="mx-auto text-brand-500" aria-hidden />
        {/* `whitespace-pre-line` because the message is built from one line per
            person and a blank line between the two kinds — collapsed, it runs
            four people into one paragraph. Never truncated. */}
        <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-gray-800">
          {message.text}
        </p>
        {/* Signed at the foot, not headed at the top: as a sign-off it reads
            like the company saying it. */}
        <p className="mt-2.5 text-[12.5px] font-medium text-brand-700">
          — {message.senderName} <span className="font-normal text-gray-400">· {clock(message)}</span>
        </p>
      </div>
    </div>
  );
}

function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard refused (an insecure origin, a denied permission). The
      // button's own link still opens it, so there is nothing else to do.
    }
  }

  return (
    <button type="button" onClick={copy} title={url}
      className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-semibold text-gray-700 transition hover:bg-gray-50">
      {copied ? <Check size={13} className="text-green-600" /> : <Copy size={13} />}
      {copied ? 'Copied' : 'Copy link'}
    </button>
  );
}
