# Firestore Schema Guide — TTL TMS

> **Storage strategy:** Firestore for structured data and metadata.
> Firebase Storage for binary files (PDFs, images).
> Each Storage reference is a `storagePath` string **on the record itself** —
> `bolStoragePath`, `invoiceStoragePath`, `podStoragePath` and
> `driverLicenseStoragePath` on an order. The `documents` subcollection
> described further down was designed but never built; see the note there.

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

## Subcollection: `documents` (shared pattern) — NOT IMPLEMENTED

> ⚠️ **This was designed and never built.** Nothing in the app reads or writes
> it, and no such document exists in Firestore. Attachments are Storage files
> whose paths sit directly on the order (`bolStoragePath`, `invoiceStoragePath`,
> `podStoragePath`, `driverLicenseStoragePath`).
>
> `firestore.rules` carried rules for this subcollection under `orders`,
> `parties`, `shippers` and `carriers` until they were removed — they granted
> every signed-in user read and write on a collection that has never held
> anything. If you build this for real, write the rules deliberately rather
> than reinstating those.
>
> The shape below is kept as a record of the intended design.

Intended for `orders/{orderId}/documents` and `carriers/{carrierId}/documents`.

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
| parties    | `assignedToUids` + `assignedToGroupIds` + `assignedToEmails` + `assignedToName` (all ASC, equality) | The "unowned" query in `listVisibleParties` |

The order-visibility queries in `listVisibleOrders` are single-field
`array-contains` / `array-contains-any` on `assignedToUids`,
`assignedToGroupIds`, `clientOwnerUids` and `clientOwnerGroupIds`. Those are
served by automatic single-field indexes and need nothing composite — the
results are merged and sorted in memory precisely so that each query can stay
single-field. `clientId` (equality, for `syncClientOwners`) is likewise
automatic.

There is no `firestore.indexes.json` in this repo. A missing-index error in the
console links straight to a one-click creator.

---

## Ownership

`parties` and `orders` are both owned records. Ownership is what decides who
can see them, so it is never writable from the browser — see
`/api/{orders,parties}/{id}/owners`, which is limited to admins and dispatchers.

| Field | On | Meaning |
|---|---|---|
| `assignedToUids` | both | Owners who have signed in |
| `assignedToGroupIds` | both | Owning work groups (teams do **not** own anything) |
| `assignedToEmails` | both | Owners who exist on the allowlist but have never signed in; converted to a uid at first sign-in |
| `assignedToName` | parties | The BATS rep name, when it matched nobody. Grants nothing |
| `assignedTo` | orders | The same, for orders |
| `clientOwnerUids` | orders | Mirror of the client party's owners — rules cannot query for it |
| `clientOwnerGroupIds` | orders | Mirror of the client party's owning groups |

An **unowned party** (every ownership field empty) is shared reference data
anyone may use. An **unowned order** is visible only to admin, dispatch and
finance — deliberately stricter, because an order is a live load with rates on
it. Both tests must check *all* the ownership fields, `assignedToEmails`
included, or a record held for a not-yet-signed-in rep reads as public.

### `ownerEvents` subcollection

`orders/{id}/ownerEvents` and `parties/{id}/ownerEvents` keep every owner a
record has ever had:

```
{ action: 'added' | 'removed' | 'changed',
  targetType: 'user' | 'group' | 'email' | 'text',
  targetId, targetLabel,        // label captured at write time
  actorUid, actorName, actorIp, // 'bats-import' for the opening entry
  at }
```

Closed to the client SDK entirely — read it through
`GET /api/{orders,parties}/{id}/owners`, which checks the caller against the
parent record first. A subcollection rather than an array field so the log
cannot be rewritten by a document update, and so a record changing hands for
years cannot grow its parent without bound.

---

## Access Control (invitation only)

Signing in with Google grants nothing on its own. An admin must first add the
person's email under **Settings → Add People**, which creates an
`allowedUsers/{email}` document — that document is what authorizes the account.
Email domain is no longer a grant, so external collaborators can be added and
a company address that was never invited is refused.

