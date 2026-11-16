/**
 * Handing a picture from a load's chat room to that load's picture store
 * (2026-11-16) — see Lightbox in MessageAttachments and LoadPhotosContext.
 *
 * The event is dispatched synchronously, so an order page that has the load
 * open answers by setting `handled`. Nobody answering means the load is not
 * open: the picture waits in sessionStorage under the key and the load is
 * opened, which picks it up. Its own file so the chat does not pull in the
 * picture store to know two strings.
 */
export const CHAT_PICTURE_EVENT = 'ttms:load-picture-from-chat';
export const CHAT_PICTURE_KEY   = 'ttms.pendingChatPicture';

export interface ChatPictureDetail {
  orderId: string;
  path: string;
  name: string;
  handled?: boolean;
}
