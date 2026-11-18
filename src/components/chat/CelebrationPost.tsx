'use client';

import { useId } from 'react';
import Image from 'next/image';
import { MessageSquare } from 'lucide-react';
import { clock } from '@/lib/chatFormat';
import type { CelebrationCard } from '@/types/celebration';
import type { ChatMessage } from '@/types/conversation';

/**
 * The daily birthday and work-anniversary post, drawn as cards (2026-11-17).
 *
 * Picked from the "TTMS Celebration Post" design canvas:
 *   - **Work anniversary → "On the road"** (Anniversary option 4): a navy card
 *     with a night road, a truck driving up to a finish flag that carries the
 *     year count, then the name large and HR's own line under it. One card per
 *     person, because each person's count is different.
 *   - **Birthday → "Cake and candles"** (Birthday option 2): a warm cream card
 *     with a cake whose candles flicker, "Make a wish", the name(s) large and
 *     HR's line. One card for everybody, as the birthday template is one line
 *     for everybody.
 *
 * Still one message — several cards in one message is one notification. The
 * company signs it once at the foot, like the plain announcement card did.
 *
 * The colours are fixed hex on purpose, not the mapped Tailwind families: the
 * cards are pictures, and a navy road or a cream cake that flipped with dark
 * mode would stop being either. Both already read well on a dark room.
 *
 * Still inert, like every system message: no reactions, no thread. The one
 * button only puts a greeting in the reader's own box to send — "happy
 * birthday" belongs to colleagues, and the post exists to prompt it. It is
 * left out when the reader cannot write in the room (`onCongratulate` unset).
 *
 * Animations live in globals.css (tt-anniv-*, tt-cake-*) and stop for anybody
 * who has asked for less motion.
 */
export default function CelebrationPost({
  message, cards, onCongratulate,
}: {
  message: ChatMessage;
  cards: CelebrationCard[];
  /** Puts a greeting in the composer. Unset = the reader cannot post here. */
  onCongratulate?: (text: string) => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-2 py-2.5">
      {cards.map((card, i) => (card.kind === 'birthday'
        ? <CakeCard key={`b${i}`} card={card} onCongratulate={onCongratulate} />
        : <RoadCard key={`a${i}`} card={card} onCongratulate={onCongratulate} />))}
      {/* Signed at the foot, as the company saying it — once for the whole post. */}
      <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-gray-500">
        <Image src="/logo-circle.png" alt="" width={18} height={18} className="flex-shrink-0" />
        — {message.senderName} <span className="font-normal text-gray-400">· {clock(message)}</span>
      </p>
    </div>
  );
}

/* ------------------------------------------------------------- helpers */

/** "Ana", "Ana and Tom", "Ana, Tom and Luis" — first names, for the button. */
function firstNames(names: string[]): string {
  const firsts = names.map((n) => n.split(' ')[0]);
  if (firsts.length <= 1) return firsts[0] ?? '';
  return `${firsts.slice(0, -1).join(', ')} and ${firsts[firsts.length - 1]}`;
}

function yearsPhrase(years: number): string {
  return `${years} ${years === 1 ? 'year' : 'years'}`;
}

/**
 * The speech-bubble button under each card. Same shape on both, own colours.
 * Never wraps: on a phone under 400px wide it tightens its padding and text a
 * little instead, so "Wish them a happy birthday" stays on one line.
 */
function GreetButton({ label, onClick, className }: { label: string; onClick: () => void; className: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`mt-1 inline-flex min-h-[44px] items-center gap-2 whitespace-nowrap rounded-xl px-4 text-[14px] font-semibold transition min-[400px]:px-5 min-[400px]:text-[15px] ${className}`}
    >
      <MessageSquare size={18} aria-hidden />
      {label}
    </button>
  );
}

/* ------------------------------------------- anniversary: on the road */

/** The logo's own colours, so the shield and the rule read as the brand. */
const TTL_RED  = '#b80006';
const TTL_NAVY = '#0b1f5c';

