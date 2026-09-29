import { redirect } from 'next/navigation';

/**
 * Celebrations is now a layer of the Calendar — see CelebrationPanels.tsx.
 * Kept as a redirect so bookmarks and older links still land somewhere.
 */
export default function CelebrationsPage() {
  redirect('/dashboard/calendar');
}
