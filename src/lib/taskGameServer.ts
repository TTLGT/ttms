import type { DocumentSnapshot, QuerySnapshot, Transaction } from 'firebase-admin/firestore';
import { adminDb } from './firebase-admin';
import { taskOwnerDoc } from './personalTasksServer';
import { officeToday } from '@/types/celebration';
import { normalizeEmail } from './accessControl';
import { TIME_OFF_COLLECTION } from '@/types/attendance';
import { GameTurn, addDays, cleanGameState, prevWorkingDay, type GameEvent, type GameState } from '@/types/taskGame';
import type { PersonalTask } from '@/types/task';

/**
 * Server side of game mode — see src/types/taskGame.ts for the rules.
 *
 * The state sits on the person's own `personalTasks/{uid}` document, beside
 * their reminder settings and board columns, and is written in the same
 * transaction as the task change that moved it. Two tabs ticking two tasks
 * at once therefore both count, rather than the second save overwriting the
 * first one's XP.
 */

export function gameFrom(owner: DocumentSnapshot): GameState {
  return cleanGameState(owner.data()?.game);
}

/**
 * The person's days off for the streak: every day covered by one of their
 * time-off requests that is waiting or approved, any kind. Waiting counts on
 * purpose — the streak should freeze from the moment somebody asks, not from
 * whenever HR gets round to it, and a request refused after the days have
 * gone by has already done no harm worth taking back. Refused and withdrawn
 * requests freeze nothing.
 *
 * One equality query on `email`, which Firestore indexes by itself, and only
 * when game mode is on — it costs one read per request the person has ever
 * made, which is a handful. Days more than 120 back are dropped: the streak
 * never looks further than prevWorkingDay() does.
 */
export async function offDaysFor(email: string | undefined, today: string, tx?: Transaction): Promise<Set<string>> {
  const who = normalizeEmail(email);
  if (!who) return new Set();
  const query = adminDb.collection(TIME_OFF_COLLECTION).where('email', '==', who);
  return offDaysIn(tx ? await tx.get(query) : await query.get(), today);
}

function offDaysIn(snap: QuerySnapshot, today: string): Set<string> {
  const out = new Set<string>();
  const floor = addDays(today, -120);
  for (const d of snap.docs) {
    const r = d.data();
    if (r.status !== 'pending' && r.status !== 'approved') continue;
    if (typeof r.from !== 'string' || typeof r.to !== 'string' || r.to < floor) continue;
    let day = r.from < floor ? floor : r.from;
    for (let i = 0; i < 200 && day <= r.to; i++, day = addDays(day, 1)) out.add(day);
  }
  return out;
}

/** The time stamps a turn needs: the office's day, and now. */
export function gameClock() {
  return { today: officeToday(), now: new Date().toISOString() };
}

/**
 * The first look of the day: penalties and new missions. Runs only when the
 * stored check is for an earlier day, so on every other read it costs nothing
 * — not even the transaction.
 */
export async function runDailyCheck(
  uid: string,
  email: string | undefined,
  stored: GameState,
  openTasks: PersonalTask[],
): Promise<{ game: GameState; events: GameEvent[] }> {
  const { today, now } = gameClock();
  if (!stored.enabled || stored.lastCheckDate === today) return { game: stored, events: [] };

  const owner = taskOwnerDoc(uid);
  const offDays = await offDaysFor(email, today);
  return adminDb.runTransaction(async (tx) => {
    // Read again inside: a second tab opened the same morning must not
    // charge the overdue penalty twice.
    const fresh = gameFrom(await tx.get(owner));
    if (!fresh.enabled || fresh.lastCheckDate === today) return { game: fresh, events: [] };
    const turn = new GameTurn(fresh, today, now, offDays);
    turn.onNewDay(openTasks);
    const out = turn.finish();
    tx.set(owner, { game: out.state }, { merge: true });
    return { game: out.state, events: out.events };
  });
}

/** One change to the game inside a transaction the caller already holds. */
export function writeGame(tx: Transaction, uid: string, game: GameState) {
  tx.set(taskOwnerDoc(uid), { game }, { merge: true });
}

/**
 * Switch game mode on or off, or change the theme.
 *
 * Turning it on starts the count from today: the day's check is marked done
 * without charging anything, and a streak left over from the last time it was
 * on is cleared quietly rather than charged as broken — the person did not
 * break it, they put the game down.
 */
export async function setGameOptions(
  uid: string,
  email: string | undefined,
  options: { enabled?: boolean; theme?: GameState['theme'] },
): Promise<GameState> {
  const { today, now } = gameClock();
  const owner = taskOwnerDoc(uid);
  const offDays = options.enabled === true ? await offDaysFor(email, today) : new Set<string>();
  return adminDb.runTransaction(async (tx) => {
    const state = gameFrom(await tx.get(owner));
    if (options.theme) state.theme = options.theme;

    if (options.enabled === true && !state.enabled) {
      state.enabled = true;
      if (state.lastActiveDate && state.lastActiveDate < prevWorkingDay(today, offDays)) state.streak = 0;
      state.lastCheckDate = null;
      const turn = new GameTurn(state, today, now, offDays);
      turn.onNewDay([]);
      Object.assign(state, turn.finish().state);
    } else if (options.enabled === false) {
      state.enabled = false;
    }

    tx.set(owner, { game: state }, { merge: true });
    return state;
  });
}
