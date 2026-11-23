import type { Permission } from './permission';

/**
 * The settings change log — who changed a company setting, when, and from
 * what to what. Stored in `settingsChanges`, one document per save.
 *
 * Before this, a setting kept only the last person to touch it
 * (`updatedBy`), so "who switched lane distance to the billed Google option,
 * and what was it before?" had no answer. This is that answer.
 *
 * - **Server-written only.** Every route that saves a company setting writes
 *   an entry beside it (`logSettingsChange()` in src/lib/settingsChangeServer.ts).
 *   No Firestore rule matches the collection, so the browser can neither read
 *   nor write it; `GET /api/settings-changes` is the only way in.
 * - **Append-only.** There is no route that edits or deletes an entry. Do not
 *   add one — a log somebody can tidy is not a log.
 * - **Company settings, not people.** Adding, removing and restoring people is
 *   already recorded in `peopleEvents` (Settings → Access history), and a
 *   person's details carry payroll fields this log must never copy.
 * - **Each entry is readable by whoever may change that setting** — the same
 *   permissions as `AREA_PERMISSIONS` below. Finance sees lane distance's
 *   history and not the attendance schedules'.
 */

export const SETTINGS_AREAS = [
  'dateFormat',
  'presence',
  'reminderEmails',
  'sessionPolicy',
  'laneDistance',
  'paymentTerms',
  'celebrations',
  'quoteRates',
  'agreementTerms',
  'leadSources',
  'sites',
  'teams',
  'workGroups',
  'schedules',
  'holidays',
  'breakReminders',
  'backOnTime',
  'officeNetwork',
] as const;

export type SettingsArea = (typeof SETTINGS_AREAS)[number];

export function isSettingsArea(v: unknown): v is SettingsArea {
  return typeof v === 'string' && (SETTINGS_AREAS as readonly string[]).includes(v);
}

export const AREA_LABEL: Record<SettingsArea, string> = {
  dateFormat:     'Date format',
  presence:       'Online status',
  reminderEmails: 'Reminder emails',
  sessionPolicy:  'Sign-out timer',
  laneDistance:   'Lane distance',
  paymentTerms:   'Payment terms',
  celebrations:   'Celebrations',
  quoteRates:     'Quote rates',
  agreementTerms: 'Agreement terms',
  leadSources:    'Lead sources',
  sites:          'Sites',
  teams:          'Teams',
  workGroups:     'Work groups',
  schedules:      'Work schedules',
  holidays:       'Holidays',
  breakReminders: 'Lunch and break reminders',
  backOnTime:     'Back on time',
  officeNetwork:  'Office network and alerts',
};

/**
 * Who may read an area's history: any one of these. Kept equal to who may
 * change it — the routes that write each area name the same permissions — so
 * nobody reads the history of a setting they could not have touched, and
 * nobody who changes one is blind to who changed it before them.
 */
export const AREA_PERMISSIONS: Record<SettingsArea, readonly Permission[]> = {
  dateFormat:     ['settings.manage'],
  presence:       ['settings.manage', 'presence.manage'],
  reminderEmails: ['settings.manage'],
  sessionPolicy:  ['settings.manage'],
  laneDistance:   ['settings.manage', 'laneDistance.manage'],
  paymentTerms:   ['settings.manage', 'paymentTerms.manage'],
  celebrations:   ['celebrations.manage'],
  quoteRates:     ['settings.manage', 'quoteRates.manage'],
  agreementTerms: ['settings.manage', 'agreementTerms.manage'],
  leadSources:    ['settings.manage', 'leadSources.manage'],
  sites:          ['settings.manage'],
  teams:          ['settings.manage'],
  workGroups:     ['settings.manage'],
  schedules:      ['attendance.manage'],
  holidays:       ['attendance.manage'],
  breakReminders: ['attendance.manage'],
  backOnTime:     ['attendance.manage'],
  officeNetwork:  ['attendance.manage'],
};

/** One field that changed. Both sides are words, ready to print. */
export interface FieldChange {
  field: string;
  from: string;
  to: string;
}

export interface SettingsChange {
  id: string;
  area: SettingsArea;
  /** One sentence: "Changed lane distance", "Added the site Zona 10". */
  summary: string;
  changes: FieldChange[];
  /** True when more fields changed than were kept — see MAX_FIELD_CHANGES. */
  truncated: boolean;
  byName: string;
  byEmail: string;
  /** ISO time, or null for an entry whose server timestamp has not resolved. */
  at: string | null;
}

