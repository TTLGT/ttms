/*
 * The Planner's quick-add box: one line of plain words turned into a task.
 *
 *   "Call Rio Grande tomorrow 3pm !urgent #10511 @Ana"
 *   "Llamar a Patel Farms el viernes a las 10"
 *
 * Pure, and read in the browser only: it suggests, the person sees chips for
 * what it understood before pressing Enter, and the task is saved through the
 * same /api/me/tasks route as any other. Nothing it guesses is stored without
 * having been shown.
 *
 * Deliberately narrow. Numeric dates like 3/4 are not read at all — 3/4 is
 * March to one person in this office and April to the next (the same reason
 * `parseDateInput()` refuses them when the setting is the spelled month), so
 * dates are words, month names or ISO only. English and Spanish both, accents
 * optional, because people type both here.
 *
 * `#10511` and `@Ana` are only *references*: the caller resolves an order
 * through the access-checked /api/orders/lookup and a person through the
 * directory it already shows, and drops whatever does not resolve.
 */

export interface QuickAddResult {
  /** What is left once the recognised words are taken out. */
  title: string;
  date: string | null;
  time: string | null;
  endTime: string | null;
  urgent: boolean;
  /** Order numbers named with `#`, as typed. */
  orderRefs: string[];
  /** People named with `@`, as typed (without the @). */
  mentions: string[];
}

const DAY_MS = 86_400_000;

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * DAY_MS).toISOString().slice(0, 10);
}