/** The route shield's outline, used for its clip and its white border. */
const SHIELD_PATH = 'M0 6 Q25 0 50 6 Q75 0 100 6 Q106 64 50 108 Q-6 64 0 6 Z';

/**
 * "On the road", redrawn 2026-11-17 for a finished, grown-up look:
 *
 *   - a white header band carrying the full TTL logo, centred like the
 *     birthday card's, over a thin brand-red rule — a letterhead, not a prop;
 *   - a dusk highway seen from the driver's seat: a sky that warms toward the
 *     horizon, a soft low sun, two layers of mountains, and a road in
 *     perspective running to the vanishing point;
 *   - the year count on a route-marker shield in the logo's red and navy,
 *     on a pole over the sunset — the milestone;
 *   - the truck from the first version, redrawn: a navy cab and a white
 *     trailer with the brand-red stripe, headlights on, driving past red and
 *     gold pennants and pulling up under the shield, which glows as it
 *     arrives.
 *
 * tt-anniv-* in globals.css; for reduced motion the truck is simply parked
 * under the shield and nothing moves.
 */
function RoadCard({ card, onCongratulate }: { card: CelebrationCard; onCongratulate?: (text: string) => void }) {
  const name  = card.names[0] ?? '';
  const first = firstNames([name]);
  // Gradient and clip ids must be unique per card: a busy day draws several.
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const id  = (k: string) => `${k}-${uid}`;
  const url = (k: string) => `url(#${id(k)})`;
  // Two digits need a smaller number to sit inside the shield.
  const big = card.years >= 10;

  return (
    <div className="w-full max-w-[480px] overflow-hidden rounded-3xl bg-[#0b1b3a] text-white shadow-[0_24px_48px_-16px_rgba(11,27,58,0.45)]">
      {/* Letterhead: the full logo on white, where its navy letters belong. */}
      <div className="flex justify-center bg-white px-6 py-3.5">
        <Image src="/logo-full-hd.png" alt="Total Transport Logistics" width={240} height={101} className="h-auto w-[190px] max-w-full" />
      </div>
      <div aria-hidden className="h-[3px]" style={{ background: TTL_RED }} />

      {/* The dusk highway — one scaled SVG, so the truck stops under the
          shield at any card width (CSS px in an SVG transform are user units). */}
      <svg viewBox="0 0 560 250" className="block h-auto w-full" aria-hidden>
        <defs>
          <linearGradient id={id('sky')} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#0a1733" />
            <stop offset="0.55" stopColor="#1d3a72" />
            <stop offset="0.85" stopColor="#c46a4a" />
            <stop offset="1" stopColor="#f2a65a" />
          </linearGradient>
          <radialGradient id={id('sun')} cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#ffe3a3" stopOpacity="0.95" />
            <stop offset="0.35" stopColor="#f6b25e" stopOpacity="0.55" />
            <stop offset="1" stopColor="#f6b25e" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={id('far')} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#3b4f86" />
            <stop offset="1" stopColor="#2a3d6e" />
          </linearGradient>
          <linearGradient id={id('near')} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#1b2c57" />
            <stop offset="1" stopColor="#13213f" />
          </linearGradient>
          <linearGradient id={id('ground')} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#13213f" />
            <stop offset="1" stopColor="#0f1d3a" />
          </linearGradient>
          <linearGradient id={id('road')} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#465068" />
            <stop offset="1" stopColor="#222b3d" />
          </linearGradient>
          <linearGradient id={id('trailer')} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="1" stopColor="#d9e0ea" />
          </linearGradient>
          <linearGradient id={id('glass')} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#dbeafe" />
            <stop offset="1" stopColor="#7aa2d6" />
          </linearGradient>
          <linearGradient id={id('beam')} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#fde68a" stopOpacity="0.55" />
            <stop offset="1" stopColor="#fde68a" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={id('fade')} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#0b1b3a" stopOpacity="0" />
            <stop offset="1" stopColor="#0b1b3a" stopOpacity="1" />
          </linearGradient>
          <clipPath id={id('shield')}>
            <path d={SHIELD_PATH} />
          </clipPath>
        </defs>

        {/* Sky, stars and the low sun behind the shield */}
        <rect width="560" height="190" fill={url('sky')} />
        <g fill="#fff">
          <circle className="tt-anniv-star" cx="48" cy="26" r="1.3" />
          <circle className="tt-anniv-star" cx="132" cy="54" r="0.9" style={{ animationDelay: '-1.1s' }} />
          <circle className="tt-anniv-star" cx="214" cy="20" r="1.1" style={{ animationDelay: '-2.2s' }} />
          <circle className="tt-anniv-star" cx="300" cy="44" r="1.3" style={{ animationDelay: '-0.6s' }} />
          <circle className="tt-anniv-star" cx="372" cy="16" r="0.9" style={{ animationDelay: '-1.7s' }} />
        </g>
        <circle className="tt-anniv-sun" cx="466" cy="150" r="150" fill={url('sun')} />

        {/* Mountains, far then near */}
        <path d="M0 136 C40 118 70 104 112 112 C150 120 172 96 214 100 C250 104 262 126 280 130 C300 126 318 98 360 94 C404 90 430 118 470 112 C510 106 536 120 560 116 V190 H0 Z"
          fill={url('far')} opacity="0.85" />
        <path d="M0 152 C34 140 62 134 98 142 C132 150 160 130 196 136 C226 141 248 154 280 156 C312 154 336 138 370 134 C410 130 438 150 478 146 C514 142 540 148 560 144 V190 H0 Z"
          fill={url('near')} />
        <rect y="160" width="560" height="30" fill={url('ground')} />

        {/* Pennants along the far shoulder — the truck drives past them */}
        <g>
          {[110, 210, 310].map((x, i) => (
            <g key={x}>
              <rect x={x} y="150" width="2" height="38" fill="#cbd5e1" />
              <path className="tt-anniv-pennant" style={{ animationDelay: `-${i * 0.4}s` }}
                d={`M${x + 2} 151 L${x + 26} 157 L${x + 2} 163 Z`} fill={i % 2 ? '#f5c451' : TTL_RED} />
            </g>
          ))}
        </g>

        {/* The milestone: a route shield on a pole, glowing as the truck arrives */}
        <circle className="tt-anniv-arrive" cx="466" cy="78" r="64" fill={url('sun')} />
        <rect x="464" y="120" width="4" height="68" fill="#cbd5e1" />
        <g className="tt-anniv-shield">
          <g transform="translate(421 28) scale(0.9)" style={{ filter: 'drop-shadow(0 8px 14px rgba(0,0,0,0.45))' }}>
            <g clipPath={url('shield')}>
              <rect width="100" height="110" fill={TTL_NAVY} />
              <rect width="100" height="32" fill={TTL_RED} />
            </g>
            <path d={SHIELD_PATH} fill="none" stroke="#ffffff" strokeWidth="3.5" />
            <path d="M6 12 Q25 7 50 12 Q75 7 94 12 Q98 60 50 99 Q2 60 6 12 Z" fill="none" stroke="#ffffff" strokeOpacity="0.35" strokeWidth="1" />
            <text x="50" y="25" textAnchor="middle" fontSize="11" fontWeight="800" letterSpacing="2.2" fill="#ffffff"
              fontFamily="Inter, ui-sans-serif, system-ui, sans-serif">{card.years === 1 ? 'YEAR' : 'YEARS'}</text>
            <text x="50" y={big ? 78 : 82} textAnchor="middle" fontSize={big ? 40 : 50} fontWeight="800" fill="#ffffff"
              fontFamily="Inter, ui-sans-serif, system-ui, sans-serif">{card.years}</text>
          </g>
        </g>

        {/* The road, side on, with its lane line running under the truck */}
        <rect y="186" width="560" height="64" fill={url('road')} />
        <rect y="186" width="560" height="2" fill="#e2e8f0" opacity="0.45" />
        <line className="tt-anniv-lane" x1="0" y1="205" x2="560" y2="205" stroke="#f5c451" strokeWidth="3" strokeDasharray="26 22" />

        {/* The truck: navy cab, white trailer with the brand-red stripe, lights on */}
        <g className="tt-anniv-truck">
          <g transform="translate(150 170)">
            {/* Headlight beam on the road ahead */}
            <path d="M148 44 L232 34 L232 62 Z" fill={url('beam')} />
            {/* Trailer */}
            <rect x="0" y="4" width="100" height="44" rx="3" fill={url('trailer')} />
            <rect x="0" y="34" width="100" height="5" fill={TTL_RED} />
            <rect x="0" y="40" width="100" height="1.6" fill={TTL_NAVY} />
            <rect x="0" y="40" width="3" height="6" rx="1" fill="#ef4444" />
            {/* Chassis and cab */}
            <rect x="4" y="48" width="142" height="5" rx="1.5" fill="#1e293b" />
            <rect x="106" y="8" width="3" height="14" rx="1" fill="#94a3b8" />
            <path d="M104 20 H128 Q134 20 137 26 L146 40 Q148 43 148 47 V53 H104 Z" fill={TTL_NAVY} />
            <path d="M114 24 H128 Q131 24 133 27 L139 37 H114 Z" fill={url('glass')} />
            <rect x="118" y="40" width="10" height="1.4" rx="0.7" fill="#ffffff" opacity="0.35" />
            <rect x="144" y="43" width="4" height="3" rx="1" fill="#fef3c7" />
            {/* Wheels: trailer tandem, drive, steer */}
            {[18, 36, 92, 134].map((cx) => (
              <g key={cx}>
                <circle cx={cx} cy="55" r="8.5" fill="#0f172a" />
                <circle cx={cx} cy="55" r="4" fill="#9ca3af" />
                <circle cx={cx} cy="55" r="1.4" fill="#334155" />
              </g>
            ))}
          </g>
        </g>

        {/* The scene melts into the card below instead of stopping on a line */}
        <rect y="215" width="560" height="35" fill={url('fade')} />
      </svg>

      <div className="flex flex-col items-center gap-2.5 px-4 pb-7 pt-5 text-center min-[400px]:px-6 sm:px-10">
        <span data-es className="text-[11.5px] font-semibold uppercase tracking-[0.18em] text-[#cbd5e1]">Work anniversary</span>
        <span className="select-text text-balance text-[34px] font-extrabold leading-[1.05] sm:text-[40px]">{name}</span>
        <span className="text-balance text-[17px] font-semibold text-[#f5c451]">{yearsPhrase(card.years)} down the road with us</span>
        {/* HR's wording, exactly as the template rendered it. */}
        <p className="m-0 max-w-[420px] select-text text-[15px] leading-relaxed text-[#e2e8f0]">{card.line}</p>
        {onCongratulate && (
          <GreetButton
            label={`Congratulate ${first}`}
            onClick={() => onCongratulate(`Congratulations on ${yearsPhrase(card.years)}, ${first}! `)}
            className="bg-[#f5c451] text-[#0b1b3a] hover:bg-[#f7d06e]"
          />
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------- birthday: cake and candles */

/**
 * Sprinkles scattered over the card. A fixed spread rather than random so the
 * card looks the same on every render and every screen.
 */
const SPRINKLES = Array.from({ length: 22 }, (_, i) => ({
  left:  (i * 47 + 9) % 96 + 2,
  top:   (i * 29 + 13) % 92 + 3,
  rot:   (i * 53) % 180,
  color: ['#fb7185', '#60a5fa', '#fbbf24', '#34d399', '#c084fc'][i % 5],
  delay: i * 0.3,
}));

function CakeCard({ card, onCongratulate }: { card: CelebrationCard; onCongratulate?: (text: string) => void }) {
  const firsts = firstNames(card.names);
  const several = card.names.length > 1;

  return (
    <div className="relative w-full max-w-[480px] overflow-hidden rounded-3xl border border-[#fed7aa] bg-[#fff1e6] shadow-[0_20px_40px_-20px_rgba(154,52,18,0.35)]">
      {/* Sprinkles */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {SPRINKLES.map((s, i) => (
          <span
            key={i}
            className="tt-cake-sprinkle absolute h-1 w-2.5 rounded-sm"
            style={{
              left: `${s.left}%`, top: `${s.top}%`, background: s.color,
              transform: `rotate(${s.rot}deg)`, animationDelay: `-${s.delay}s`,
            }}
          />
        ))}
      </div>

      <div className="relative flex flex-col items-center gap-3 px-4 pb-7 pt-6 text-center min-[400px]:px-6 sm:px-10">
        {/* The full TTL logo, high-res, with the white cut away so the cream
            shows through everywhere except the white truck in the red circle
            (logo-full-hd-clear.png). 240×101 keeps its 3510×1480 shape. */}
        <Image src="/logo-full-hd-clear.png" alt="Total Transport Logistics" width={240} height={101} className="h-auto w-[220px] max-w-full" />

        {/* Cake with three candles */}
        <svg width="180" height="153" viewBox="0 0 200 170" aria-hidden>
          <g className="tt-cake-flame"><path d="M60 22c-6 8-6 14 0 18 6-4 6-10 0-18z" fill="#f59e0b" /><path d="M60 28c-3 5-3 8 0 10 3-2 3-5 0-10z" fill="#fde68a" /></g>
          <g className="tt-cake-flame" style={{ animationDelay: '.3s' }}><path d="M100 12c-6 8-6 14 0 18 6-4 6-10 0-18z" fill="#f59e0b" /><path d="M100 18c-3 5-3 8 0 10 3-2 3-5 0-10z" fill="#fde68a" /></g>
          <g className="tt-cake-flame" style={{ animationDelay: '.6s' }}><path d="M140 22c-6 8-6 14 0 18 6-4 6-10 0-18z" fill="#f59e0b" /><path d="M140 28c-3 5-3 8 0 10 3-2 3-5 0-10z" fill="#fde68a" /></g>
          <rect x="56" y="40" width="8" height="34" rx="3" fill="#60a5fa" />
          <rect x="96" y="30" width="8" height="44" rx="3" fill="#f472b6" />
          <rect x="136" y="40" width="8" height="34" rx="3" fill="#34d399" />
          <rect x="34" y="74" width="132" height="40" rx="10" fill="#fb7185" />
          <path d="M34 86c11 0 11 10 22 10s11-10 22-10 11 10 22 10 11-10 22-10 11 10 22 10 11-10 22-10" stroke="#fff" strokeWidth="5" fill="none" strokeLinecap="round" />
          <rect x="20" y="112" width="160" height="46" rx="12" fill="#9d174d" />
          <path d="M20 126c13 0 13 10 27 10s13-10 27-10 13 10 26 10 13-10 27-10 13 10 26 10 14-10 27-10" stroke="#fde68a" strokeWidth="5" fill="none" strokeLinecap="round" />
          <rect x="8" y="156" width="184" height="8" rx="4" fill="#fdba74" />
        </svg>

        <span data-es className="text-[14px] font-bold uppercase tracking-[0.14em] text-[#be123c]">Make a wish</span>
        {/* Every name on its own line when there are several, so none is buried mid-sentence. */}
        <div className="flex flex-col gap-1">
          {card.names.map((n) => (
            <span key={n} className={`select-text text-balance font-extrabold leading-[1.05] text-[#4a0e24] ${several ? 'text-[30px] sm:text-[34px]' : 'text-[34px] sm:text-[42px]'}`}>
              {n}
            </span>
          ))}
        </div>
        {/* HR's wording, exactly as the template rendered it. */}
        <p className="m-0 max-w-[420px] select-text text-[15px] leading-relaxed text-[#57301c]">{card.line}</p>
        {onCongratulate && (
          <GreetButton
            label={several ? 'Wish them a happy birthday' : `Wish ${firsts} a happy birthday`}
            onClick={() => onCongratulate(`Happy birthday ${firsts}! `)}
            className="bg-[#be123c] text-white hover:bg-[#9f1239]"
          />
        )}
      </div>
    </div>
  );
}
