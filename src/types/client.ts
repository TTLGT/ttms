import type { Timestamp } from 'firebase/firestore';

export interface Client {
  id: string;
  batsId: string | null;
  name: string;
  company: string;
  status: string;
  isEnabled: boolean;
  type: string;
  phone: string;
  phone2: string;
  fax: string;
  address: string;
  address2: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  email: string;
  assignedTo: string;
  assignedToUids: string[];
  leadSourceId: string;
  leadSourceName: string;
  batsCreatedAt: Timestamp | null;
  notes: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
