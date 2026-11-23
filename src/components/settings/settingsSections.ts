import {
  CalendarClock, CalendarDays, Database, FileSignature, Gauge, Grid3x3, History, Home, MapPin,
  PartyPopper, Receipt, Route, ScrollText, Shield, ShieldCheck, SlidersHorizontal, Tag, UserMinus,
  UserPlus, Users, Users2, UtensilsCrossed, Wifi,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  BASE_PERMISSIONS, ROLE_PERMISSIONS, type Permission, type RoleKey,
} from '@/types/permission';
import type { SettingsArea } from '@/types/settingsChange';

/**
 * The one description of what Settings contains.
 *
 * The side menu, the Home page, the search box, the "See it as" preview and
 * the redirects from old addresses all read this list. Adding a settings page
 * is one entry here plus its route folder — miss the entry and the page is
 * unreachable from the menu and from search, which is how the Sign-out Timer
 * spent a week findable only by scrolling.
 *
 * **Who may open a page lives here too**, as `access()`. The layout refuses a
 * page whose access is false, and every route behind it checks the permission
 * again — this decides what is drawn, never what is allowed.
 */

export type SettingsGroupId = 'home' | 'people' | 'company' | 'sales' | 'teamLife' | 'data';

export const SETTINGS_GROUPS: { id: SettingsGroupId; label: string }[] = [
  { id: 'home',     label: '' },
  { id: 'people',   label: 'People & access' },
  { id: 'company',  label: 'Company' },
  { id: 'sales',    label: 'Sales & orders' },
  { id: 'teamLife', label: 'Team life' },
  { id: 'data',     label: 'Data & history' },
];

/** What a reader holds, as the menu needs it. */
export interface SettingsAccess {
  can: (p: Permission) => boolean;
  isSalesManager: boolean;
}

/** `edit` draws the controls, `view` draws the page read-only, false hides it. */
export type PageAccess = 'edit' | 'view' | false;

export interface SettingsPage {
  /** The URL slug under /dashboard/settings, and the key everything else uses. */
  id: string;
  label: string;
  group: SettingsGroupId;
  Icon: LucideIcon;
  /** One line, under the title and on the search result. */
  blurb: string;
  /** Words people search for that are not in the label. */
  keywords: string;
  access: (a: SettingsAccess) => PageAccess;
  /** The change-log areas whose newest entry is the "Last changed" line. */
  areas?: SettingsArea[];
  /** An amber chip by the title: what makes a careless change here costly. */
  risk?: string;
  /**
   * Smaller things on this page that search should find by name — the three
   * settings on General, the three on Lunch and breaks. Each has an anchor.
   */
  parts?: { id: string; label: string; keywords: string; access?: (a: SettingsAccess) => boolean }[];
}

const any = (...ps: Permission[]) => (a: SettingsAccess) => ps.some((p) => a.can(p));
const editIf = (test: (a: SettingsAccess) => boolean) => (a: SettingsAccess): PageAccess => (test(a) ? 'edit' : false);
const admin = any('people.manage', 'settings.manage');

