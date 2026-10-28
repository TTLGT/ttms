import type { OrderFile } from './orderFile';
import type { AgreementParty } from './saRequest';
import type { DetectedCarrier } from './signatureRecord';
import type { FmcsaNameMatch } from '@/lib/fmcsa';

/**
 * One signed copy in the Approvals queue: the file, and enough about its load
 * to decide it without opening the load first. Served by GET /api/signed-documents.
 */
export interface SignedDocumentRow {
  file: OrderFile;
  orderId: string;
  orderNumber: string;
  /** To compare with the number printed on the document. */
  batsId: string | null;
  party: AgreementParty;
  /** The client, or the carrier, whose agreement this is. */
  partyName: string;
  orderStatus: string;
  /** The load carries the "Record import" label. */
  recordImport: boolean;
  /** That party already e-signed on TTMS's link. */
  eSigned: boolean;
  /** A signature is already recorded for that party, from another copy. */
  hasRecord: boolean;
  /** The carrier linked to the load, if any — a Carrier Agreement waits for one. */
  carrierId: string | null;
  carrierName: string;
  driverName: string;
}

/** A carrier already in TTMS that matches the one a dispatch sheet names. */
export interface CarrierCandidate {
  id: string;
  companyName: string;
  mc: string;
  dot: string;
  phone: string;
  isActive: boolean;
}

/** GET /api/orders/{id}/files/{fileId}/carrier. */
export interface CarrierLookup {
  read: DetectedCarrier | null;
  matches: CarrierCandidate[];
  fmcsa: FmcsaNameMatch[];
  /** Why FMCSA was not searched, when it could not be. */
  fmcsaError: string;
}
