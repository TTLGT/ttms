import { adminDb } from './firebase-admin';

/**
 * Whether calendar reminders may go out by email — `reminderEmails` in
 * `appSettings/general`, Settings → Operations → Reminder Emails.
 *
 * Read once per cron run and applied over each person's own email tick, so
 * the company switch wins without anybody's own choice being rewritten.
 * Only `true` counts: absent means off (see AppSettings.reminderEmails), and a
 * failed read also means off — the worse failure here is an email nobody
 * wanted, not one that did not arrive while the chat message still did.
 */
export async function reminderEmailsAllowed(): Promise<boolean> {
  try {
    const snap = await adminDb.collection('appSettings').doc('general').get();
    return snap.data()?.reminderEmails === true;
  } catch {
    return false;
  }
}
