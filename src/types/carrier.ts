import type { Timestamp } from 'firebase/firestore';

export interface Carrier {
  id: string;
  batsId: string | null;
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  dot: string;
  mc: string;
  address: string;
  fax: string;
  dispatcher: string;
  dispatcherPhone: string;
  dispatcherEmail: string;
  billingContact: string;
  billingPhone: string;
  billingEmail: string;
  insuranceExpiration: Timestamp | null;
  insuranceProvider: string;
  insurancePolicyNumber: string;
  isActive: boolean;
  notes: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type InsuranceStatus = 'active' | 'expiring_soon' | 'expired' | 'unknown';

export function getInsuranceStatus(
  expiration: Timestamp | null | undefined
): InsuranceStatus {
  if (!expiration || typeof expiration.toDate !== 'function') return 'unknown';
  const daysUntil = Math.floor(
    (expiration.toDate().getTime() - Date.now()) / 86_400_000
  );
  if (daysUntil < 0)  return 'expired';
  if (daysUntil <= 30) return 'expiring_soon';
  return 'active';
}
