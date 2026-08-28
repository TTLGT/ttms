/**
 * One canonical shape for the phone numbers a person can have.
 *
 * Numbers used to be stored exactly as they were typed, which meant the same
 * line could sit in the directory three ways — `4699354100`, `(469) 935-4100`,
 * `+1 469-935-4100` — depending on who entered it and whether it came in
 * through the form or a spreadsheet. Normalising on the way in fixes that at
 * every entry point at once, and is why this lives in `lib/` rather than in
 * either caller: the CSV importer, the add form and the row editor must agree,
 * or an import would "update" a number that was already right.
 *
 * The rule for what is accepted is **digit count and nothing else**. A number
 * that is the right length is reformatted; anything else is left blank and
 * reported back rather than stored half-read. There is no attempt to validate
 * area codes or check that a line exists — a real number that this refused
 * would be worse than a wrong one it let through, because the admin can see a
 * wrong number and fix it, and cannot see a number that was silently dropped.
 *
 * The region is always told to this file, never guessed from the digits. That
 * was already deliberate — a Guatemala number typed into the US column is a
 * mistake worth surfacing, not one to absorb — and Mexico makes it structural:
 * Mexican and US numbers are **both ten digits**, so no amount of inspecting
 * the digits could tell those two apart. The field a number was typed into is
 * the only thing that says which country it is.
 *
 * If a fourth country is ever added, add it to REGIONS, to the format switch,
 * and — if it is a second number rather than a work line — to
 * OTHER_PHONE_REGIONS. Nothing else needs to know.
 */

export type PhoneRegion = 'US' | 'GT' | 'MX';

/**
 * The countries the *second* number can be in.
 *
 * A person has a US work line, stored on its own, and at most one other
 * number — their home-country line. That second number is one field with the
 * country recorded beside it (`phoneOther` + `phoneOtherRegion`) rather than
 * one field per country: a field per country would grow with every hire from
 * somewhere new, and would leave everyone else with a row of empty boxes.
 */
export type OtherPhoneRegion = 'GT' | 'MX';

/** The order the picker offers them in. */
export const OTHER_PHONE_REGIONS: OtherPhoneRegion[] = ['GT', 'MX'];

/**
 * What the picker starts on for someone who has no second number yet.
 * Guatemala only because it is the one the company has most of; it carries no
 * other meaning, and a blank number is stored blank whatever this says.
 */
export const DEFAULT_OTHER_REGION: OtherPhoneRegion = 'GT';

const REGIONS: Record<PhoneRegion, {
  /** Country calling code, without the `+`. */
  code: string;
  /** How many digits the number has once the country code is off the front. */
  nationalLength: number;
  /** What to call it when telling an admin why theirs was not accepted. */
  label: string;
  /**
   * Prefixes that used to sit between the country code and the number and no
   * longer do. See the note above `normalizePhone` for why they still arrive.
   */
  legacyPrefixes?: string[];
}> = {
  US: { code: '1',   nationalLength: 10, label: 'a 10-digit US number' },
  GT: { code: '502', nationalLength: 8,  label: 'an 8-digit Guatemala number' },
  MX: {
    code: '52', nationalLength: 10, label: 'a 10-digit Mexico number',
    // Until 2019 a Mexican mobile was dialled as +52 **1** and the number from
    // abroad, or 044/045 and the number from inside Mexico. Those prefixes were
    // abolished, but they are still sitting in every contact card and call log
    // saved before then — which is exactly where a number gets copied from. The
    // digits after them are the number we want, so they are dropped rather than
    // counted.
    legacyPrefixes: ['1', '044', '045'],
  },
};

export interface PhoneResult {
  /** The canonical form, or '' when the input could not be read as a number. */
  value: string;
  /**
   * True only when there was something in the field that did not come out as a
   * number. An empty field is not a rejection — most people have one of the two
   * numbers, not both, and a blank must never read as an error.
   */
  rejected: boolean;
  /** What was typed, trimmed, so a caller can quote it back in the message. */
  raw: string;
}

