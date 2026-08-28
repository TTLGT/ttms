import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, adminDb, AdminAuthError, requireAdmin } from '@/lib/firebase-admin';
import { toSourceKey } from '@/types/leadSource';

const COL = 'leadSources';

/** Is any order or party still pointing at this source? */
async function usageCount(sourceId: string): Promise<{ orders: number; parties: number }> {
  const [orders, parties] = await Promise.all([
    adminDb.collection('orders').where('sourceId', '==', sourceId).count().get(),
    adminDb.collection('parties').where('sourceId', '==', sourceId).count().get(),
  ]);
  return { orders: orders.data().count, parties: parties.data().count };
}

/**
 * Renames a source or retires it.
 *
 * A rename touches only this document. Orders and parties store `sourceId`,
 * and every screen resolves the label from this list at render time, so a
 * rename lands everywhere at once — there is no denormalized copy to fan out
 * to. That is the whole reason the name is not mirrored onto the records.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ sourceId: string }> },
) {
  try {
    const { sourceId } = await params;
    await requireAdmin(req);
    const body = await req.json().catch(() => ({}));

    const ref  = adminDb.collection(COL).doc(sourceId);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: 'Lead source not found' }, { status: 404 });

    const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };

    if (typeof body.name === 'string') {
      const name = body.name.trim();
      if (!name) return NextResponse.json({ error: 'A source name is required.' }, { status: 400 });

      const nameKey = toSourceKey(name);
      if (!nameKey) {
        return NextResponse.json({ error: 'That name has no letters or numbers in it.' }, { status: 400 });
      }

      // Uniqueness has to hold on rename, not just at creation — otherwise two
      // documents end up with the same key and the importer's name-to-source
      // lookup picks between them arbitrarily.
      const clash = await adminDb.collection(COL).where('nameKey', '==', nameKey).limit(1).get();
      if (!clash.empty && clash.docs[0].id !== sourceId) {
        return NextResponse.json({ error: `"${clash.docs[0].get('name')}" is already on the list.` }, { status: 409 });
      }

      patch.name    = name;
      patch.nameKey = nameKey;
    }

    if (typeof body.isActive === 'boolean') patch.isActive = body.isActive;

    await ref.update(patch);
    return NextResponse.json({ id: sourceId });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}

/**
 * Deletes a source, but only while nothing references it.
 *
 * Deliberately not the detach-everything approach /api/sites takes. A site is
 * an attribute of a person and clearing it loses little; a lead source is the
 * evidence behind "this campaign brought in these loads", and silently blanking
 * it across thousands of orders would destroy reporting nobody could rebuild.
 * A source that has been used is retired with `isActive: false` instead — it
 * leaves the pickers and keeps every record it is attached to intact.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ sourceId: string }> },
) {
  try {
    const { sourceId } = await params;
    await requireAdmin(req);

    const ref  = adminDb.collection(COL).doc(sourceId);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: 'Lead source not found' }, { status: 404 });

    const used = await usageCount(sourceId);
    if (used.orders > 0 || used.parties > 0) {
      const parts = [
        used.orders  ? `${used.orders} order(s)`  : '',
        used.parties ? `${used.parties} client(s)` : '',
      ].filter(Boolean).join(' and ');
      return NextResponse.json(
        {
          error: `"${snap.get('name')}" is used by ${parts}, so it cannot be deleted. ` +
                 `Retire it instead — it will disappear from the pickers and those records keep their source.`,
          inUse: used,
        },
        { status: 409 },
      );
    }

    await ref.delete();
    return NextResponse.json({ deleted: sourceId });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