function weekdayOf(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Lower case with the accents taken off, so "miércoles" and "miercoles" are one word. */
function fold(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

const WEEKDAYS: Record<string, number> = {
  sunday: 0, sun: 0, domingo: 0, dom: 0,
  monday: 1, mon: 1, lunes: 1, lun: 1,
  tuesday: 2, tue: 2, tues: 2, martes: 2, mar: 2,
  wednesday: 3, wed: 3, miercoles: 3, mie: 3,
  thursday: 4, thu: 4, thur: 4, thurs: 4, jueves: 4, jue: 4,
  friday: 5, fri: 5, viernes: 5, vie: 5,
  saturday: 6, sat: 6, sabado: 6, sab: 6,
};

const MONTHS: Record<string, number> = {
  january: 1, jan: 1, enero: 1, ene: 1,
  february: 2, feb: 2, febrero: 2,
  march: 3, marzo: 3,
  april: 4, apr: 4, abril: 4, abr: 4,
  may: 5, mayo: 5,
  june: 6, jun: 6, junio: 6,
  july: 7, jul: 7, julio: 7,
  august: 8, aug: 8, agosto: 8, ago: 8,
  september: 9, sep: 9, sept: 9, septiembre: 9, setiembre: 9,
  october: 10, oct: 10, octubre: 10,
  november: 11, nov: 11, noviembre: 11,
  december: 12, dec: 12, diciembre: 12, dic: 12,
};

const pad = (n: number) => String(n).padStart(2, '0');

/** The next date on or after `today` with this month and day; next year once it has passed. */
function nextMonthDay(today: string, month: number, day: number): string | null {
  if (day < 1 || day > 31) return null;
  const year = Number(today.slice(0, 4));
  for (const y of [year, year + 1]) {
    const iso = `${y}-${pad(month)}-${pad(day)}`;
    // Reject 31 Feb and friends: the round trip changes the date.
    if (new Date(`${iso}T00:00:00Z`).toISOString().slice(0, 10) !== iso) return null;
    if (iso >= today) return iso;
  }
  return null;
}

/**
 * An hour and minute as HH:mm. `meridiem` is am/pm when typed; without one a
 * bare hour after "at" / "a las" is read the way an office day runs — 1 to 7
 * is the afternoon, 8 to 12 the morning — since nobody books a 3am call.
 */
function toTime(h: number, m: number, meridiem: string | undefined, bare: boolean): string | null {
  if (m < 0 || m > 59) return null;
  const mer = meridiem ? fold(meridiem).replace(/\./g, '') : '';
  if (mer) {
    if (h < 1 || h > 12) return null;
    if (mer.startsWith('p')) h = h === 12 ? 12 : h + 12;
    else h = h === 12 ? 0 : h;
  } else if (bare) {
    if (h < 1 || h > 12) return null;
    if (h <= 7) h += 12;
  } else if (h > 23) {
    return null;
  }
  return `${pad(h)}:${pad(m)}`;
}

/** One rule: a pattern over the folded text, and what a match means. */
type Rule = { re: RegExp; take: (m: RegExpExecArray, out: QuickAddResult, today: string) => boolean };

// Word edges that also work next to accents' folded forms and punctuation.
const B = '(?:^|(?<=[\\s,(]))';
const E = '(?=$|[\\s,.;:!?)])';
const MER = '(a\\.?\\s?m\\.?|p\\.?\\s?m\\.?)';

const RULES: Rule[] = [
  // Times first, so "a las 3" is not half-eaten by anything else.
  // A range: "3-4pm", "9am to 11am", "de 9 a 11".
  {
    re: new RegExp(`${B}(?:from\\s+|de\\s+(?:las\\s+)?)?(\\d{1,2})(?::(\\d{2}))?\\s*${MER}?\\s*(?:-|–|to|a|hasta)\\s*(?:las\\s+)?(\\d{1,2})(?::(\\d{2}))?\\s*${MER}?${E}`),
    take: (m, out) => {
      if (out.time) return false;
      const endMer = m[6] ?? m[3];
      const startMer = m[3] ?? m[6];
      // Without any am/pm a "9-11" is a number range, not a time.
      if (!endMer && !/^(from|de)/.test(m[0].trim())) return false;
      const start = toTime(Number(m[1]), Number(m[2] ?? 0), startMer, !startMer);
      const end = toTime(Number(m[4]), Number(m[5] ?? 0), endMer, !endMer);
      if (!start || !end || end <= start) return false;
      out.time = start;
      out.endTime = end;
      return true;
    },
  },
  // "at 3", "at 3:30pm", "a las 10", "a la 1".
  {
    re: new RegExp(`${B}(?:at|@|a\\s+las?)\\s+(\\d{1,2})(?::(\\d{2}))?\\s*${MER}?${E}`),
    take: (m, out) => {
      if (out.time) return false;
      const t = toTime(Number(m[1]), Number(m[2] ?? 0), m[3], !m[3]);
      if (!t) return false;
      out.time = t;
      return true;
    },
  },
  // "3pm", "3:30 pm", "15:00".
  {
    re: new RegExp(`${B}(\\d{1,2})(?::(\\d{2}))?\\s*${MER}${E}`),
    take: (m, out) => {
      if (out.time) return false;
      const t = toTime(Number(m[1]), Number(m[2] ?? 0), m[3], false);
      if (!t) return false;
      out.time = t;
      return true;
    },
  },
  {
    re: new RegExp(`${B}(\\d{1,2}):(\\d{2})${E}`),
    take: (m, out) => {
      if (out.time) return false;
      const t = toTime(Number(m[1]), Number(m[2]), undefined, false);
      if (!t) return false;
      out.time = t;
      return true;
    },
  },
  // ISO: 2026-12-01.
  {
    re: new RegExp(`${B}(\\d{4})-(\\d{2})-(\\d{2})${E}`),
    take: (m, out) => {
      if (out.date) return false;
      const iso = `${m[1]}-${m[2]}-${m[3]}`;
      if (Number.isNaN(Date.parse(`${iso}T00:00:00Z`))) return false;
      out.date = iso;
      return true;
    },
  },
  // "day after tomorrow", "pasado manana".
  {
    re: new RegExp(`${B}(?:the\\s+)?(?:day\\s+after\\s+tomorrow|pasado\\s+manana)${E}`),
    take: (_m, out, today) => { if (out.date) return false; out.date = addDays(today, 2); return true; },
  },
  {
    re: new RegExp(`${B}(?:today|tonight|hoy|esta\\s+noche)${E}`),
    take: (_m, out, today) => { if (out.date) return false; out.date = today; return true; },
  },
  {
    re: new RegExp(`${B}(?:tomorrow|tmrw|tmr|manana)${E}`),
    take: (_m, out, today) => { if (out.date) return false; out.date = addDays(today, 1); return true; },
  },
  // "in 3 days", "en 3 dias", "in a week", "en una semana".
  {
    re: new RegExp(`${B}(?:in|en)\\s+(\\d{1,2}|a|an|one|un|una)\\s+(days?|dias?|weeks?|semanas?)${E}`),
    take: (m, out, today) => {
      if (out.date) return false;
      const n = /^\d+$/.test(m[1]) ? Number(m[1]) : 1;
      const days = /^(week|semana)/.test(m[2]) ? n * 7 : n;
      if (days < 1 || days > 366) return false;
      out.date = addDays(today, days);
      return true;
    },
  },
  // "next week" / "la proxima semana": the Monday after.
  {
    re: new RegExp(`${B}(?:next\\s+week|(?:la\\s+)?(?:proxima|siguiente)\\s+semana|la\\s+semana\\s+que\\s+viene)${E}`),
    take: (_m, out, today) => {
      if (out.date) return false;
      const wd = weekdayOf(today);
      out.date = addDays(today, ((8 - wd) % 7) || 7);
      return true;
    },
  },
  // "Nov 30", "30 nov", "30 de noviembre", "noviembre 30".
  {
    re: new RegExp(`${B}(?:on\\s+|el\\s+)?([a-z]{3,10})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?${E}`),
    take: (m, out, today) => {
      const month = MONTHS[m[1]];
      if (out.date || !month) return false;
      const iso = nextMonthDay(today, month, Number(m[2]));
      if (!iso) return false;
      out.date = iso;
      return true;
    },
  },
  {
    re: new RegExp(`${B}(?:on\\s+(?:the\\s+)?|el\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:de\\s+)?([a-z]{3,10})\\.?${E}`),
    take: (m, out, today) => {
      const month = MONTHS[m[2]];
      if (out.date || !month) return false;
      const iso = nextMonthDay(today, month, Number(m[1]));
      if (!iso) return false;
      out.date = iso;
      return true;
    },
  },
  // "friday", "on fri", "next tuesday", "el viernes", "el proximo lunes".
  // Always ahead: "monday" typed on a Monday is next week's, since today is "today".
  {
    re: new RegExp(`${B}(?:on\\s+|next\\s+|this\\s+|el\\s+(?:proximo\\s+|siguiente\\s+)?|este\\s+|proximo\\s+)?([a-z]{3,9})${E}`),
    take: (m, out, today) => {
      const wd = WEEKDAYS[m[1]];
      if (out.date || wd === undefined) return false;
      // "mar" and "sun" are words too; only take the bare abbreviation when it was introduced.
      const introduced = m[0].trim() !== m[1];
      if (m[1].length <= 3 && !introduced && !['mon', 'tue', 'wed', 'thu', 'fri', 'sat'].includes(m[1])) return false;
      const ahead = ((wd - weekdayOf(today) + 7) % 7) || 7;
      out.date = addDays(today, ahead);
      return true;
    },
  },
];

/**
 * One character per character: lower case, accents off. Anything that would
 * not fold to exactly one character is kept as it is, so positions in the
 * folded copy are positions in the original and a match can be cut straight
 * out of what the person typed — keeping their capitals and their accents.
 */
function foldSameLength(s: string): string {
  return Array.from(s).map((c) => {
    const f = fold(c);
    return f.length === 1 ? f : c;
  }).join('');
}

/**
 * Read one line. `today` is the browser's YYYY-MM-DD (the same `calendarToday()`
 * every task view uses). Each rule takes its first match that makes sense —
 * "Call Rio Grande friday" tries "call" as a weekday, refuses it, and goes on
 * to "friday" — and that stretch is cut out of the title.
 */
export function parseQuickAdd(input: string, today: string): QuickAddResult {
  const out: QuickAddResult = {
    title: '', date: null, time: null, endTime: null, urgent: false, orderRefs: [], mentions: [],
  };
  // NFC and one code unit per letter, so the folded copy lines up with it.
  let text = Array.from(input.normalize('NFC')).filter((c) => c.length === 1).join('');

  // Tokens with a sign: !urgent, #10511, @Ana. Taken out wherever they are.
  text = text.replace(/(^|\s)!(urgent|urgente|high|alta|important|importante)\b/gi, (_s, lead) => {
    out.urgent = true;
    return lead;
  });
  text = text.replace(/(^|\s)#([A-Za-z]{0,4}\d{3,12})\b/g, (_s, lead, ref: string) => {
    if (!out.orderRefs.includes(ref)) out.orderRefs.push(ref);
    return lead;
  });
  text = text.replace(/(^|\s)@([\p{L}][\p{L}.'-]{0,40})/gu, (_s, lead, name: string) => {
    if (!out.mentions.includes(name)) out.mentions.push(name);
    return lead;
  });

  for (const rule of RULES) {
    const folded = foldSameLength(text);
    const re = new RegExp(rule.re.source, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(folded)) !== null) {
      if (m[0].length === 0) { re.lastIndex++; continue; }
      if (rule.take(m, out, today)) {
        text = `${text.slice(0, m.index)} ${text.slice(m.index + m[0].length)}`;
        break;
      }
    }
  }

  out.title = text
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim()
    .replace(/^[,;:\-–]+\s*|\s*[,;:\-–]+$/g, '')
    .trim();
  // "Martes llamar a Sunbelt" leaves "llamar a Sunbelt"; a task starts with a capital.
  out.title = out.title.charAt(0).toUpperCase() + out.title.slice(1);
  return out;
}
