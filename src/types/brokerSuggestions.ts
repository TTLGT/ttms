/**
 * Suggested tasks for a freight desk — the "side quests" of game mode. One
 * click puts one on the person's own board as an ordinary task, marked with
 * `suggestionId` so finishing it earns SUGGESTION_BONUS_XP and counts toward
 * the "suggested" missions (src/types/taskGame.ts).
 *
 * Suggestions, not assignments: nobody hands these out and nobody checks
 * whether they were done. They are here to make the useful-but-easy-to-skip
 * part of brokering — prospecting, follow-ups, carrier relationships — worth
 * a few points.
 *
 * Ids are stored on tasks: renaming the wording is free, changing an id
 * strands the bonus on tasks already added.
 */

import type { TaskPriority } from './task';

export interface BrokerSuggestion {
  id: string;
  title: string;
  /** A line under it, saying what good looks like. Copied into the task's notes. */
  hint: string;
  priority: TaskPriority;
}

export const BROKER_SUGGESTIONS: BrokerSuggestion[] = [
  { id: 'cold_calls',     priority: 'normal', title: 'Make 10 cold calls',                        hint: 'Shippers you have never spoken to. Note who to try again.' },
  { id: 'find_lead',      priority: 'normal', title: 'Find a new lead online',                    hint: 'A shipper on a lane you already run. Add them as a party.' },
  { id: 'send_quote',     priority: 'high',   title: 'Send a new quote',                          hint: 'To a client or a prospect, with the rate and the transit time.' },
  { id: 'follow_quote',   priority: 'high',   title: 'Follow up on an open quote',                hint: 'Anything quoted more than two days ago with no answer.' },
  { id: 'check_transit',  priority: 'normal', title: 'Check in on every load in transit',         hint: 'Call or text each driver. Update the client before they ask.' },
  { id: 'call_dormant',   priority: 'normal', title: 'Call a client you have not shipped for in a month', hint: 'Ask what is moving this week.' },
  { id: 'referral',       priority: 'low',    title: 'Ask a happy client for a referral',         hint: 'Right after a load that went well is the best time.' },
  { id: 'post_load',      priority: 'normal', title: 'Post an open load on a load board',         hint: 'With the rate, equipment and dates filled in.' },
  { id: 'vet_carrier',    priority: 'normal', title: 'Vet a new carrier',                         hint: 'Authority, insurance, safety rating — before they are needed.' },
  { id: 'carrier_thanks', priority: 'low',    title: 'Thank a carrier who did a good job',        hint: 'A good carrier you keep is worth ten you find.' },
  { id: 'lane_rates',     priority: 'normal', title: 'Check market rates on your top lane',       hint: 'So the next quote on it is not a guess.' },
  { id: 'paperwork',      priority: 'high',   title: 'Chase a missing BOL or POD',                hint: 'A delivered load with no paperwork cannot be invoiced.' },
  { id: 'clean_book',     priority: 'low',    title: 'Update a client\'s contacts',               hint: 'Phone, email, who to call after hours.' },
  { id: 'backhaul',       priority: 'normal', title: 'Find a backhaul for a carrier',             hint: 'A carrier who gets a load home remembers who found it.' },
  { id: 'new_lane',       priority: 'normal', title: 'Pitch a client on a new lane',              hint: 'Somewhere they ship that you do not cover for them yet.' },
  { id: 'linkedin',       priority: 'low',    title: 'Connect with 5 shippers on LinkedIn',       hint: 'Logistics managers and shipping coordinators.' },
  { id: 'capacity_list',  priority: 'low',    title: 'Add 3 carriers to your capacity list',      hint: 'For the lanes you run most.' },
  { id: 'review_week',    priority: 'low',    title: 'Plan tomorrow\'s calls',                    hint: 'Five names, written down before you leave.' },
  { id: 'margin_check',   priority: 'normal', title: 'Review the margin on this week\'s loads',   hint: 'Which lanes paid, which did not, and why.' },
  { id: 'learn_word',     priority: 'low',    title: 'Learn one new freight term',               hint: 'Turn on Learn English in the sidebar and add it to My words.' },
];

const BY_ID = new Map(BROKER_SUGGESTIONS.map((s) => [s.id, s]));

export function brokerSuggestion(id: string | null | undefined): BrokerSuggestion | null {
  return id ? BY_ID.get(id) ?? null : null;
}

/**
 * Today's three, the same all day for the same person and different for
 * each person, so a desk of brokers is not all chasing the same idea. A hash
 * of the uid and the date, not Math.random(), so a reload does not reshuffle.
 */
export function suggestionsFor(uid: string, date: string, n = 3): BrokerSuggestion[] {
  let h = 2166136261;
  for (const c of `${uid}|${date}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  const pool = [...BROKER_SUGGESTIONS];
  const out: BrokerSuggestion[] = [];
  while (out.length < n && pool.length) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    out.push(pool.splice(h % pool.length, 1)[0]);
  }
  return out;
}
