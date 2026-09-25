import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthError, FieldValue, adminDb, requireCompanyUser } from '@/lib/firebase-admin';
import { isGlossaryId } from '@/types/glossary';
import {
  MAX_LOOKUPS_PER_SAVE,
  VOCABULARY_COLLECTION,
  type WordRecord,
} from '@/types/vocabulary';

/**
 * The caller's own Learn English word list — see src/types/vocabulary.ts.
 *
 * Same shape as /api/me: the document is the uid off the verified ID token,
 * and there is no parameter for whose list it is. Nobody else's list is
 * reachable from here, admins included; a manager asking which English words
 * a report did not know is not a question this tool answers.
 */
export async function GET(req: NextRequest) {
  try {
    const { uid } = await requireCompanyUser(req);
    const snap = await adminDb.collection(VOCABULARY_COLLECTION).doc(uid).get();
    const raw = (snap.data()?.words ?? {}) as Record<string, Record<string, unknown>>;

    const words: Record<string, WordRecord> = {};
    for (const [id, entry] of Object.entries(raw)) {
      // A word taken off the glossary since it was looked up has no card to
      // show any more, so it is left out rather than listed as a blank.
      if (!isGlossaryId(id)) continue;
      const lastAt = entry.lastAt as { toDate?: () => Date } | undefined;
      words[id] = {
        count:  typeof entry.count === 'number' ? entry.count : 0,
        lastAt: typeof lastAt?.toDate === 'function' ? lastAt.toDate().toISOString() : null,
        known:  entry.known === true,
      };
    }

    return NextResponse.json({ words });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}

/**
 * Adds lookups and records "I know this" / "still learning".
 *
 * The browser batches lookups and sends them every few seconds, so one save is
 * one write however many words were opened. `set` with `merge` and an
 * increment rather than read-then-write: two tabs saving at once both count,
 * and there is no read to pay for.
 *
 * Ids are checked against the glossary and anything else is ignored, so the
 * document can only ever hold words that exist — a request cannot use it as a
 * place to store arbitrary keys.
 */
export async function POST(req: NextRequest) {
  try {
    const { uid } = await requireCompanyUser(req);
    const body = await req.json().catch(() => ({}));

    const words: Record<string, Record<string, unknown>> = {};

    const lookups = body?.lookups;
    if (lookups && typeof lookups === 'object') {
      for (const [id, n] of Object.entries(lookups)) {
        if (!isGlossaryId(id) || typeof n !== 'number' || !Number.isFinite(n)) continue;
        const count = Math.min(MAX_LOOKUPS_PER_SAVE, Math.floor(n));
        if (count < 1) continue;
        words[id] = { count: FieldValue.increment(count), lastAt: FieldValue.serverTimestamp() };
      }
    }

    const known = body?.known;
    if (known && typeof known === 'object') {
      for (const [id, value] of Object.entries(known)) {
        if (!isGlossaryId(id) || typeof value !== 'boolean') continue;
        words[id] = { ...(words[id] ?? {}), known: value };
      }
    }

    if (Object.keys(words).length === 0) {
      return NextResponse.json({ error: 'Nothing to save.' }, { status: 400 });
    }

    await adminDb.collection(VOCABULARY_COLLECTION).doc(uid).set(
      { words, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
    return NextResponse.json({ saved: Object.keys(words).length });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