| Collection     | Role                                                                       |
|----------------|----------------------------------------------------------------------------|
| `allowedUsers` | The allowlist, keyed by lowercased email. Source of truth for roles. Readable by admins and HR, never client-writable. |
| `users`        | Live profile for someone who has actually signed in, keyed by uid. Provisioned server-side from the allowlist. |

**Roles.** `isAdmin`, `isDispatcher`, `isFinance`, `isHr`. Broker is derived —
it is what someone has when none of the four is set (`isBroker()` in
`src/lib/accessControl.ts`) — and is deliberately never stored.

`isHr` is the odd one out: it grants **read-only access to this directory and
nothing else**. An HR user opens Settings, sees the people list including the
payroll fields below, and can export it; they cannot grant a role, edit an
entry, suspend, remove or import. They see no more clients or loads than a
plain broker, which is why `isHr` is deliberately absent from
`canSeeAllParties()`. It is also the one role with no custom claim — nothing in
the rules reads one, and it is enforced against `users/{uid}` instead.

An entry with `uid: null` is a pending invite — created, but the person has not
signed in yet.

**Flow.** `/api/auth/session` runs on every sign-in: it verifies the ID token,
requires an `allowedUsers` entry, provisions `users/{uid}` with the roles from
that entry, and mirrors them into custom claims. `AuthContext` signs the user
out if this call fails, so there is no signed-in state without a verified entry.

**Personal fields are not mirrored.** The allowlist entry also carries
`legalName`, `personalEmail`, `dateOfBirth` and `startDate`. Unlike the name,
phones, extension, site and team, these are **never** copied onto `users/{uid}`:
that document is readable by every signed-in user under `firestore.rules`, while
`allowedUsers` is readable only by admins and HR. Anything added to the mirror in
`/api/admin/users` or `src/lib/userImport.ts` is published to the whole company —
check before extending it.

`legalName` is the name as it appears on payroll and legal paperwork, for the
people whose everyday name is not the one on the form. It is one free-text field
rather than parts, because it exists to be copied verbatim onto a document.

**Bulk import.** Settings → Add People → Spreadsheet (`/api/admin/users/import`)
adds and updates entries from a CSV, matching on email. It never suspends or
deletes, and a blank cell never clears a stored value — see the header comment
in `src/lib/userImport.ts` for why. The column set is defined once in
`src/lib/userImportColumns.ts` and shared with the CSV export, so an export can
be edited and re-imported.

**Revocation** (Settings → trash icon) deletes both documents, clears the custom
claims, revokes refresh tokens and disables the Auth account. Firestore cuts off
on the next request; Storage relies on the claim, so it lags until the current
ID token expires (max one hour).

**Removals are logged.** Before the entry is deleted, a copy of it plus
`removedAt`, `removedBy` and `removedByUid` is appended to `removedUsers` — the
only trace a removal leaves. The write happens **first** and a failure aborts the
removal, because an unlogged deletion is the gap the log exists to close.
Documents use generated ids, not the email, so removing the same person twice
keeps two rows rather than overwriting the first.

The log carries the departed person's date of birth and personal email, so
`firestore.rules` denies `removedUsers` to the client SDK outright; admins read
it through `GET /api/admin/users/removed`.

**Retention is permanent, by decision of the business owner (2026-08-26).**
Removal records are never aged out, purged or trimmed. Nothing in the app
deletes from this collection and nothing should be added that does — not a
cleanup script, not a TTL policy, not a "tidy up old records" button. The log is
the only evidence a person was ever on the system and the only place their
details survive a mistaken removal, so shortening its life defeats both reasons
it exists. If a future legal obligation forces expiry, that is a decision for
the owner, not a maintenance task.

## Collections: `sites` and `teams`

Two pieces of reference data about people, both assignable from the People With
Access list, both **non-access-bearing**.