/**
 * `+(469) 935-4100` for the US, `+(502) 4874-0227` for Guatemala,
 * `+(52) 55 1234-5678` for Mexico.
 *
 * The US form is not the same pattern as the other two, and that is
 * intentional: it puts the *area* code in the brackets and drops the `1`
 * entirely, where the international forms put the *country* code in them.
 * This is the shape the office asked for.
 *
 * Mexican grouping is presentation only, but it is not uniform: four area
 * codes are two digits and every other one is three, so a flat 3-3-4 split
 * would print a Mexico City number as `551 234-5678` — visibly wrong to the
 * person whose number it is. The four are listed below and nothing else needs
 * to know about them; the digits stored are the same either way.
 *
 * Changing any of this changes it everywhere, but it will not retroactively
 * restyle numbers already in Firestore — those take the next save or a
 * re-import of the exported list.
 */

/**
 * The Mexican area codes that are two digits rather than three: Mexico City
 * (55 and 56), Guadalajara (33) and Monterrey (81). This is the whole list —
 * it is fixed by the national numbering plan, not a sample.
 */
const MX_TWO_DIGIT_AREAS = ['55', '56', '33', '81'];

function format(national: string, region: PhoneRegion): string {
  switch (region) {
    case 'US':
      return `+(${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6)}`;
    case 'MX': {
      // `55 1234 5678` behind a two-digit area code, `998 123 4567` behind a
      // three-digit one — the eight or seven digits left over are split the
      // way they are written locally, not into fixed-width groups.
      const area = MX_TWO_DIGIT_AREAS.includes(national.slice(0, 2)) ? 2 : 3;
      const mid  = area === 2 ? 4 : 3;
      return `+(52) ${national.slice(0, area)} ${national.slice(area, area + mid)}`
        + `-${national.slice(area + mid)}`;
    }
    case 'GT':
      return `+(502) ${national.slice(0, 4)}-${national.slice(4)}`;
  }
}

/**
 * Read whatever was typed into the canonical form for `region`.
 *
 * Accepts the number with or without its country code, and with any
 * punctuation or spacing around it — brackets, dashes, dots, a leading `+`, or
 * the `00` international prefix. Everything that is not a digit is thrown away
 * before the count is taken, so `(469) 935-4100` and `469.935.4100` are the
 * same input.
 *
 * A region's obsolete dialling prefixes are dropped too, on their own or behind
 * the country code, so Mexico's `+52 1 442 755 9621` and `044 442 755 9621`
 * both come out as the same ten digits as `442 755 9621`. Only a prefix that
 * leaves exactly the right number of digits behind is taken off, so this cannot
 * eat the front of a real number: `1 442 755 9621` is eleven digits and loses
 * its `1`, while a genuine ten-digit number starting `1` is already the right
 * length and is left alone.
 *
 * A trailing extension (`935-4100 x12`) is *not* stripped: it would push the
 * count over and be rejected, which is the right outcome. Extensions have
 * their own field, and quietly discarding the `12` would store a number that
 * does not reach the person.
 */
export function normalizePhone(value: unknown, region: PhoneRegion): PhoneResult {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return { value: '', rejected: false, raw: '' };

  const { code, nationalLength, legacyPrefixes = [] } = REGIONS[region];

  let digits = raw.replace(/\D/g, '');
  // `00` is how the rest of the world writes `+`, and it turns up on numbers
  // copied out of a phone's call log.
  if (digits.startsWith('00')) digits = digits.slice(2);

  // Everything that can sit in front of the number: the country code, an
  // obsolete prefix, or both together. Longest first, so `521` is tried before
  // the `1` that is also the front of it.
  const prefixes = [
    ...legacyPrefixes.map((p) => code + p),
    code,
    ...legacyPrefixes,
  ].sort((a, b) => b.length - a.length);

  // Strip one only when what is left is exactly the right length — so a US
  // number that happens to start with 1 is not shortened into nonsense.
  for (const prefix of prefixes) {
    if (digits.length === prefix.length + nationalLength && digits.startsWith(prefix)) {
      digits = digits.slice(prefix.length);
      break;
    }
  }

  if (digits.length !== nationalLength) return { value: '', rejected: true, raw };
  return { value: format(digits, region), rejected: false, raw };
}

