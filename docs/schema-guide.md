# Firestore Schema Guide — TTL TMS

> **Storage strategy:** Firestore for structured data and metadata.
> Firebase Storage for binary files (PDFs, images).
> All Storage references are stored as a `storagePath` string inside a Firestore `documents` subcollection so you always know where the file lives.

---

## Collection: `shippers`

Represents a Client / Shipper company.

```
shippers/{shipperId}
  id              : string          // auto Firestore doc ID
  companyName     : string
  contacts        : Contact[]       // see sub-type below
  defaultOrigin   : Address | null
  defaultDest     : Address | null
  notes           : string
  createdAt       : Timestamp
  updatedAt       : Timestamp
```

### Sub-type: `Contact`
```
  name    : string
  email   : string
  phone   : string
  role    : string   // e.g. "Billing", "Operations"
```

### Sub-type: `Address`
```
  street  : string
  city    : string
  state   : string   // 2-letter abbreviation
  zip     : string
  country : string   // default "US"
```

---

## Collection: `carriers`

Represents a Trucking Company / Owner-Operator.

```
carriers/{carrierId}
  id                    : string
  companyName           : string
  contactName           : string
  email                 : string
  phone                 : string
  dot                   : string          // DOT number
  mc                    : string          // MC/FF number
  insuranceExpiration   : Timestamp       // drive the expiry-alert badge
  insuranceProvider     : string
  insurancePolicyNumber : string
  isActive              : boolean
  notes                 : string
  createdAt             : Timestamp
  updatedAt             : Timestamp
```

> **Subcollection:** `carriers/{carrierId}/documents` — carrier-level docs (insurance certs, W-9s)

---

## Collection: `orders`

Top-level freight order. A single client request. May be split into one or more suborders.

```
orders/{orderId}
  id              : string
  orderNumber     : string          // human-readable, e.g. "TTL-2026-0042"
  shipperId       : string          // → shippers/{shipperId}
  parentOrderId   : string | null   // null = primary order; set = suborder
  status          : OrderStatus
  commodity       : string          // "Vehicle", "Heavy Machinery", "Pallets", etc.
  pieces          : number
  weight          : number          // lbs
  origin          : Address
  destination     : Address
  pickupDate      : Timestamp | null
  deliveryDate    : Timestamp | null
  carrierId       : string | null   // → carriers/{carrierId}; null until assigned
  driverName      : string
  driverPhone     : string
  driverLicenseStoragePath : string | null  // Firebase Storage path for DL upload
  agreedRate      : number          // USD
  brokerFee       : number          // USD
  carrierPay      : number          // USD
  notes           : string
  createdBy       : string          // uid of the broker who created it
  createdAt       : Timestamp
  updatedAt       : Timestamp
```

### `OrderStatus` enum
```
"quote"          — initial quote, not yet accepted
"booked"         — shipper accepted the rate
"carrier_assigned" — carrier matched and Carrier Agreement sent
"carrier_signed" — Carrier Agreement e-signed
"shipper_signed" — Shipper Agreement e-signed
"in_transit"     — picked up, en route
"delivered"      — delivered; awaiting BOL + invoice upload
"completed"      — all paperwork received, payment settled
"cancelled"
```

### Suborders
A suborder is simply an `orders` document where `parentOrderId` is set to the primary order's ID.
This allows:
- Different carriers per suborder
- Different pickup/delivery dates
- Separate BOL per shipment leg

To fetch all suborders of a primary order:
```ts
query(collection(db, 'orders'), where('parentOrderId', '==', primaryOrderId))
```

> **Subcollection:** `orders/{orderId}/documents` — order-level docs (BOL, Invoice, Carrier Agreement, Shipper Agreement)

---

## Collection: `agreements`

Tracks the e-sign lifecycle for both Carrier and Shipper agreements.

```
agreements/{agreementId}
  id              : string
  orderId         : string          // → orders/{orderId}
  type            : "carrier" | "shipper"
  status          : "pending" | "sent" | "signed" | "rejected"
  signerName      : string          // typed by the signer
  signerEmail     : string
  signerIp        : string          // captured at time of signing
  signerUserAgent : string          // browser/device info
  signedAt        : Timestamp | null
  sentAt          : Timestamp
  documentUrl     : string          // link to the agreement PDF in Storage
  signedDocumentStoragePath : string | null  // filled in after signing
  createdAt       : Timestamp
```

> The `signerIp` and `signedAt` fields are the legal audit trail required in Step 3 of the workflow.

---

## Subcollection: `documents` (shared pattern)

Used under `orders/{orderId}/documents` and `carriers/{carrierId}/documents`.

```
documents/{documentId}
  id              : string
  type            : DocumentType
  fileName        : string          // original file name
  storagePath     : string          // Firebase Storage path
  downloadUrl     : string          // long-lived signed URL (or populated on demand)
  uploadedBy      : string          // uid
  uploadedAt      : Timestamp
  notes           : string
```

### `DocumentType` enum
```
"bol"               — Bill of Lading (driver uploads after delivery)
"bol_signed"        — Signed BOL returned by driver
"invoice"           — Carrier's invoice
"carrier_agreement" — Carrier rate confirmation / agreement
"shipper_agreement" — Shipper rate confirmation / agreement
"driver_license"    — Uploaded by broker at carrier-match step
"insurance_cert"    — Carrier insurance certificate
"other"
```

---

## Firebase Storage Bucket Layout

```
/driver_licenses/{orderId}/{fileName}
/bol/{orderId}/{fileName}
/invoices/{orderId}/{fileName}
/agreements/{agreementId}/{fileName}
/carrier_docs/{carrierId}/{fileName}
```

---

## Firestore Index Recommendations

| Collection | Fields to index (composite)                        | Use case                         |
|------------|----------------------------------------------------|----------------------------------|
| orders     | `shipperId` ASC + `createdAt` DESC                 | Shipper order history            |
| orders     | `carrierId` ASC + `status` ASC                     | Carrier load board               |
| orders     | `parentOrderId` ASC + `createdAt` DESC             | Suborder list                    |
| orders     | `status` ASC + `pickupDate` ASC                    | Dispatch board                   |
| agreements | `orderId` ASC + `type` ASC                         | Agreement status per order       |
| carriers   | `insuranceExpiration` ASC                          | Expiry alert dashboard           |

---

## Security Rules (high-level intent)

- Only authenticated users whose email ends with `@totaltransportlogistics.us` may read/write any document.
- `agreements` documents may be written by unauthenticated signers **only** via a secure Cloud Function that validates a one-time token — never directly from the client SDK.
- Storage rules mirror Firestore: authenticated company users only, except signed agreement PDFs which are read-accessible via the one-time token link.
