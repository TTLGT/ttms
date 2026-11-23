'use client';

import { useAuth } from '@/context/AuthContext';
import DateFormatPanel from '@/components/settings/DateFormatPanel';
import PresencePanel from '@/components/settings/PresencePanel';
import ReminderEmailsPanel from '@/components/settings/ReminderEmailsPanel';

/**
 * Settings → General: three company-wide switches that belong to no
 * department. HR reaches this page for Online status alone (`presence.manage`),
 * so the page filters its own cards — a card drawn for somebody whose save
 * would be refused is worse than one left off.
 */
export default function Page() {
  const { can } = useAuth();
  const admin = can('settings.manage');
  return (
    <div className="space-y-6">
      {admin && <DateFormatPanel />}
      {(admin || can('presence.manage')) && <PresencePanel />}
      {admin && <ReminderEmailsPanel />}
    </div>
  );
}