| Collection | Answers | Stored on the person as |
|---|---|---|
| `sites` | Where they sit — an office, terminal or yard. `{ name, address }` | `siteId` |
| `teams` | Who they report to. `{ name, leadUid, leadEmail }` — everyone on a team reports to its lead. | `teamId` |

Both are mirrored onto `users/{uid}` and both are cleared from every allowlist
entry and profile when the parent document is deleted (see the `DELETE` in
`/api/sites/[siteId]` and `/api/teams/[teamId]`). A team's lead is also cleared
when that person is removed from the system.

A lead is held as `leadUid` once they have signed in, and as `leadEmail` until
then — never both. `leadEmail` is drained into `leadUid` by
`claimPendingAssignments()` at first sign-in, the same way `memberEmails` is on
a work group, so an org chart can be built before the people in it have logged
in. Anything reading a lead should go through `findTeamLead()` in
`src/types/team.ts` rather than matching on one field.

**Teams are not work groups.** A team is an org chart; a `workGroups` document
is an access boundary that shares clients, shippers and consignees between its
members. Nothing in `firestore.rules` reads `teamId`, and nothing should start
to — recording that someone reports to a manager must never hand them that
manager's book of business. The two exist side by side on purpose.

Teams often line up with sites, because a team is frequently everyone in one
office, but they are separate fields: a team can span offices and an office can
hold several teams.

**Lockout protection.** `BOOTSTRAP_ADMIN_EMAILS` in `src/lib/accessControl.ts`
(mirrored in `firestore.rules`) is always allowed and always admin, so an empty
or damaged allowlist can never lock everyone out. Those accounts cannot be
removed or demoted through the UI. Run `node scripts/seed-allowed-users.js`
once when migrating an existing deployment onto the allowlist.

## Collection: `leadSources`

The managed list of places a client or a load can come from — a referral, a
load board, a campaign. Reference data, **non-access-bearing**: every signed-in
user can read the list, and only admins can change it, through
`/api/lead-sources` (the collection is closed to the client SDK).

| Field | Notes |
|---|---|
| `name` | What brokers see in the picker. |
| `nameKey` | `toSourceKey(name)` — lowercased, punctuation stripped. What the BATS import matches on. |
| `isActive` | `false` = retired: hidden from the pickers, still shown on records that carry it. |

Document ids are derived, not random: `ls-<nameKey with spaces hyphenated>`,
e.g. `ls-google-ads`. That lets the two importers, the API and the browser all
arrive at the same id for the same name without sharing a hashing
implementation, and makes a re-import idempotent.

**Orders and parties store only `sourceId`.** The label is resolved from this
list at render time, so renaming a source updates every screen at once instead
of requiring thousands of documents to be rewritten. Both also carry a
`sourceName` holding the raw text BATS supplied — a fallback label for imported
records whose source matched nothing on the list. The app never writes it.

**Who may set it is narrower than who may edit the record.** Anyone who can see
an order can edit it, but the source decides attribution, so changing it is
limited to admins and the record's own owners — `canEditSource()` in
`src/lib/accessControl.ts`, mirrored as `canEditSource()` in `firestore.rules`.
A record nobody owns can therefore only be attributed by an admin.

Deleting is refused by `/api/lead-sources/[sourceId]` while any order or party
still points at the source; retiring it is the intended path. This is
deliberately unlike `/api/sites`, which detaches users on delete: a site is an
attribute of a person and losing it costs little, whereas a lead source is the
evidence behind "this campaign brought in these loads".

## Security Rules (high-level intent)

- Only authenticated users with an `allowedUsers` entry (or a bootstrap admin address) may read/write any document.
- `allowedUsers` and `users` are never writable from the client — all changes go through the Admin SDK, so nobody can self-promote to admin.
- `agreements` documents may be written by unauthenticated signers **only** via a secure Cloud Function that validates a one-time token — never directly from the client SDK.
- Storage rules cannot read Firestore, so they gate on the `ttlAccess` custom claim that `/api/auth/session` stamps at sign-in.