/**
 * At most this many fields per entry. A whole rate card replaced with the
 * starting rates changes a hundred numbers, and an entry that long is read by
 * nobody; the first ones and "and N more" say what happened.
 */
export const MAX_FIELD_CHANGES = 30;

/** Short values are kept whole; a paragraph is cut. Long text has its own path. */
const MAX_VALUE = 160;

/** The longest text kept whole — the agreement terms, which are legal wording. */
export const MAX_TEXT_VALUE = 20_000;

/** "perMile" → "per mile", "tl" stays "tl". For field paths nobody labelled. */
function words(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .toLowerCase();
}

/** How a value reads in the log. */
export function displayValue(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'On' : 'Off';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '—';
  if (typeof v === 'string') return v.length > MAX_VALUE ? `${v.slice(0, MAX_VALUE)}…` : v;
  if (Array.isArray(v)) {
    if (v.length === 0) return 'none';
    if (v.every((x) => typeof x === 'string')) return displayValue(v.join(', '));
    return `${v.length} item${v.length === 1 ? '' : 's'}`;
  }
  try {
    return displayValue(JSON.stringify(v));
  } catch {
    return '…';
  }
}

/**
 * A readable name for one element of a list of objects, so a path says
 * "Flatbed" rather than "3". Falls back to the position.
 */
function elementKey(item: unknown, index: number): string {
  if (item && typeof item === 'object') {
    const o = item as Record<string, unknown>;
    for (const k of ['name', 'label', 'ip', 'id', 'code']) {
      if (typeof o[k] === 'string' && o[k]) return o[k] as string;
    }
  }
  return `#${index + 1}`;
}

/** Lists of plain values are compared whole — "Mon, Tue" → "Mon, Wed" says it best. */
function isPlainList(v: unknown): boolean {
  return Array.isArray(v) && v.every((x) => x === null || typeof x !== 'object');
}

function flatten(
  value: unknown,
  prefix: string,
  out: Map<string, unknown>,
  depth: number,
  labels: Record<string, string>,
) {
  if (depth > 5 || value === null || typeof value !== 'object' || isPlainList(value)) {
    out.set(prefix, value);
    return;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) out.set(prefix, value);
    value.forEach((item, i) =>
      flatten(item, prefix ? `${prefix} › ${elementKey(item, i)}` : elementKey(item, i), out, depth + 1, labels));
    return;
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) out.set(prefix, null);
  for (const [k, v] of entries) {
    if (k === 'updatedAt' || k === 'updatedBy' || k === 'createdAt' || k === 'createdBy') continue;
    // Only the top level is labelled: that is where a stored key such as
    // "laneDistanceMode" is the thing a person has to recognise.
    const name = prefix ? `${prefix} › ${words(k)}` : (labels[k] ?? words(k));
    flatten(v, name, out, depth + 1, labels);
  }
}

/**
 * Every field that differs between two versions of a setting, in words.
 *
 * Works on any shape, so a route only has to hand over what it read and what
 * it wrote. `labels` names the top-level keys a person would not recognise
 * ("laneDistanceMode" → "Lane distance").
 */
export function describeChanges(
  before: unknown,
  after: unknown,
  labels: Record<string, string> = {},
): { changes: FieldChange[]; truncated: boolean } {
  const a = new Map<string, unknown>();
  const b = new Map<string, unknown>();
  flatten(before ?? {}, '', a, 0, labels);
  flatten(after ?? {}, '', b, 0, labels);

  const keys = [...new Set([...a.keys(), ...b.keys()])];
  const changes: FieldChange[] = [];
  for (const key of keys) {
    const from = displayValue(a.get(key));
    const to = displayValue(b.get(key));
    if (from === to) continue;
    changes.push({ field: key || 'Value', from, to });
  }
  return {
    changes: changes.slice(0, MAX_FIELD_CHANGES),
    truncated: changes.length > MAX_FIELD_CHANGES,
  };
}

/** Which areas this reader may see the history of. */
export function readableAreas(can: (p: Permission) => boolean): SettingsArea[] {
  return SETTINGS_AREAS.filter((area) => AREA_PERMISSIONS[area].some((p) => can(p)));
}
