import { PRODUCTION_APP_URL } from './appUrl';
import { STATUS_LABEL, type OrderStatus } from '@/types/order';

/**
 * Reads a load alert's sentence back into the parts a card draws.
 *
 * **Why the text is parsed rather than the alert being stored with structure.**
 * Every alert that has ever been posted is a plain sentence (chatAlerts.ts and
 * the routes that call postOrderAlert), and the rooms are full of them. Storing
 * structure on new ones would leave every existing room in the old wall-of-text
 * shape, which is exactly what this redesign exists to fix. The sentence also
 * stays the stored form on purpose: it is the room's `lastMessage` preview,
 * what chat search indexes, and what the room list shows — all places with one
 * line of plain text to fill.
 *
 * So the server keeps writing sentences and this is the one place that knows
 * their shapes. **Rewording an alert on the server means updating its pattern
 * here**, or it falls back to the plain card — still readable, just without
 * its headline. Nothing breaks; it just looks like the old line again.
 *
 * Pure: no React, no Firestore, so the shapes can be checked in isolation.
 */

export type AlertTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'driver';

export type AlertIcon =
  | 'status' | 'carrier' | 'carrierOff' | 'send' | 'resend' | 'signed' | 'hold' | 'cancelled'
  | 'swap' | 'request' | 'returned' | 'done' | 'bol' | 'invoice' | 'pod' | 'removed'
  | 'missing' | 'waived' | 'opened' | 'driver' | 'location' | 'payment' | 'mail'
  | 'upload' | 'verified' | 'refused' | 'changeOrder' | 'approved' | 'declined'
  | 'withdrawn' | 'warning' | 'info';

export interface AlertLink {
  label: string;
  href: string;
  /** `internal` opens inside TTMS; `sign` is a signing link people copy and send. */
  kind: 'internal' | 'sign' | 'map' | 'external';
}

export interface AlertCardModel {
  tone: AlertTone;
  icon: AlertIcon;
  /** The headline: what happened, in a few words. */
  title: string;
  /** Who did it, when the sentence names a person. */
  by?: string;
  /** One short line under the headline, when there is more to say. */
  detail?: string;
  /** Small labelled chips: sections changed, recipients, a version. */
  tags?: string[];
  /** Somebody's own words — a reason, a note, special instructions. */
  quote?: { label: string; text: string };
  links: AlertLink[];
  /** For a status change: where the load now is on its way. */
  status?: OrderStatus;
  /** One line, no body: "BOL added". */
  compact?: boolean;
}

/* ------------------------------------------------------------------ links */

