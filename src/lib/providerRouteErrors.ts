import { NextResponse } from 'next/server';
import { AdminAuthError } from './firebase-admin';

/** The one error shape every /api/providers route answers with. */
export function providerFail(e: unknown) {
  if (e instanceof AdminAuthError) {
    const existingId = (e as AdminAuthError & { existingId?: string }).existingId;
    return NextResponse.json({ error: e.message, ...(existingId ? { existingId } : {}) }, { status: e.status });
  }
  throw e;
}