export const SETTINGS_PAGES: SettingsPage[] = [
  {
    id: 'home', label: 'Home', group: 'home', Icon: Home,
    blurb: 'What each setting you look after is set to, and anything that needs a look.',
    keywords: 'overview glance summary start dashboard',
    access: () => 'view',
  },

  // ── People & access ────────────────────────────────────────────────────
  {
    id: 'people', label: 'People', group: 'people', Icon: Users,
    blurb: 'Everyone who can sign in, their details, and what each of them is allowed to do.',
    keywords: 'users staff directory roles admin dispatcher finance hr broker suspend phone extension birthday team site',
    // HR reads; a Sales Manager writes for their own team; admins write.
    access: (a) => (a.can('people.manage') || a.isSalesManager ? 'edit'
      : a.can('people.view') || a.can('settings.manage') ? 'view' : false),
  },
  {
    id: 'invite', label: 'Invite people', group: 'people', Icon: UserPlus,
    blurb: 'Give someone new access, one at a time or from a spreadsheet.',
    keywords: 'add new hire onboard email allowlist grant access spreadsheet import',
    access: editIf(any('people.manage')),
    risk: 'Grants access',
  },
  {
    id: 'permissions', label: 'Who can do what', group: 'people', Icon: Grid3x3,
    blurb: 'Every permission against every person — or one person in plain words, or two side by side.',
    keywords: 'permissions grid matrix compare abilities allow grant revoke role why can',
    access: (a) => (a.can('people.manage') || a.isSalesManager ? 'edit' : a.can('settings.manage') ? 'view' : false),
    risk: 'Grants access',
  },
  {
    id: 'removed', label: 'Removed people', group: 'people', Icon: UserMinus,
    blurb: 'Everyone whose access was taken away, who did it, and putting them back.',
    keywords: 'revoked deleted former left offboard archive restore recover undo put back',
    access: editIf(any('people.manage')),
  },
  {
    id: 'access-history', label: 'Access history', group: 'people', Icon: History,
    blurb: 'Every addition, removal, restore and email change, in order.',
    keywords: 'audit trail timeline added removed restored who when log',
    access: editIf(any('people.manage')),
  },

  // ── Company ────────────────────────────────────────────────────────────
  {
    id: 'general', label: 'General', group: 'company', Icon: SlidersHorizontal,
    blurb: 'How dates are written, whether chat shows who is online, and whether reminders can be emailed.',
    keywords: 'date format online status presence last seen reminder emails',
    access: editIf(any('settings.manage', 'presence.manage')),
    areas: ['dateFormat', 'presence', 'reminderEmails'],
    parts: [
      { id: 'date-format', label: 'Date format', keywords: 'date dates day month year mm dd yyyy american european', access: any('settings.manage') },
      { id: 'presence', label: 'Online status', keywords: 'online offline last seen active presence away chat', access: any('settings.manage', 'presence.manage') },
      { id: 'reminder-emails', label: 'Reminder emails', keywords: 'email reminders calendar tasks notifications mail inbox', access: any('settings.manage') },
    ],
  },
  {
    id: 'security', label: 'Security', group: 'company', Icon: ShieldCheck,
    blurb: 'When TTMS signs a browser out by itself — after so long unused, and every so many days.',
    keywords: 'sign out timer idle logout session timeout lock laptop unattended security',
    access: editIf(any('settings.manage')),
    areas: ['sessionPolicy'],
    risk: 'Can sign people out',
  },
  {
    id: 'sites', label: 'Sites', group: 'company', Icon: MapPin,
    blurb: 'The offices people work from.',
    keywords: 'office location address branch building',
    access: editIf(admin),
    areas: ['sites'],
  },
  {
    id: 'teams', label: 'Teams', group: 'company', Icon: Users2,
    blurb: 'Who reports to whom. A Sales Manager also runs the people on the team they lead.',
    keywords: 'team lead manager reports to supervisor org chart drag',
    access: editIf(admin),
    areas: ['teams'],
  },
  {
    id: 'work-groups', label: 'Work groups', group: 'company', Icon: Shield,
    blurb: 'Who can see whose clients and loads. This one grants access.',
    keywords: 'sharing visibility members access boundary shared records book of business',
    access: editIf(admin),
    areas: ['workGroups'],
    risk: 'Grants access',
  },

  // ── Sales & orders ─────────────────────────────────────────────────────
  {
    id: 'quote-rates', label: 'Quote rates', group: 'sales', Icon: Gauge,
    blurb: 'What the quote calculator charges per mile for each truck, how big a load each takes, and the market check.',
    keywords: 'quote calculator rate per mile price pricing truck trailer flatbed van reefer step deck hot shot dat market broker fee uship',
    access: editIf(any('settings.manage', 'quoteRates.manage')),
    areas: ['quoteRates'],
  },
  {
    id: 'payment-terms', label: 'Payment terms', group: 'sales', Icon: Receipt,
    blurb: 'How clients pay us, how carriers are paid and when our fee is collected, with any fee each carries.',
    keywords: 'payment terms pay method cod cash check ach zelle wire credit card quick pay factoring fee surcharge',
    access: editIf(any('settings.manage', 'paymentTerms.manage')),
    areas: ['paymentTerms'],
  },
  {
    id: 'lane-distance', label: 'Lane distance', group: 'sales', Icon: Route,
    blurb: 'How order mileage is worked out — a free estimate, or Google, which is billed per lookup.',
    keywords: 'miles mileage distance google routes estimate zip billing cost api',
    access: editIf(any('settings.manage', 'laneDistance.manage')),
    areas: ['laneDistance'],
    risk: 'Can cost money',
  },
  {
    id: 'agreement-terms', label: 'Agreement terms', group: 'sales', Icon: FileSignature,
    blurb: 'The terms clients and carriers accept when they sign the SA or the Dispatch Sheet.',
    keywords: 'terms conditions agreement contract legal fine print sa load confirmation e-sign dispatch sheet rate confirmation approval',
    access: editIf(any('settings.manage', 'agreementTerms.manage')),
    areas: ['agreementTerms'],
    risk: 'Legal wording',
  },
  {
    id: 'lead-sources', label: 'Lead sources', group: 'sales', Icon: Tag,
    blurb: 'Where new clients come from, as offered on the client form.',
    keywords: 'lead source referral marketing origin how they found us',
    access: editIf(any('settings.manage', 'leadSources.manage')),
    areas: ['leadSources'],
  },

  // ── Team life ──────────────────────────────────────────────────────────
  {
    id: 'celebrations', label: 'Celebrations', group: 'teamLife', Icon: PartyPopper,
    blurb: 'The birthday and work-anniversary message in the Everyone room, and its wording.',
    keywords: 'birthday anniversary congratulations chat everyone room 8am announcement wording template greeting',
    access: editIf(any('celebrations.manage')),
    areas: ['celebrations'],
  },
  {
    id: 'schedules', label: 'Work schedules', group: 'teamLife', Icon: CalendarClock,
    blurb: 'When each person is expected to work, and the company default.',
    keywords: 'schedule shift hours start end grace late absent workday weekday',
    access: editIf(any('attendance.manage')),
    areas: ['schedules'],
  },
  {
    id: 'holidays', label: 'Holidays', group: 'teamLife', Icon: CalendarDays,
    blurb: 'Public holidays in Guatemala and the US, and any moved or added.',
    keywords: 'holiday day off public guatemala us observed moved calendar',
    access: editIf(any('attendance.manage')),
    areas: ['holidays'],
  },
  {
    id: 'lunch-breaks', label: 'Lunch and breaks', group: 'teamLife', Icon: UtensilsCrossed,
    blurb: 'Lunch times, the clock-in and break reminders, and Back on time.',
    keywords: 'lunch break reminders clock in active pause back on time',
    access: editIf(any('attendance.manage')),
    areas: ['breakReminders', 'backOnTime'],
    parts: [
      { id: 'lunch-times', label: 'Lunch times', keywords: 'lunch move change everyone several people' },
      { id: 'break-reminders', label: 'Break reminders', keywords: 'reminder break lunch clock in active pause exercises' },
      { id: 'back-on-time', label: 'Back on time', keywords: 'return break lunch end early clock back minutes before' },
    ],
  },
  {
    id: 'office-network', label: 'Office network', group: 'teamLife', Icon: Wifi,
    blurb: 'Which internet address is the office, and the “not in yet” alerts.',
    keywords: 'office network ip address alerts not in yet late absent wifi',
    access: editIf(any('attendance.manage')),
    areas: ['officeNetwork'],
  },

  // ── Data & history ─────────────────────────────────────────────────────
  {
    id: 'bats-import', label: 'BATS import', group: 'data', Icon: Database,
    blurb: 'Bring carriers, customers and orders across from BATS.',
    keywords: 'bats import csv upload migrate legacy carriers customers spreadsheet',
    access: editIf(admin),
  },
  {
    id: 'change-log', label: 'Change log', group: 'data', Icon: ScrollText,
    blurb: 'Every change to a company setting: who, when, and what it was before.',
    keywords: 'history audit who changed when before after log record',
    // Anybody who looks after a setting sees that setting's history; the
    // route narrows the entries to what each reader may see.
    access: (a) => (SETTINGS_PAGES.some((p) => p.areas && p.access(a)) ? 'view' : false),
  },
];