const URL_RE = /(https?:\/\/[^\s<>"']+|ttms\.totaltransportlogistics\.us\/[^\s<>"']+)/gi;

function trimUrl(raw: string): string {
  return raw.replace(/[.,;:!?)\]}'"]+$/, '');
}

/**
 * A link as it should be followed today.
 *
 * Order links open inside TTMS by path, whatever host they were written with:
 * alerts posted from a developer's machine carry `localhost:3000`, and early
 * ones the old `ttms-iota.vercel.app` host, and a path works on all of them.
 * A signing link written against localhost is pointed at the live site — the
 * token lives in the one Firestore project, so the live page answers it,
 * whereas a carrier sent "localhost" gets nothing.
 */
function toLink(raw: string): AlertLink {
  const trimmed = trimUrl(raw);
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try { url = new URL(withScheme); } catch {
    return { label: 'Open link', href: withScheme, kind: 'external' };
  }
  if (/(^|\.)google\.[a-z.]+$/i.test(url.hostname) || url.hostname === 'maps.app.goo.gl') {
    return { label: 'Open in Maps', href: url.toString(), kind: 'map' };
  }
  const local = /^(localhost|127\.0\.0\.1)$/i.test(url.hostname);
  if (url.pathname.startsWith('/dashboard/')) {
    return { label: 'Open the load', href: `${url.pathname}${url.search}${url.hash}`, kind: 'internal' };
  }
  if (url.pathname.startsWith('/sign/') || url.pathname.startsWith('/driver/')) {
    const href = local ? `${PRODUCTION_APP_URL}${url.pathname}` : url.toString();
    return { label: 'Open signing page', href, kind: 'sign' };
  }
  return { label: 'Open link', href: url.toString(), kind: 'external' };
}

function linksIn(text: string): AlertLink[] {
  const out: AlertLink[] = [];
  for (const raw of text.match(URL_RE) ?? []) {
    const link = toLink(raw);
    if (!out.some((l) => l.href === link.href)) out.push(link);
  }
  return out;
}

/** The text with its addresses taken out, for the fallback card. */
function withoutLinks(text: string): string {
  return text
    .replace(/\s*(Review it here|Verify it on the load or in Approvals|Approve or turn it down here|E-signature link|then send it):?\s*(https?:\/\/|ttms\.)\S+/gi, (m, lead: string) => (lead === 'then send it' ? '.' : ''))
    .replace(URL_RE, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/* ---------------------------------------------------------------- helpers */

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** "pickup and delivery, freight" → ["Pickup and delivery", "Freight"]. */
function sections(what: string): string[] {
  return what.split(/,\s*/).map((s) => cap(s.trim())).filter(Boolean);
}

/** "a@x.com, b@y.com" → each address. */
function emails(list: string | undefined): string[] {
  return (list ?? '').split(/,\s*/).map((s) => s.trim()).filter(Boolean);
}

const STATUS_BY_LABEL: Record<string, OrderStatus> = Object.fromEntries(
  Object.entries(STATUS_LABEL).map(([k, v]) => [v.toLowerCase(), k as OrderStatus]),
);

function statusTone(s: OrderStatus | undefined): AlertTone {
  if (s === 'cancelled') return 'danger';
  if (s === 'delivered' || s === 'completed' || s === 'carrier_signed' || s === 'shipper_signed') return 'success';
  return 'info';
}

/* --------------------------------------------------------------- patterns */

type Rule = (text: string, links: AlertLink[]) => AlertCardModel | null;

const RULES: Rule[] = [
  // ── Agreements on hold after a change ────────────────────────────────────
  (t, links) => {
    const m = t.match(/^(.+?) changed the (.+?) after the (Shipper Agreement|Dispatch Sheet) was sent( and signed)?\. (The old client’s link has been cancelled\.)?/);
    if (!m) return null;
    const [, by, what, doc, signed, cancelled] = m;
    const isSa = doc === 'Shipper Agreement';
    return {
      tone: cancelled ? 'danger' : 'warning',
      icon: cancelled ? 'cancelled' : 'hold',
      title: cancelled ? 'Client changed: old SA link cancelled'
        : isSa ? 'SA on hold for review' : 'Dispatch Sheet on hold for review',
      by,
      detail: cancelled
        ? 'The previous client can no longer sign it.'
        : `${isSa ? 'The client' : 'The carrier'} can’t sign until dispatch reviews the change and sends the update.${signed ? ' It had already been signed.' : ''}`,
      tags: sections(what),
      links: relabel(links, 'internal', 'Review the change'),
    };
  },
  (t, links) => {
    const m = t.match(/^(.+?) changed the carrier to (.+?)\. The Dispatch Sheet sent to (.+?) no longer works\./);
    if (!m) return null;
    return {
      tone: 'warning', icon: 'swap', title: 'Carrier changed', by: m[1],
      detail: `The Dispatch Sheet sent to ${m[3]} no longer works.`,
      tags: [`${m[3]} → ${m[2]}`],
      links: relabel(links, 'internal', 'Review the change'),
    };
  },

  // ── Requests to dispatch ─────────────────────────────────────────────────
  (t, links) => {
    const m = t.match(/^(.+?) asked dispatch to send the (.+?)\.(?: Note: ([\s\S]*?))? Review the order and the (client|carrier), then send it:/);
    if (!m) return null;
    return {
      tone: 'info', icon: 'request', title: `${shortDoc(m[2])} requested`, by: m[1],
      detail: `Dispatch reviews the order and the ${m[4]}, then sends it.`,
      quote: m[3] ? { label: 'Note', text: m[3].trim() } : undefined,
      links: relabel(links, 'internal', 'Review and send'),
    };
  },
  (t, links) => {
    const m = t.match(/^(.+?) sent the (.+?) request back to the broker: ([\s\S]+)$/);
    if (!m) return null;
    return {
      tone: 'warning', icon: 'returned', title: `${shortDoc(m[2])} request sent back`, by: m[1],
      quote: { label: 'Reason', text: m[3].trim() }, links,
    };
  },
  (t, links) => {
    const m = t.match(/^(.+?) reviewed this load and marked the (.+?) request done\.$/);
    if (!m) return null;
    return { tone: 'success', icon: 'done', title: `${shortDoc(m[2])} request done`, by: m[1], links, compact: true };
  },

  // ── Agreements sent ──────────────────────────────────────────────────────
  (t, links) => {
    const m = t.match(/^([\s\S]*?)(?: Copied to (.+?)\.)?(?: Sent by (.+?)\.)? E-signature link: \S+$/)
      ?? t.match(/^((?:Load|Rate) confirmation sent for signature to \S+?\.)$/);
    if (!m) return null;
    const [, lead, cc, by] = m;
    let title = '', to = '', version = '', icon: AlertIcon = 'send', detail: string | undefined;
    let x: RegExpMatchArray | null;
    if ((x = lead.match(/^(Load|Rate) confirmation sent for signature to (\S+?)\.$/))) {
      title = x[1] === 'Load' ? 'SA sent to the client' : 'Dispatch Sheet sent to the carrier';
      to = x[2];
    } else if ((x = lead.match(/^The updated load confirmation \(version (\d+)\) was emailed to (\S+?)\.(?= )/))) {
      title = 'Updated SA sent'; version = x[1]; to = x[2]; icon = 'resend';
      detail = 'Same link and QR code. It now shows the update.';
    } else if ((x = lead.match(/^The load confirmation was emailed again to (\S+?), same link\.$/))) {
      title = 'SA sent again'; to = x[1]; icon = 'resend';
    } else if ((x = lead.match(/^The rate confirmation was emailed again to (\S+?) \(version (\d+)\), with a new link\.( Earlier links no longer work\.)?$/))) {
      title = 'Dispatch Sheet sent again'; to = x[1]; version = x[2]; icon = 'resend';
      detail = x[3] ? 'New link. Earlier links no longer work.' : 'With a new link.';
    } else {
      return null;
    }
    return {
      tone: 'info', icon, title, by, detail,
      tags: [`To ${to}`, ...emails(cc).map((e) => `Cc ${e}`), ...(version ? [`Version ${version}`] : [])],
      links: relabel(links, 'sign', 'Open signing page'),
      compact: !links.length && !by && !cc && !detail,
    };
  },

  // ── Signatures ───────────────────────────────────────────────────────────
  (t, links) => {
    const m = t.match(/^(Carrier|Client) signed — (.+?)\.(?=$| Signed electronically| They added)(?: Signed electronically (?:using|on) (.+?)\.)?(?: They added special instructions: "([\s\S]*)")?$/);
    if (!m) return null;
    return {
      tone: 'success', icon: 'signed',
      title: m[1] === 'Client' ? 'Client signed the SA' : 'Carrier signed the Dispatch Sheet',
      by: m[2],
      tags: m[3] ? [`Signed on ${m[3]}`] : undefined,
      quote: m[4] ? { label: 'Special instructions added', text: m[4] } : undefined,
      links,
    };
  },
  (t, links) => {
    const m = t.match(/^(.+?) dispatched this load without the client's signature(?: — ([\s\S]+?))?\.$/);
    if (!m) return null;
    return {
      tone: 'warning', icon: 'waived', title: 'Dispatched without the client’s signature', by: m[1],
      quote: m[2] ? { label: 'Reason', text: m[2] } : undefined, links,
    };
  },

  // ── Status, carrier, documents ───────────────────────────────────────────
  (t) => {
    const m = t.match(/^Status moved to (.+?)\.$/);
    if (!m) return null;
    const status = STATUS_BY_LABEL[m[1].toLowerCase()];
    return { tone: statusTone(status), icon: 'status', title: `Moved to ${m[1]}`, status, links: [] };
  },
  (t) => {
    const m = t.match(/^Carrier assigned: (.+)\.$/);
    if (m) return { tone: 'info', icon: 'carrier', title: 'Carrier assigned', tags: [m[1]], links: [], compact: true };
    if (t === 'Carrier removed from this load.') {
      return { tone: 'neutral', icon: 'carrierOff', title: 'Carrier removed from this load', links: [], compact: true };
    }
    return null;
  },
  (t) => {
    const m = t.match(/^(BOL|Invoice|POD) (added|removed)\.$/);
    if (!m) return null;
    const icon: AlertIcon = m[2] === 'removed' ? 'removed' : m[1] === 'BOL' ? 'bol' : m[1] === 'Invoice' ? 'invoice' : 'pod';
    return { tone: m[2] === 'added' ? 'success' : 'neutral', icon, title: `${m[1]} ${m[2]}`, links: [], compact: true };
  },
  (t) => {
    const m = t.match(/^Both sides have signed, but the BOL was not generated because the load is missing: (.+?)\. Fill these in/);
    if (!m) return null;
    return {
      tone: 'warning', icon: 'missing', title: 'BOL waiting on details',
      detail: 'Both sides signed. Fill these in, then press Generate BOL on the order.',
      tags: sections(m[1]), links: [],
    };
  },
  (t) => {
    if (!t.startsWith('Both sides have signed, so TTMS generated the BOL')) return null;
    return {
      tone: 'success', icon: 'bol', title: 'BOL generated',
      detail: 'Both sides signed. Admin and dispatch choose who to send it to from the order.', links: [],
    };
  },
  (t) => {
    const m = t.match(/^(.+?) emailed the BOL to (.+)\.$/);
    if (!m) return null;
    const tags = [...m[2].matchAll(/the ([^(]+?) \(([^)]+)\)/g)].map((x) => `${cap(x[1])} · ${x[2]}`);
    return { tone: 'info', icon: 'mail', title: 'BOL emailed', by: m[1], tags: tags.length ? tags : [m[2]], links: [] };
  },
  (t) => {
    if (!t.startsWith('TTMS could not save the carrier vetting record')) return null;
    return {
      tone: 'danger', icon: 'warning', title: 'Vetting record not saved',
      detail: 'Save one from Vetting records in the Carrier section.', links: [],
    };
  },

  // ── Signed copies ────────────────────────────────────────────────────────
  (t, links) => {
    const m = t.match(/^(.+?) uploaded the (.+?) \((.+?)\) and it needs verifying before it counts\./);
    if (!m) return null;
    return {
      tone: 'warning', icon: 'upload', title: `${cap(m[2])} to verify`, by: m[1],
      detail: 'It counts once admin or dispatch has opened and approved it.',
      tags: [m[3]], links: relabel(links, 'internal', 'Verify it'),
    };
  },
  (t, links) => {
    const m = t.match(/^(.+?) refused the (signed SA|signed Dispatch Sheet) (.+?) uploaded by (.+?): ([\s\S]+?)\. Upload a corrected copy on the load\.$/);
    if (!m) return null;
    return {
      tone: 'danger', icon: 'refused', title: `${cap(m[2])} refused`, by: m[1],
      detail: `${m[4]}, please upload a corrected copy on the load.`,
      tags: [m[3]], quote: { label: 'Reason', text: m[5] }, links,
    };
  },
  (t, links) => {
    const m = t.match(/^(.+?) verified the (signed SA|signed Dispatch Sheet) (.+?)(?: — signed by (.+?))?\.$/);
    if (!m) return null;
    return {
      tone: 'success', icon: 'verified', title: `${cap(m[2])} verified`, by: m[1],
      detail: m[4] ? `Signed by ${m[4]}` : undefined, tags: [m[3]], links,
    };
  },
  (t, links) => {
    const m = t.match(/^(.+?) emailed (.+?) that their acceptance of the (.+?) is registered, with the signed (.+?) attached\.$/);
    if (!m) return null;
    return {
      tone: 'info', icon: 'mail', title: 'Signed copy confirmation sent', by: m[1],
      tags: [`To ${m[2]}`], links,
    };
  },

  // ── Change orders ────────────────────────────────────────────────────────
  (t, links) => {
    const m = t.match(/^(.+?) submitted a change order touching (.+?)(?:: ([\s\S]+?))?\. Nothing changes until admin or dispatch approves it\./);
    if (!m) return null;
    return {
      tone: 'warning', icon: 'changeOrder', title: 'Change order waiting', by: m[1],
      detail: 'Nothing changes until admin or dispatch approves it.',
      tags: m[2].split(' and ').map(cap),
      quote: m[3] ? { label: 'Reason', text: m[3] } : undefined,
      links: relabel(links, 'internal', 'Approve or turn down'),
    };
  },
  (t, links) => {
    const m = t.match(/^(.+?) approved (.+?)’s change order\. The load is updated, and (.+?) needs sending again\.(?: Note: ([\s\S]+))?$/);
    if (!m) return null;
    return {
      tone: 'success', icon: 'approved', title: 'Change order approved', by: m[1],
      detail: `Requested by ${m[2]}. ${cap(m[3])} needs sending again.`,
      quote: m[4] ? { label: 'Note', text: m[4] } : undefined, links,
    };
  },
  (t, links) => {
    const m = t.match(/^(.+?) turned down (.+?)’s change order: ([\s\S]+)$/);
    if (!m) return null;
    return {
      tone: 'danger', icon: 'declined', title: 'Change order turned down', by: m[1],
      detail: `Requested by ${m[2]}.`, quote: { label: 'Reason', text: m[3] }, links,
    };
  },
  (t) => {
    const m = t.match(/^(.+?) withdrew their change order\.$/);
    if (!m) return null;
    return { tone: 'neutral', icon: 'withdrawn', title: 'Change order withdrawn', by: m[1], links: [], compact: true };
  },

  // ── The driver ───────────────────────────────────────────────────────────
  (t, links) => {
    const m = t.match(/^Driver (.*?) ?: (Arrived at pickup|Loaded \/ picked up|In transit|Arrived at delivery|Delivered)\.( Location: \S+)?( The status stays ([^:]+): the carrier has not signed the Dispatch Sheet\.)?$/);
    if (!m) return null;
    return {
      tone: 'driver', icon: 'driver', title: m[2], by: m[1] ? `Driver ${m[1]}` : 'The driver',
      detail: m[5] ? `The status stays ${m[5]}: the carrier hasn’t signed the Dispatch Sheet.` : undefined,
      links,
    };
  },
  (t, links) => {
    const m = t.match(/^Driver (.*?) shared their location:/);
    if (!m) return null;
    return { tone: 'driver', icon: 'location', title: 'Location shared', by: m[1] ? `Driver ${m[1]}` : 'The driver', links };
  },
  (t) => {
    const m = t.match(/^Driver (.+?) says (the client paid them in full \(COD\)|they were paid)\./);
    if (!m) return null;
    return {
      tone: 'success', icon: 'payment',
      title: m[2] === 'they were paid' ? 'Driver says they were paid' : 'Driver says the client paid in full (COD)',
      by: `Driver ${m[1]}`, detail: 'The proof is on the Documents tab.', links: [],
    };
  },
  (t) => {
    const m = t.match(/^(Client paid us|Client paid the driver \(COD\)|Driver paid|Broker paid \(carrier paid our share\)): recorded\.$/);
    if (!m) return null;
    return { tone: 'success', icon: 'payment', title: `Payment recorded: ${m[1]}`, links: [], compact: true };
  },

  // ── The room's first line ────────────────────────────────────────────────
  (t) => {
    const m = t.match(/^Discussion opened\. (.+)\.$/);
    if (!m) return null;
    return { tone: 'neutral', icon: 'opened', title: 'Discussion opened', tags: m[1].split(' · '), links: [] };
  },
];

/** "Shipper Agreement (SA)" → "SA", for a headline with room for three words. */
function shortDoc(name: string): string {
  if (/shipper agreement|\bSA\b/i.test(name)) return 'SA';
  if (/dispatch sheet|carrier agreement|rate con/i.test(name)) return 'Dispatch Sheet';
  return cap(name);
}

/** Gives the first link of a kind the button label this card wants. */
function relabel(links: AlertLink[], kind: AlertLink['kind'], label: string): AlertLink[] {
  let done = false;
  return links.map((l) => {
    if (done || l.kind !== kind) return l;
    done = true;
    return { ...l, label };
  });
}

/**
 * The card for an alert's text, or a plain card when no pattern matches.
 *
 * `null` only for lines that are not about a load — the room's own membership
 * lines ("Ana added Luis") — which keep the small centred pill: they are about
 * the conversation, not the freight, and a card would overstate them.
 */
export function alertCardFor(text: string): AlertCardModel | null {
  const t = text.trim();
  const links = linksIn(t);
  for (const rule of RULES) {
    const card = rule(t, links);
    if (card) return card;
  }
  // Not a load alert we know. Lines with a link get a plain card so the link
  // is still a button; everything else stays a pill.
  if (!links.length) return null;
  const body = withoutLinks(t);
  const firstStop = body.search(/\.\s/);
  return {
    tone: 'neutral', icon: 'info',
    title: firstStop > 0 ? body.slice(0, firstStop) : body.replace(/\.$/, ''),
    detail: firstStop > 0 ? body.slice(firstStop + 1).trim() : undefined,
    links,
  };
}
