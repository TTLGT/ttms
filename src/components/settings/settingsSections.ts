/**
 * The one description of what Settings contains.
 *
 * Three things need to agree about that: the tab bar, the Overview cards and
 * the search box. Keeping them in one list means adding a new settings panel
 * is a single edit — miss one of the three and a panel becomes unreachable
 * from search, or shows up on a tab it isn't on.
 */

export type SettingsTabId = 'overview' | 'people' | 'organization' | 'operations' | 'data';

export interface SettingsTab {
  id: SettingsTabId;
  label: string;
  href: string;
  /** HR reads the people directory and nothing else — see CLAUDE.md. */
  adminOnly: boolean;
}

export const SETTINGS_TABS: SettingsTab[] = [
  { id: 'overview',     label: 'Overview',     href: '/dashboard/settings',              adminOnly: true  },
  { id: 'people',       label: 'People',       href: '/dashboard/settings/people',       adminOnly: false },
  { id: 'organization', label: 'Organization', href: '/dashboard/settings/organization', adminOnly: true  },
  { id: 'operations',   label: 'Operations',   href: '/dashboard/settings/operations',   adminOnly: true  },
  { id: 'data',         label: 'Data',         href: '/dashboard/settings/data',         adminOnly: true  },
];

export interface SettingsSection {
  /** Doubles as the element id on the page and as the URL hash. */
  id: string;
  label: string;
  tab: Exclude<SettingsTabId, 'overview'>;
  /** One line for the Overview card and the search result. */
  blurb: string;
  /**
   * Extra words people might search for that are not in the label. "office"
   * for Sites, "miles" for Lane Distance — nobody types the panel's own name
   * when they are looking for the thing it does.
   */
  keywords: string;
  adminOnly: boolean;
}

export const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    id: 'people-list',
    label: 'People With Access',
    tab: 'people',
    blurb: 'Everyone who can sign in, and what each of them is allowed to do.',
    keywords: 'users staff directory roles permissions admin dispatcher finance hr broker suspend phone extension birthday',
    adminOnly: false,
  },
  {
    id: 'add-people',
    label: 'Add People',
    tab: 'people',
    blurb: 'Grant access to someone new.',
    keywords: 'invite new hire onboard email allowlist grant access',
    adminOnly: true,
  },
  {
    id: 'removed-people',
    label: 'Removed People',
    tab: 'people',
    blurb: 'Everyone whose access has been revoked, and who revoked it.',
    keywords: 'revoked deleted former left offboard archive history log',
    adminOnly: true,
  },
  {
    id: 'sites',
    label: 'Sites',
    tab: 'organization',
    blurb: 'The offices people work from.',
    keywords: 'office location address branch building',
    adminOnly: true,
  },
  {
    id: 'teams',
    label: 'Teams',
    tab: 'organization',
    blurb: 'Who reports to whom. Reference only — a team grants no access.',
    keywords: 'team lead manager reports to supervisor org chart',
    adminOnly: true,
  },
  {
    id: 'work-groups',
    label: 'Work Groups',
    tab: 'organization',
    blurb: 'Who can see whose clients and orders. This one does grant access.',
    keywords: 'sharing visibility permissions members access boundary shared records',
    adminOnly: true,
  },
  {
    id: 'lane-distance',
    label: 'Lane Distance',
    tab: 'operations',
    blurb: 'How order mileage is worked out — free estimate or paid Google lookup.',
    keywords: 'miles mileage distance google routes estimate zip billing cost api',
    adminOnly: true,
  },
  {
    id: 'date-format',
    label: 'Date Format',
    tab: 'operations',
    blurb: 'How dates are written on screen — 4-Mar-2020, 03/04/2020 or 04/03/2020.',
    keywords: 'date dates format day month year mm dd yyyy american european order birthday',
    adminOnly: true,
  },
  {
    id: 'lead-sources',
    label: 'Lead Sources',
    tab: 'operations',
    blurb: 'Where new clients came from, as offered on the client form.',
    keywords: 'lead source referral marketing origin how they found us',
    adminOnly: true,
  },
  {
    id: 'bats-import',
    label: 'BATS Data Import',
    tab: 'data',
    blurb: 'Bring carriers, customers and orders across from BATS.',
    keywords: 'bats import csv upload migrate legacy carriers customers spreadsheet',
    adminOnly: true,
  },
];

export function sectionHref(section: SettingsSection): string {
  return `/dashboard/settings/${section.tab}#${section.id}`;
}

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

/**
 * Announced just before a jump, so a collapsed section holding the target can
 * open itself. Listened for by CollapsibleSection.
 *
 * An event rather than a call, because the two things that jump — the layout
 * and the search box — have no handle on the sections, and a jump within the
 * tab you are already on is a pushState, which fires no hashchange for them to
 * hear instead.
 */
export const REVEAL_ANCHOR_EVENT = 'ttms:reveal-anchor';

/**
 * Scroll to an id, waiting for it to exist.
 *
 * Every panel fetches its own rows, so the element a hash points at is
 * usually not in the DOM on the frame the navigation lands — the browser's
 * own hash scrolling gives up before then and does nothing. Retries for about
 * two seconds, which covers a slow list without hanging around if the id is
 * simply not on the page. A section opening in response to the event above
 * lands well inside that window.
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
