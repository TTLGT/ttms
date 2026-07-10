import { Timestamp } from 'firebase-admin/firestore';
import { createHash } from 'crypto';
import { adminDb } from './firebase-admin';

export type ImportCollection = 'carriers' | 'customers' | 'orders';

export interface ImportResult {
  collection: ImportCollection;
  written: number;
  skipped: number;
  total: number;
}

// ── CSV parser (handles quoted fields with embedded commas/newlines) ──────────
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i], nx = text[i + 1];
    if (inQ) {
      if (ch === '"' && nx === '"') { field += '"'; i++; }
      else if (ch === '"')           { inQ = false; }
      else                           { field += ch; }
    } else {
      if      (ch === '"')                 { inQ = true; }
      else if (ch === ',')                 { row.push(field); field = ''; }
      else if (ch === '\r' && nx === '\n') { row.push(field); field = ''; rows.push(row); row = []; i++; }
      else if (ch === '\n' || ch === '\r') { row.push(field); field = ''; rows.push(row); row = []; }
      else                                 { field += ch; }
    }
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function loadCSV(text: string): string[][] {
  const rows = parseCSV(text);
  if (rows.length < 2) return [];
  return rows.slice(1).filter((r) => r.some((f) => f.trim()));
}

function ts(dateStr: string | undefined): Timestamp | null {
  if (!dateStr || !dateStr.trim()) return null;
  const d = new Date(dateStr.trim());
  return isNaN(d.getTime()) ? null : Timestamp.fromDate(d);
}

function str(val: string | undefined): string {
  return (val || '').trim();
}

/** Parse "City, ST Zip" or "Facility | Phone | City, ST Zip" → Address object */
function parseOrderAddress(raw: string) {
  const blank = { street: '', city: '', state: '', zip: '', country: '' };
  if (!raw || !raw.trim()) return blank;
  const segments = raw.split('|').map((s) => s.trim());
  const addrPart = segments[segments.length - 1];
  const m = addrPart.match(/^(.+?),\s*([A-Z]{2})\s*(\d{5}(?:-\d{4})?)?$/);
  if (m) return { street: '', city: m[1].trim(), state: m[2].trim(), zip: (m[3] || '').trim(), country: 'US' };
  return { ...blank, city: addrPart };
}

function mapOrderStatus(batsStatus: string): string {
  const MAP: Record<string, string> = {
    FindMeACarrier:            'quote',
    SearchingForCarriers:      'quote',
    Unposted:                  'quote',
    AwaitingCustomerSignature: 'booked',
    AwaitingCarrierSignature:  'carrier_assigned',
    AwaitingDispatch:          'carrier_assigned',
    Dispatched:                'carrier_assigned',
    PickedUp:                  'in_transit',
    Delivered:                 'delivered',
    Cancelled:                 'cancelled',
  };
  return MAP[batsStatus] || 'quote';
}

