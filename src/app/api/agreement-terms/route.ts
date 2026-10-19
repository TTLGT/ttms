import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthError } from '@/lib/firebase-admin';
import { requireCaller, type Caller } from '@/lib/partyAccess';
import { actorOf } from '@/lib/recordHistory';
import { agreementTermsDoc, TERMS_STAMP } from '@/lib/agreementTermsServer';
import {
  applyGeneralTerms, canApproveTerms, canEditTerms, cleanReason, fileTermsRequest, serializeRequest, termsRequests,
} from '@/lib/termsChangeServer';
import { DEFAULT_TERMS, validateTerms, type TermsParty } from '@/types/agreementTerms';

/**
 * The general terms and conditions on the client's SA and the carrier's
 * Dispatch Sheet. See src/types/agreementTerms.ts.
 *
 * Read and written only from Settings. Nobody else needs the text through
 * here: the send routes read it with the Admin SDK, and the signer sees the
 * copy on their own signing token.
 *
 * A save from an approver applies at once; from anybody else it becomes a
 * request for an admin (`termsChangeRequests`) and nothing changes yet.
 */
const PARTIES: TermsParty[] = ['client', 'carrier'];

async function editor(req: NextRequest): Promise<Caller> {
  const caller = await requireCaller(req);
  if (!canEditTerms(caller)) throw new AdminAuthError('You do not have permission to edit the agreement terms.', 403);
  return caller;
}

function deny(e: unknown) {
  if (e instanceof AdminAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
  throw e;
}

export async function GET(req: NextRequest) {
  let caller;
  try {
    caller = await editor(req);
  } catch (e) {
    return deny(e);
  }

  const [snap, pendingSnap] = await Promise.all([
    agreementTermsDoc().get(),
    // One equality filter, the rest in memory — no composite index.
    termsRequests().where('status', '==', 'pending').get(),
  ]);
  const stored = snap.exists ? snap.data()! : null;
  const pending = pendingSnap.docs.map(serializeRequest).filter((r) => r.scope === 'general');

  // Re-validated on the way out, as the quote rates are: a document edited by
  // hand in the Console has been through no check, and the panel should say
  // when what it shows is the default rather than what was saved.
  const parties = Object.fromEntries(PARTIES.map((party) => {
    const checked = stored && party in stored ? validateTerms(stored[party], party) : null;
    const usable = checked !== null && 'text' in checked;
    const stamp = TERMS_STAMP[party];
    const by = stored?.[stamp.by];
    return [party, {
      text: usable ? checked.text : DEFAULT_TERMS[party],
      isDefault: !usable,
      updatedAt: usable ? stored?.[stamp.at]?.toDate?.()?.toISOString?.() ?? null : null,
      updatedBy: usable && typeof by === 'string' ? by : null,
      pending: pending.filter((r) => r.party === party),
    }];
  }));

  return NextResponse.json(
    { ...parties, canApprove: canApproveTerms(caller) },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}

/** `{ party, text, reason? }` — one party's terms. The other party's are left alone. */
export async function PUT(req: NextRequest) {
  let caller;
  try {
    caller = await editor(req);
  } catch (e) {
    return deny(e);
  }

  const body = await req.json().catch(() => null);
  const party = body?.party as TermsParty;
  if (!PARTIES.includes(party)) return NextResponse.json({ error: 'Say whose terms these are.' }, { status: 400 });
  const checked = validateTerms(body?.text, party);
  if ('error' in checked) return NextResponse.json({ error: checked.error }, { status: 400 });

  if (canApproveTerms(caller)) {
    await applyGeneralTerms(party, checked.text, actorOf(caller));
    return NextResponse.json({ applied: true, text: checked.text });
  }

  const snap = await agreementTermsDoc().get();
  const saved = snap.exists ? snap.data()![party] : null;
  const request = await fileTermsRequest(caller, {
    scope: 'general',
    party,
    orderId: null,
    text: checked.text,
    baseText: typeof saved === 'string' ? saved : DEFAULT_TERMS[party],
    reason: cleanReason(body?.reason),
  });
  return NextResponse.json({ applied: false, request });
}