export const settingsPage = (id: string) => SETTINGS_PAGES.find((p) => p.id === id) ?? null;

export function pageHref(id: string, anchor?: string): string {
  const base = id === 'home' ? '/dashboard/settings' : `/dashboard/settings/${id}`;
  return anchor ? `${base}#${anchor}` : base;
}

/** The page a pathname is, or null for an address that is not a page. */
export function pageFromPath(pathname: string): SettingsPage | null {
  const rest = pathname.replace(/^\/dashboard\/settings\/?/, '');
  if (rest === '') return settingsPage('home');
  const slug = rest.split('/')[0];
  return settingsPage(slug);
}

/** The pages this reader can open, in menu order, Home excluded. */
export function visiblePages(a: SettingsAccess): SettingsPage[] {
  return SETTINGS_PAGES.filter((p) => p.id !== 'home' && p.access(a));
}

/** Whether this reader belongs in Settings at all. */
export function canOpenSettings(a: SettingsAccess): boolean {
  return visiblePages(a).length > 0;
}

/** Every page but Home — the denominator of "You see 4 of 22". */
export const TOTAL_PAGES = SETTINGS_PAGES.length - 1;

// ── "See it as" ───────────────────────────────────────────────────────────

export type PreviewRole = 'broker' | RoleKey;

