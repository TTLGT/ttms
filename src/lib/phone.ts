/**
 * One canonical shape for the two phone numbers a person can have.
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
 * Both regions are deliberately kept to the shapes below and nothing else. If
 * a third country is ever added, add it to REGIONS and to the format switch —
 * do not start guessing the region from the digits, because a Guatemala number
 * typed into the US column is a mistake worth surfacing, not one to absorb.
 */

export type PhoneRegion = 'US' | 'GT';

const REGIONS: Record<PhoneRegion, {
  /** Country calling code, without the `+`. */
  code: string;
  /** How many digits the number has once the country code is off the front. */
  nationalLength: number;
  /** What to call it when telling an admin why theirs was not accepted. */
  label: string;
}> = {
  US: { code: '1',   nationalLength: 10, label: 'a 10-digit US number' },
  GT: { code: '502', nationalLength: 8,  label: 'an 8-digit Guatemala number' },
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
 * `+(469) 935-4100` for the US, `+(502) 4874-0227` for Guatemala.
 *
 * The two are not the same pattern and that is intentional: the US form puts
 * the *area* code in the brackets and drops the `1` entirely, the Guatemala
 * form puts the *country* code in them. This is the shape the office asked
 * for. Changing it here changes it everywhere, but it will not retroactively
 * restyle numbers already in Firestore — those take the next save or a
 * re-import of the exported list.
 */
function format(national: string, region: PhoneRegion): string {
  if (region === 'US') {
    return `+(${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6)}`;
  }
  return `+(${REGIONS.GT.code}) ${national.slice(0, 4)}-${national.slice(4)}`;
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
 * A trailing extension (`935-4100 x12`) is *not* stripped: it would push the
 * count over and be rejected, which is the right outcome. Extensions have
 * their own field, and quietly discarding the `12` would store a number that
 * does not reach the person.
 */
export function normalizePhone(value: unknown, region: PhoneRegion): PhoneResult {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return { value: '', rejected: false, raw: '' };

  const { code, nationalLength } = REGIONS[region];

  let digits = raw.replace(/\D/g, '');
  // `00` is how the rest of the world writes `+`, and it turns up on numbers
  // copied out of a phone's call log.
  if (digits.startsWith('00')) digits = digits.slice(2);
  // Drop the country code only when what is left is the right length — so a
  // US number that happens to start with 1 is not shortened into nonsense.
  if (digits.length === code.length + nationalLength && digits.startsWith(code)) {
    digits = digits.slice(code.length);
  }

  if (digits.length !== nationalLength) return { value: '', rejected: true, raw };
  return { value: format(digits, region), rejected: false, raw };
}

/** The label the forms, the importer and the handbook all use for each field. */
export const PHONE_LABEL: Record<PhoneRegion, string> = {
  US: 'Work phone (US)',
  GT: 'Guatemala phone',
};

/** An example of the accepted shape, for placeholders and error messages. */
export const PHONE_EXAMPLE: Record<PhoneRegion, string> = {
  US: '+(469) 935-4100',
  GT: '+(502) 4874-0227',
};

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
