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
  commodity       : string          // one-line summary, DERIVED from commodities
  commodities     : CommodityItem[] // itemised freight — source of truth
  pieces          : number          // DERIVED: sum of commodities[].quantity
  weight          : number          // DERIVED: total lbs across commodities
  origin          : Address
  destination     : Address
  routeMapUrl     : string          // Google Maps directions link; auto-built, editable
  laneMiles       : number | null   // distance between the two addresses; see below
  laneMilesSource : "estimate" | "routes" | null   // how laneMiles was obtained
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

### `laneMiles` and `laneMilesSource`

Distance between the order's two addresses. **Which method produced it is
recorded alongside the number**, because the two are not interchangeable — an
estimate must never be billed against.

| `laneMilesSource` | Method | Cost | Accuracy |
|---|---|---|---|
| `"estimate"` | Great-circle distance between the two ZIP centroids (US Census ZCTA table at `src/lib/data/zipCentroids.json`), times a circuity factor for roads not running straight. `src/lib/routeDistance.ts`. | Free, offline | ~5% typical; mountain lanes ~17% low |
| `"routes"` | Google Routes API, real road miles. `src/lib/routeDistanceGoogle.ts`. | **Billed per lookup** | Exact |
| `null` | Not worked out — no ZIP, or lane distances switched off. | — | — |

An admin picks the method for the whole company in Settings → Lane Distance;
it is stored in `appSettings/general` (below). The mode is read **server-side**
in `/api/route-distance` and never taken from the request, so a client cannot
run up a Routes bill by asking for it.

If Google Routes is selected but fails — no key, billing lapsed, an address it
cannot route — the order silently falls back to the free estimate, records
`"estimate"` as the source, and the form says so. Showing a rougher number
beats showing none.

Stored on the order rather than recomputed on read: it is looked up once, when
the order is created or first viewed without one. That keeps the figure a
broker quoted against fixed, and under Routes it is what stops every page view
from costing money.

## Collection: `appSettings`

Company-wide settings, as a single document. One doc rather than one per
setting: there are few, they are read together, and one document is one read.

```
appSettings/general
  laneDistanceMode : "off" | "estimate" | "routes"   // default "estimate"
  updatedAt        : Timestamp
  updatedBy        : string          // email or uid of the admin who changed it
```

Readable by any allowed user — a broker's order form has to know whether to
show a distance. Written only through `PUT /api/app-settings`, admin-only, like
every other collection that shapes app behaviour. The default is `"estimate"`
and not `"routes"`: a default must never be the option that spends money.

### `CommodityItem`

One line of freight. A load is often a mix of objects of different sizes, so
weight and dimensions live per item rather than on the order.

```
{
  id            : string          // client-generated; React key only
  description   : string
  quantity      : number          // pieces on this line
  length        : number
  width         : number
  height        : number
  dimensionUnit : "in" | "ft" | "cm" | "m"
  weight        : number          // per PIECE, in weightUnit
  weightUnit    : "lb" | "kg"
}
```

Units are stored beside the numbers rather than normalised, so a dimension
reads back in the units it was quoted in. Convert with the helpers in
`src/types/order.ts` (`toInches`, `toPounds`, `itemWeightLb`, `itemVolumeFt3`).

`order.commodity`, `order.pieces` and `order.weight` are derived from this
array on every save and kept because order lists, the BOL/invoice PDFs and the
agreement emails read them directly. Orders written before this array existed
have no `commodities` field — read them through `orderCommodityItems(order)`,
which collapses the legacy fields into a single dimensionless line.

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

## Access Control (invitation only)

Signing in with Google grants nothing on its own. An admin must first add the
person's email under **Settings → Grant Access**, which creates an
`allowedUsers/{email}` document — that document is what authorizes the account.
Email domain is no longer a grant, so external collaborators can be added and
a company address that was never invited is refused.

| Collection     | Role                                                                       |
|----------------|----------------------------------------------------------------------------|
| `allowedUsers` | The allowlist, keyed by lowercased email. Source of truth for roles. Admin-readable, never client-writable. |
| `users`        | Live profile for someone who has actually signed in, keyed by uid. Provisioned server-side from the allowlist. |

An entry with `uid: null` is a pending invite — created, but the person has not
signed in yet.

**Flow.** `/api/auth/session` runs on every sign-in: it verifies the ID token,
requires an `allowedUsers` entry, provisions `users/{uid}` with the roles from
that entry, and mirrors them into custom claims. `AuthContext` signs the user
out if this call fails, so there is no signed-in state without a verified entry.

**Revocation** (Settings → trash icon) deletes both documents, clears the custom
claims, revokes refresh tokens and disables the Auth account. Firestore cuts off
on the next request; Storage relies on the claim, so it lags until the current
ID token expires (max one hour).

**Lockout protection.** `BOOTSTRAP_ADMIN_EMAILS` in `src/lib/accessControl.ts`
(mirrored in `firestore.rules`) is always allowed and always admin, so an empty
or damaged allowlist can never lock everyone out. Those accounts cannot be
removed or demoted through the UI. Run `node scripts/seed-allowed-users.js`
once when migrating an existing deployment onto the allowlist.

## Security Rules (high-level intent)

- Only authenticated users with an `allowedUsers` entry (or a bootstrap admin address) may read/write any document.
- `allowedUsers` and `users` are never writable from the client — all changes go through the Admin SDK, so nobody can self-promote to admin.
- `agreements` documents may be written by unauthenticated signers **only** via a secure Cloud Function that validates a one-time token — never directly from the client SDK.
- Storage rules cannot read Firestore, so they gate on the `ttlAccess` custom claim that `/api/auth/session` stamps at sign-in.
