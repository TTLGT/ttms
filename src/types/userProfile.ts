import type { Timestamp } from 'firebase/firestore';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  isAdmin: boolean;
  isDispatcher?: boolean;
  isFinance?: boolean;
  createdAt: Timestamp;
}
