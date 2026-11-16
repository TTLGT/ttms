import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminStorage, AdminAuthError } from '@/lib/firebase-admin';
import { requireCaller } from '@/lib/partyAccess';
import { getVisibleOrder } from '@/lib/orderAccess';
import { roomPhotoBelongsTo } from '@/lib/chatServer';
import { CONVERSATIONS_COLLECTION, recordConversationId } from '@/types/conversation';

type RouteContext = { params: Promise<{ orderId: string }> };

export const maxDuration = 30;

// Vercel will not send a function response over 4.5 MB, so a bigger chat
// picture is refused with what to do instead rather than failing half-sent.
const MAX_HANDOVER_BYTES = 4_400_000;

/**
 * One picture from a load's own chat room, handed to the browser so it can be
 * added to the load's pictures through the ordinary tray (2026-11-16).
 *
 * It saves nothing. The browser shrinks it and sends it through
 * POST /api/orders/{id}/photos like any other picture — the server has no
 * image library to make the thumbnail with — so the type is still chosen by a
 * person and the change log still records the add.
 *
 * Narrow on purpose, though every allowed account can already read the
 * `chat/` prefix from the bucket: the caller must be able to open the load,
 * must be in the load's room, and the file must be in that room's own folder.
 * So this can only ever move a picture from a load's room onto the same load.
 */
export async function GET(req: NextRequest, { params }: RouteContext) {
  const { orderId } = await params;
  try {
    const caller = await requireCaller(req);
    await getVisibleOrder(caller, orderId);

    const path = req.nextUrl.searchParams.get('path') ?? '';
    const roomId = recordConversationId('order', orderId);
    if (!roomPhotoBelongsTo(path, roomId)) {
      return NextResponse.json({ error: "That picture is not from this load's chat." }, { status: 400 });
    }

    const room = await adminDb.collection(CONVERSATIONS_COLLECTION).doc(roomId).get();
    const members = (room.data()?.memberUids ?? []) as unknown[];
    if (!room.exists || !members.includes(caller.uid)) {
      return NextResponse.json({ error: "You are not in this load's chat." }, { status: 403 });
    }

    const file = adminStorage.bucket().file(path);
    const [meta] = await file.getMetadata().catch(() => [null]);
    const type = String(meta?.contentType ?? '');
    if (!meta || !type.startsWith('image/')) {
      return NextResponse.json({ error: 'Only a picture can be added to the load.' }, { status: 400 });
    }
    if (Number(meta.size) > MAX_HANDOVER_BYTES) {
      return NextResponse.json(
        { error: 'That picture is too large to bring over. Save it from the chat, then drop it on the load.' },
        { status: 413 },
      );
    }
    const [buf] = await file.download();
    return new NextResponse(new Uint8Array(buf), {
      headers: { 'Content-Type': type, 'Cache-Control': 'private, no-store' },
    });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