/** The label the spreadsheet columns, the importer and the handbook all use. */
export const PHONE_LABEL: Record<PhoneRegion, string> = {
  US: 'Work phone (US)',
  GT: 'Guatemala phone',
  MX: 'Mexico phone',
};

/**
 * What the second number's box is called on the forms, where the country sits
 * in a picker beside it rather than in the label. The per-country labels above
 * are still what the spreadsheet columns and the importer's messages use — a
 * file has one column per country, so there the country *is* the heading.
 */
export const OTHER_PHONE_LABEL = 'Other phone';

/** The country names the picker shows. */
export const PHONE_REGION_NAME: Record<PhoneRegion, string> = {
  US: 'United States',
  GT: 'Guatemala',
  MX: 'Mexico',
};

/** An example of the accepted shape, for placeholders and error messages. */
export const PHONE_EXAMPLE: Record<PhoneRegion, string> = {
  US: '+(469) 935-4100',
  GT: '+(502) 4874-0227',
  MX: '+(52) 55 1234-5678',
};

/** The country code a region's stored numbers carry, without the `+`. */
export const PHONE_COUNTRY_CODE: Record<PhoneRegion, string> = {
  US: '1',
  GT: '502',
  MX: '52',
};

/** How many digits a region's number has once its country code is off. */
export const PHONE_NATIONAL_LENGTH: Record<PhoneRegion, number> = {
  US: 10,
  GT: 8,
  MX: 10,
};

/** Narrow an unknown — a Firestore field, a request body — to a real region. */
export function isOtherPhoneRegion(value: unknown): value is OtherPhoneRegion {
  return value === 'GT' || value === 'MX';
}

/**
 * The second number and the country it belongs to, read off any record that
 * carries one — an allowlist entry, a profile, a removed-user archive.
 *
 * Everything that reads that number goes through here because of `phoneGt`,
 * the field it used to live in when Guatemala was the only option. Entries
 * saved since hold `phoneOther` + `phoneOtherRegion`; entries nobody has
 * touched still hold the old field, and reading both is why the change needed
 * no database migration in order to be correct.
 * `scripts/migrate-phone-other.js` moves the stragglers across when someone is
 * ready to run it — this reads either shape before that and after it.
 *
 * Every write clears `phoneGt` in the same operation, so a record never holds
 * two answers and a number that was deliberately emptied cannot be brought
 * back by the old field.
 */
export function otherPhone(record: {
  phoneOther?: string | null;
  phoneOtherRegion?: string | null;
  phoneGt?: string | null;
}): { value: string; region: OtherPhoneRegion } {
  const current = (record.phoneOther ?? '').trim();
  const legacy  = (record.phoneGt ?? '').trim();
  return {
    value: current || legacy,
    // A legacy number has no region field and needs none: Guatemala was the
    // only country that field could hold.
    region: isOtherPhoneRegion(record.phoneOtherRegion) ? record.phoneOtherRegion : 'GT',
  };
}

/**
 * The one-line warning to show under a field while it holds something that
 * will not be saved, or '' when there is nothing to say. Shared so the add
 * form and the row editor cannot drift into wording it two different ways.
 */
export function phoneHint(value: unknown, region: PhoneRegion): string {
  const { rejected } = normalizePhone(value, region);
  if (!rejected) return '';
  return `That is not ${REGIONS[region].label} — it will be left blank. Example: ${PHONE_EXAMPLE[region]}`;
}

/**
 * How the importer explains a number it could not read. `kept` is true when the
 * person already has a number on file: a bad cell never overwrites one, so
 * "left blank" would be a lie on an update.
 */
export function phoneSkipMessage(raw: string, region: PhoneRegion, kept: boolean): string {
  const tail = kept
    ? 'so their existing number was kept'
    : 'so it was left blank';
  return `${PHONE_LABEL[region]} “${raw}” is not ${REGIONS[region].label}, ${tail}.`;
}