export const PREVIEW_ROLES: { id: PreviewRole; label: string }[] = [
  { id: 'isAdmin', label: 'Admin' },
  { id: 'isHr', label: 'HR' },
  { id: 'isSalesManager', label: 'Sales Manager' },
  { id: 'isDispatcher', label: 'Dispatcher' },
  { id: 'isFinance', label: 'Finance' },
  { id: 'broker', label: 'Broker' },
];

/**
 * What somebody holding only this role would hold — for the "See it as"
 * preview. Built from the same role table the server uses, so the preview
 * cannot promise a page the role would not reach. Individually granted
 * permissions are, by definition, not part of a role and not shown.
 */
export function accessForRole(role: PreviewRole): SettingsAccess {
  const held = new Set<Permission>(role === 'broker' ? BASE_PERMISSIONS : ROLE_PERMISSIONS[role]);
  return { can: (p) => held.has(p), isSalesManager: role === 'isSalesManager' };
}

// ── Old addresses ─────────────────────────────────────────────────────────

/**
 * Where an anchor on the old tabbed Settings lives now. Bookmarks, links in
 * chat and the onboarding guides all pointed at `/settings/operations#…`,
 * and every one of them has to keep landing on the right page.
 */
export const LEGACY_ANCHORS: Record<string, { page: string; anchor?: string }> = {
  'people-list':          { page: 'people' },
  'add-people':           { page: 'invite' },
  'removed-people':       { page: 'removed' },
  'access-history':       { page: 'access-history' },
  'permission-grid':      { page: 'permissions' },
  'sites':                { page: 'sites' },
  'teams':                { page: 'teams' },
  'work-groups':          { page: 'work-groups' },
  'lane-distance':        { page: 'lane-distance' },
  'date-format':          { page: 'general', anchor: 'date-format' },
  'presence':             { page: 'general', anchor: 'presence' },
  'reminder-emails':      { page: 'general', anchor: 'reminder-emails' },
  'session-policy':       { page: 'security' },
  'celebrations':         { page: 'celebrations' },
  'payment-methods':      { page: 'payment-terms' },
  'quote-rates':          { page: 'quote-rates' },
  'agreement-terms':      { page: 'agreement-terms' },
  'lead-sources':         { page: 'lead-sources' },
  'attendance-schedules': { page: 'schedules' },
  'attendance-holidays':  { page: 'holidays' },
  'lunch-times':          { page: 'lunch-breaks', anchor: 'lunch-times' },
  'break-reminders':      { page: 'lunch-breaks', anchor: 'break-reminders' },
  'back-on-time':         { page: 'lunch-breaks', anchor: 'back-on-time' },
  'office-network':       { page: 'office-network' },
  'bats-import':          { page: 'bats-import' },
};

/** Where an old tab with no anchor lands. */
export const LEGACY_TABS: Record<string, string> = {
  organization: 'sites',
  operations:   'home',
  attendance:   'schedules',
  data:         'bats-import',
};

// ── Search ────────────────────────────────────────────────────────────────

export interface SearchEntry {
  key: string;
  title: string;
  detail: string;
  /** Group label, shown small beside the title. */
  where: string;
  href: string;
  haystack: string;
}

export function searchEntries(a: SettingsAccess): SearchEntry[] {
  const out: SearchEntry[] = [];
  for (const page of SETTINGS_PAGES) {
    if (!page.access(a)) continue;
    const where = SETTINGS_GROUPS.find((g) => g.id === page.group)?.label || 'Settings';
    out.push({
      key: page.id,
      title: page.label,
      detail: page.blurb,
      where,
      href: pageHref(page.id),
      haystack: `${page.label} ${page.blurb} ${page.keywords} ${where}`,
    });
    for (const part of page.parts ?? []) {
      if (part.access && !part.access(a)) continue;
      out.push({
        key: `${page.id}#${part.id}`,
        title: part.label,
        detail: `On ${page.label}`,
        where,
        href: pageHref(page.id, part.id),
        haystack: `${part.label} ${part.keywords} ${page.label}`,
      });
    }
  }
  return out;
}