// ── Change detection ─────────────────────────────────────────────────────────
function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (value instanceof Timestamp) return `T:${value.toMillis()}`;
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return `{${keys.map((k) => `${k}:${stableStringify(obj[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function hashRecord(rec: Record<string, unknown>): string {
  const { createdAt, updatedAt, ...stable } = rec;
  void createdAt; void updatedAt;
  return createHash('sha1').update(stableStringify(stable)).digest('hex');
}

async function loadExistingMeta(collectionName: string) {
  const snap = await adminDb.collection(collectionName).select('_importHash', 'createdAt').get();
  const map = new Map<string, { _importHash?: string; createdAt?: Timestamp }>();
  snap.forEach((doc) => map.set(doc.id, doc.data()));
  return map;
}

async function batchWrite(
  records: Record<string, unknown>[],
  collectionName: ImportCollection,
  getId: (rec: Record<string, unknown>) => string,
): Promise<ImportResult> {
  const existing = await loadExistingMeta(collectionName);

  const toWrite: { id: string; data: Record<string, unknown> }[] = [];
  let skipped = 0;
  for (const rec of records) {
    const id    = getId(rec);
    const hash  = hashRecord(rec);
    const prior = id ? existing.get(id) : null;

    if (prior && prior._importHash === hash) {
      skipped++;
      continue;
    }

    toWrite.push({
      id,
      data: {
        ...rec,
        createdAt:   prior?.createdAt || rec.createdAt,
        _importHash: hash,
      },
    });
  }

  const CHUNK = 400;
  let written = 0;
  for (let i = 0; i < toWrite.length; i += CHUNK) {
    const batch = adminDb.batch();
    for (const { id, data } of toWrite.slice(i, i + CHUNK)) {
      const ref = id ? adminDb.collection(collectionName).doc(id) : adminDb.collection(collectionName).doc();
      batch.set(ref, data, { merge: true });
    }
    await batch.commit();
    written += Math.min(CHUNK, toWrite.length - i);
  }

  return { collection: collectionName, written, skipped, total: records.length };
}

// ── Carriers ────────────────────────────────────────────────────────────────
// Cols: Id,Name,McNumber,Status,Phone,Address,Fax,MainContact,ContactPhone,
//       ContactEmail,Dispatcher,DispatcherPhone,DispatcherEmail,
//       BillingContact,BillingPhone,BillingEmail
export async function importCarriersCSV(text: string): Promise<ImportResult> {
  const rows = loadCSV(text);
  const now  = Timestamp.now();

  const records = rows.map((r) => ({
    batsId:                str(r[0]),
    companyName:            str(r[1]),
    mc:                     str(r[2]),
    isActive:               str(r[3]).toLowerCase() === 'active',
    phone:                  str(r[4]),
    address:                str(r[5]),
    fax:                    str(r[6]),
    contactName:            str(r[7]),
    dot:                    '',
    email:                  str(r[9]),
    dispatcher:             str(r[10]),
    dispatcherPhone:        str(r[11]),
    dispatcherEmail:        str(r[12]),
    billingContact:         str(r[13]),
    billingPhone:           str(r[14]),
    billingEmail:           str(r[15]),
    insuranceExpiration:    null,
    insuranceProvider:      '',
    insurancePolicyNumber:  '',
    notes:                  '',
    createdAt:              now,
    updatedAt:              now,
  })).filter((c) => c.batsId && c.companyName);

  return batchWrite(records, 'carriers', (c) => `bats-${c.batsId}`);
}

// ── Customers ───────────────────────────────────────────────────────────────
// Cols: 0=Id,1=Name,2=Status,3=IsEnabled,4=Type,5=Phone,6=Phone2,7=Fax,8=Company,
//   9=Address,10=Address2,11=City,12=State,13=Zip,14=Country,15=Email,16=Created,
//   17=CreditCardNumber(skip),18=CreditCardExpiration(skip),19=AssignedTo,
//   20=LeadSourceId,21=LeadSourceName,22=MustSpecifyReferralSource
export async function importCustomersCSV(text: string): Promise<ImportResult> {
  const rows = loadCSV(text);
  const now  = Timestamp.now();

  const records = rows.map((r) => ({
    batsId:          str(r[0]),
    name:            str(r[1]),
    status:          str(r[2]),
    isEnabled:       str(r[3]).toLowerCase() === 'true',
    type:            str(r[4]),
    phone:           str(r[5]),
    phone2:          str(r[6]),
    fax:             str(r[7]),
    company:         str(r[8]),
    address:         str(r[9]),
    address2:        str(r[10]),
    city:            str(r[11]),
    state:           str(r[12]),
    zip:             str(r[13]),
    country:         str(r[14]),
    email:           str(r[15]),
    batsCreatedAt:   ts(r[16]),
    // r[17] = CreditCardNumber — intentionally skipped
    // r[18] = CreditCardExpiration — intentionally skipped
    assignedTo:      str(r[19]),
    leadSourceId:    str(r[20]),
    leadSourceName:  str(r[21]),
    notes:           '',
    createdAt:       now,
    updatedAt:       now,
  })).filter((c) => c.batsId && c.name);

  return batchWrite(records, 'customers', (c) => `bats-${c.batsId}`);
}

// ── Orders ──────────────────────────────────────────────────────────────────
// Cols: Id,IsDuplicate,DuplicateId,OrderType,MasterOrderId,Status,SecondaryStatus,
//   Created,CustomerName,CustomerPhone,CustomerEmail,Vehicles,Origin,Destination,
//   FirstAvailablePickup,TransportType,TotalTariff,TotalCarrierFee,TotalBrokerFee,
//   AssignedTo,SourceName,Dispatched,PickedUp,Delivered,AssignedPickup,AssignedDelivery
export async function importOrdersCSVs(texts: string[]): Promise<ImportResult> {
  const seen = new Map<string, Record<string, unknown>>();
  const now  = Timestamp.now();

  for (const text of texts) {
    const rows = loadCSV(text);
    for (const r of rows) {
      const batsId = str(r[0]);
      if (!batsId || isNaN(Number(batsId))) continue; // skip garbled rows
      if (seen.has(batsId)) continue;                  // deduplicate

      const agreedRate = parseFloat(r[16]) || 0;
      const carrierPay = parseFloat(r[17]) || 0;
      const brokerFee  = parseFloat(r[18]) || 0;

      seen.set(batsId, {
        batsId,
        orderNumber:               batsId,
        status:                    mapOrderStatus(str(r[5])),
        shipperId:                 '',
        shipperName:               str(r[8]),
        parentOrderId:             null,
        commodity:                 str(r[11]),
        vehicles:                  str(r[11]),
        pieces:                    0,
        weight:                    0,
        transportType:             str(r[15]),
        origin:                    parseOrderAddress(str(r[12])),
        destination:               parseOrderAddress(str(r[13])),
        pickupDate:                ts(str(r[24])), // AssignedPickup
        deliveryDate:              ts(str(r[25])), // AssignedDelivery
        dispatchedAt:              ts(str(r[21])),
        pickedUpAt:                ts(str(r[22])),
        deliveredAt:               ts(str(r[23])),
        carrierId:                 null,
        carrierName:               '',
        driverName:                '',
        driverPhone:               '',
        driverLicenseStoragePath:  null,
        bolStoragePath:            null,
        invoiceStoragePath:        null,
        podStoragePath:            null,
        agreedRate,
        carrierPay,
        brokerFee,
        assignedTo:                str(r[19]),
        sourceName:                str(r[20]),
        notes:                     '',
        carrierSignedAt:           null,
        carrierSignerName:         null,
        carrierSignerIp:           null,
        shipperSignedAt:           null,
        shipperSignerName:         null,
        shipperSignerIp:           null,
        createdBy:                 'bats-import',
        createdAt:                 ts(str(r[7])) || now,
        updatedAt:                 now,
      });
    }
  }

  const records = [...seen.values()];
  return batchWrite(records, 'orders', (o) => `bats-${o.batsId}`);
}
