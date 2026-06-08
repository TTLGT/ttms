import type { Timestamp } from 'firebase/firestore';
import type { Address } from './order';

export interface Contact {
  name: string;
  email: string;
  phone: string;
  role: string;
}

export interface Shipper {
  id: string;
  companyName: string;
  contacts: Contact[];
  defaultOrigin: Address | null;
  defaultDest: Address | null;
  notes: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export const BLANK_CONTACT: Contact = { name: '', email: '', phone: '', role: '' };
