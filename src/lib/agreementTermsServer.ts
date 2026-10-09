import { adminDb } from './firebase-admin';
import { readClientTerms } from '@/types/agreementTerms';

/** Where the terms live. See src/types/agreementTerms.ts for why it is its own document. */
export function agreementTermsDoc() {
  return adminDb.collection('appSettings').doc('agreementTerms');
}

/**
 * The client terms the next agreement goes out with — the saved wording, or
 * the default when nothing usable has been saved. Never fails for want of a
 * setting: an agreement that cannot be sent because nobody has visited the
 * Settings panel yet would be a worse failure than sending the old wording.
 */
export async function currentClientTerms(): Promise<{ text: string; updatedAt: unknown }> {
  const snap = await agreementTermsDoc().get();
  const stored = snap.exists ? snap.data() : null;
  return { text: readClientTerms(stored?.client), updatedAt: stored?.updatedAt ?? null };
}