/**
 * Things search can *do*, not just find — "Turn off reminder emails". Each
 * opens its page with the change already made in the draft and the Save bar
 * showing, so nothing is saved by the search itself: the person still sees
 * the setting, its preview and its warning, and presses Save.
 */
export interface SettingsAction {
  key: string;
  label: string;
  keywords: string;
  page: string;
  /** Read by the page through `useStagedAction()`. */
  stage: string;
  access: (a: SettingsAccess) => boolean;
}

export const SETTINGS_ACTIONS: SettingsAction[] = [
  { key: 'reminder-emails-off', label: 'Turn off reminder emails', keywords: 'reminder emails stop disable off', page: 'general', stage: 'reminderEmails:off', access: any('settings.manage') },
  { key: 'reminder-emails-on',  label: 'Turn on reminder emails',  keywords: 'reminder emails start enable on', page: 'general', stage: 'reminderEmails:on', access: any('settings.manage') },
  { key: 'presence-off', label: 'Turn off online status', keywords: 'online status presence last seen hide off', page: 'general', stage: 'presence:off', access: any('settings.manage', 'presence.manage') },
  { key: 'presence-on',  label: 'Turn on online status',  keywords: 'online status presence last seen show on', page: 'general', stage: 'presence:on', access: any('settings.manage', 'presence.manage') },
  { key: 'date-spelled', label: 'Write dates as 4-Mar-2020', keywords: 'date format spelled month', page: 'general', stage: 'dateFormat:d-mmm-yyyy', access: any('settings.manage') },
  { key: 'date-us',      label: 'Write dates as 03/04/2020 (month first)', keywords: 'date format us american month first', page: 'general', stage: 'dateFormat:mm/dd/yyyy', access: any('settings.manage') },
  { key: 'date-day',     label: 'Write dates as 04/03/2020 (day first)', keywords: 'date format day first latin european', page: 'general', stage: 'dateFormat:dd/mm/yyyy', access: any('settings.manage') },
  { key: 'lane-estimate', label: 'Use the free distance estimate', keywords: 'lane distance free estimate stop google billing', page: 'lane-distance', stage: 'laneDistance:estimate', access: any('settings.manage', 'laneDistance.manage') },
  { key: 'lane-off',      label: 'Switch lane distance off', keywords: 'lane distance miles off hide', page: 'lane-distance', stage: 'laneDistance:off', access: any('settings.manage', 'laneDistance.manage') },
  { key: 'celebrations-off', label: 'Stop the celebrations message', keywords: 'birthday anniversary post stop off pause', page: 'celebrations', stage: 'celebrations:off', access: any('celebrations.manage') },
  { key: 'celebrations-on',  label: 'Start the celebrations message', keywords: 'birthday anniversary post start on', page: 'celebrations', stage: 'celebrations:on', access: any('celebrations.manage') },
];

export function actionHref(action: SettingsAction): string {
  return `${pageHref(action.page)}?stage=${encodeURIComponent(action.stage)}`;
}

// ── Anchors ───────────────────────────────────────────────────────────────

/**
 * A person's row id, for linking straight to them from search.
 *
 * Emails are stripped to letters and digits rather than used as-is: an id
 * containing '@' or '.' is legal HTML but has to be escaped in a URL hash and
 * in any CSS selector, and one of those escapes always gets forgotten.
 */
export function personAnchorId(email: string): string {
  return `person-${email.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

/** A person's own page. The address is the key, as everywhere else in Settings. */
export function personHref(email: string): string {
  return `/dashboard/settings/people/${encodeURIComponent(email.toLowerCase())}`;
}

/**
 * Announced just before a jump, so a collapsed section holding the target can
 * open itself. Listened for by CollapsibleSection.
 */
export const REVEAL_ANCHOR_EVENT = 'ttms:reveal-anchor';

/**
 * Scroll to an id, waiting for it to exist.
 *
 * Every panel fetches its own rows, so the element a hash points at is
 * usually not in the DOM on the frame the navigation lands — the browser's
 * own hash scrolling gives up before then and does nothing. Retries for about
 * two seconds.
 */
export function scrollToAnchor(id: string): () => void {
  if (!id) return () => {};
  window.dispatchEvent(new CustomEvent(REVEAL_ANCHOR_EVENT, { detail: id }));
  let frames = 0;
  let raf = 0;
  const tick = () => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (frames++ < 120) raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}
