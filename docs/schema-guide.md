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
  orderNumber     : string          // human-readable, sequential — see below, e.g. "TTL26000042"
  previousOrderNumber : string | null  // what it was called before numbering: BATS id, or "TTL-2026-4821"
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

### `orderNumber`

`TTL`, the year counted from 2000, then a six-digit sequence, zero-padded:
`TTL26000042`. The sequence restarts at 1 each January.

Because the year comes first and the sequence is a fixed width, sorting the
numbers as plain text puts them in creation order, across a year boundary
included — so a list can be ordered by order number with no extra field and no
parsing. Nothing in the code takes the number apart; treat it as opaque
outside `src/lib/orderNumber.ts`.

The `TTL` prefix earns its place on the carrier's side, where the number sits
among PO numbers, pro numbers and load numbers from every other broker they
haul for. It also keeps the value text rather than digits, so a spreadsheet
cannot reformat it into `2,026,000,042`.

The year is counted from 2000 rather than written out — 2026 is `26`. In 2100
it becomes `100` and the number grows a character rather than wrapping back to
`00` and colliding with 2000; the first load of 2100 is `TTL100000001`.

That century roll is the one place the plain-text sort gives out, since `100`
sorts ahead of `26` on the first character. Orders within a century still sort
correctly among themselves, and `createdAt` is on every order for a true
chronological sort.

The sequence lives in `counters/orderNumber-{year}` (`{ year, last, updatedAt }`)
and is advanced by a Firestore transaction in `/api/orders/number`. It has to
be a stored counter rather than "one past the highest number so far": that
query is one two brokers pressing Save in the same second can both answer with
the same value. The counter is **closed to the client SDK** — a client that
could write it could wind it back and put a number already printed on a rate
confirmation onto a second load.

A number is spent when it is drawn, so a save that fails afterwards leaves a
**gap in the sequence**. That is deliberate: reissuing the number would let two
loads carry one number across rate confirmations, BOLs and invoices, and gaps
cost nothing since the numbers still sort.

#### Imported and historical orders

Every order carries a sequence number, including the ones from BATS. Imported
orders used to put the BATS id in `orderNumber`; they now get a real sequence
number like any other, and the BATS id stays where it always was, in `batsId`.

`assignOrderNumbers()` in the import numbers each run **in creation order
within each year**, using `createdAt` — which for a BATS order is the BATS
order date (CSV column 7), not the day it was imported. Same-day ties are
broken by BATS id, which is itself sequential, because many exported rows carry
a date with no time.

Orders **already in Firestore** are numbered by
`scripts/backfill-order-numbers.js` (`--dry-run` first), which applies the same
rule across the whole collection at once. That is a separate pass rather than
part of the import because an import only sees the rows in one CSV: importing
2024 after 2023 would otherwise hand the older loads the higher numbers.

Two rules make all of this safe to re-run:

- **An issued number is never reissued.** Anything already matching the
  sequence format is left alone, by the import and the backfill alike. The
  number is on rate confirmations, BOLs and invoices that have left the
  building.
- `orderNumber` and `previousOrderNumber` are in the import's `PRESERVE` list,
  so a refresh cannot overwrite them.

Whatever an order was called before is kept in `previousOrderNumber` — a BATS
id, or one of the old random `TTL-2026-4821` numbers, which have no other home.

#### Which number a load is shown under

Having a sequence number is not the same as leading with it. **A BATS-era load
still goes by its BATS id** — on its header, in every list, and on the BOL,
invoice and rate confirmation that go out under it. The company worked those
loads under that number for years: it is what a carrier has in their file, what
a client puts on a remittance, and what a broker types into a search. A load
booked in TTMS leads with its sequence number.

`orderDisplayNumber()` in `src/types/order.ts` is that rule, and every screen
and document goes through it rather than reading `orderNumber` directly.
`orderAltNumber()` gives the load's other number, shown underneath — never
instead. The documents search matches on either, because staff search by both.

So two conventions run side by side, permanently. That is a split along a line
that already exists — the old system and this one — and it settles itself as
BATS-era loads close out.

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

## Firestore Indexes

### Required — the paginated list screens do not work without these

These live in **`firestore.indexes.json`** and are created by
**`node scripts/deploy-indexes.js`** (`--dry-run` first, `--list` to check
state). Like the rules, editing that file changes nothing until the script is
run — and unlike a missing rule, a missing index is not a slow query but a
failed one.

Every one of these implicitly ends in `__name__`. That is not decoration: the
cursor in `listVisibleOrdersPage` orders by `createdAt` **and** `__name__` so
that two orders sharing a timestamp — which a BATS import produces by the
hundred, because the export gives a whole day the same time — cannot straddle a
page boundary and be served twice or skipped.

| Collection | Fields to index (composite) | Use case |
|------------|------------------------------|----------|
| carriers | `isActive` ASC + `companyName` ASC | Browsing carriers with "show inactive" off |
| carriers | `isActive` ASC + `nameKey` ASC | Carrier name search with "show inactive" off |
| orders   | `carrierId` ASC + `createdAt` DESC | A carrier's loads; the driver prefill lookup |
| orders   | `clientId` ASC + `createdAt` DESC | A party's orders, as client |
| orders   | `consigneeId` ASC + `createdAt` DESC | A party's orders, as consignee |
| orders   | `parentOrderId` ASC + `bolStoragePath` ASC | Documents: bills of lading |
| orders   | `parentOrderId` ASC + `createdAt` DESC | The orders list; suborders; dashboard "booked today" and this month |
| orders   | `parentOrderId` ASC + `deliveredAt` DESC | Dashboard "delivered this month" |
| orders   | `parentOrderId` ASC + `driverLicenseStoragePath` ASC | Documents: driver licenses |
| orders   | `parentOrderId` ASC + `invoiceStoragePath` ASC | Documents: invoices |
| orders   | `parentOrderId` ASC + `podStoragePath` ASC | Documents: proofs of delivery |
| orders   | `parentOrderId` ASC + `status` ASC | Dashboard active / pending / unsigned / missing-document counts |
| orders   | `parentOrderId` ASC + `status` ASC + `assignedToUids` ARRAY | Book of business: one person's open loads, assigned to them |
| orders   | `parentOrderId` ASC + `status` ASC + `clientOwnerUids` ARRAY | Book of business: their open loads reached through a client they own |
| orders   | `parentOrderId` ASC + `status` ASC + `assignedToEmails` ARRAY | The same, for somebody set up who has never signed in |
| orders   | `parentOrderId` ASC + `status` ASC + `createdAt` DESC | The orders list with a status tab selected |
| orders   | `parentOrderId` ASC + `status` ASC + `deliveredAt` DESC | Dashboard "delivered today" |
| orders   | `parentOrderId` ASC + `status` ASC + `updatedAt` DESC | Dashboard "stale quotes" |
| orders   | `parentOrderId` ASC + `searchTerms` ARRAY + `createdAt` DESC | The Orders search box |
| orders   | `parentOrderId` ASC + `status` ASC + `searchTerms` ARRAY + `createdAt` DESC | Searching within a status tab |
| orders   | `shipperId` ASC + `createdAt` DESC | A party's orders, as shipper |

Anything not listed is single-field and automatic: the status-tab `count()`s,
carrier DOT/MC search, the carrier `count()`s, the analytics pickup-date range,
and the `array-contains` queries behind the broker visibility union — including
the ones behind `?owner=` on the Orders and Clients lists, which filter one
person's records in memory for exactly that reason.

The three book-of-business rows are the only ones on this list a *page* rather
than a list screen needs. Without them the two figures on a directory page fail
outright and the panel shows an error; everything else on that page still
renders.

### How the Orders search box works

Firestore has no substring search — no `LIKE '%morris%'` — so each order stores
`searchTerms`, an array of every prefix of every word in its number, party
names, lane and commodity (`orderSearchTerms` in `src/types/order.ts`, mirrored
in `scripts/backfill-order-search-terms.js`). A search is then one
`array-contains` lookup, which stays flat as the collection grows.

Consequences worth knowing:

- **Numbers match on any segment; words match on prefix.** TTL22001218 answers
  to "1218" and "2001" as well as "ttl22", because a carrier says "the load
  ending 1218" and a broker reads the last four off a rate confirmation. Names
  answer to prefixes only — "morr" finds Morris, "orris" does not — since a
  name is something people reliably start at the beginning of, and segmenting
  every commodity description would multiply the array for a case nobody types.
  Numbers are short, so segmenting them roughly doubles the stored fragments:
  about 62 per order to about 124, worst case 309.
- **Only the first typed word reaches the query.** `array-contains-any` is an
  OR, so "palm beach" through it would return everything matching *either* —
  wider than what was asked, not narrower. The remaining words are applied to
  the returned page, which means a page can come back shorter than its limit
  while more results exist. The Load more button stays until the cursor runs
  out.
- `searchTerms` is left out of the list projection and only fetched when a
  second word has to be checked against it, then stripped before the rows are
  sent. It is ~62 fragments per order and nothing displays it.
- **Anything that writes an order must refresh it.** `createOrder` computes it
  directly; `updateOrder` posts to `/api/orders/{id}/search-terms`, which
  rereads the saved order because a patch is only part of one.

### How the party phone lookup works

A broker takes a call and types the number that rang in — the habit BATS built.
Firestore can only match a whole field value, so `4695769974` typed against a
`phone` saved as `+1 (469) 576-9974` matches nothing. Each party therefore
stores `phoneKeys`: both of its numbers reduced to their last ten digits by
`toPhoneKey()` in `src/types/party.ts`. The lookup is then one `array-contains`
query, which needs no composite index — Firestore indexes array fields for
`array-contains` on its own.

- **An array, not a field, because a party has two numbers.** `phone` and
  `phone2` both feed it, so either finds the record.
- **Ten digits, and never a prefix.** Ten is a US number without its country
  code, so the same person is found however the number was written down. A
  prefix search would turn the endpoint into a way to walk the customer list an
  area code at a time, which is exactly what the name endpoint refuses to be;
  seven digits is the floor and shorter input returns nothing.
- **Anything that writes a party's phone must refresh it.** `/api/parties`
  computes it on create; `updateParty` rebuilds it whenever `phone` or `phone2`
  is in the patch, reading back the half it was not given. A party saved
  without it exists but cannot be found by phone, and nothing fails loudly —
  the same contract as `nameKey` and `carrierNameKey`.
- **The query runs server-side, at `POST /api/parties/by-phone`.** The number
  may sit on a record the caller cannot see, and answering "not on file" for
  one of those is how a duplicate of a colleague's client gets made. The route
  returns the matches they may use and a count of the ones they may not, with
  the owner's name to go and ask — never the record or its id. Near misses are
  logged to `partyAccessProbes` with `via: 'phone'`, beside the name probes.
- Existing parties predate the field; `scripts/backfill-party-phone-keys.js`
  fills them in (`--dry-run` first).

**Adding an index is about adding a new *way of asking*, not a bigger
collection.** These sixteen serve the app at any size; a new filter or a new
sort column is what would need a seventeenth.

### Recommended — not currently required by any code path

| Collection | Fields to index (composite)                        | Use case                         |
|------------|----------------------------------------------------|----------------------------------|
| orders     | `carrierId` ASC + `status` ASC                     | Carrier load board               |
| orders     | `status` ASC + `pickupDate` ASC                    | Dispatch board                   |
| agreements | `orderId` ASC + `type` ASC                         | Agreement status per order       |
| carriers   | `insuranceExpiration` ASC                          | Expiry alert dashboard           |
| parties    | `assignedToUids` + `assignedToGroupIds` + `assignedToEmails` + `assignedToName` (all ASC, equality) | The "unowned" query in `listVisibleParties` |
| replies (collection id, any conversation) | `rootId` ASC + `createdAt` DESC | The replies under one message — see the chat section |

The order-visibility union in `listVisibleOrdersPage` — the path taken by
anyone who is not admin, dispatch or finance — is still single-field
`array-contains` / `array-contains-any` on `assignedToUids`,
`assignedToGroupIds`, `clientOwnerUids` and `clientOwnerGroupIds`. Those are
served by automatic indexes and need nothing composite, because that path
merges, sorts and pages **in memory** rather than in the query. It does so
deliberately: cursoring a four-way union would need an index per branch times
every filter, and a broker's own loads are a small enough set that it is not
worth it. See the comment on `listVisibleOrdersPage`.

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

**Roles.** `isAdmin`, `isDispatcher`, `isFinance`, `isHr`, `isSalesManager`,
`isIntern`. Broker is derived — it is what someone has when none of them is set
(`isBroker()` in `src/lib/accessControl.ts`) — and is deliberately never stored.

**A role is a bundle of permissions, not the unit of access.** The catalog is
`src/types/permission.ts`: each role expands to a set of named permissions,
anything granted to one person individually sits in
`allowedUsers/{email}.grantedPermissions`, and the union is computed by
`effectivePermissions()` and written to `users/{uid}.permissions`. **That array
is what `firestore.rules` reads** — the rules do no role maths of their own.
Permissions only ever add: what a role grants cannot be taken away by leaving
it out of the grant list.

| Field | Where | Meaning |
|---|---|---|
| `grantedPermissions` | `allowedUsers` | The extras this person was given individually. |
| `permissions` | `users` | The effective list: roles expanded, grants folded in. Rewritten on every sign-in and every change to the entry. |
| `managedUids` / `managedEmails` | `users` | For a Sales Manager, everyone on the teams they lead. Empty for everybody else. |

`isHr` grants **read-only access to this directory and nothing else**. An HR
user opens Settings, sees the people list including the payroll fields below,
and can export it; they cannot grant a role, edit an entry, suspend, remove or
import. They see no more clients or loads than a plain broker — their role
grants no `.viewAll` of anything. It also has no custom claim: nothing in the
rules reads one, and it is enforced against `users/{uid}` instead.

`isIntern` is the one role that is **less** than a broker: the directory, chat
and `/dashboard/intern`, and nothing else unless it is granted one permission at
a time. It has to be stored rather than derived because "no roles set" already
means broker. It is also the only role `storage.rules` knows about, through an
`intern` custom claim — driver's licences are readable by every other staff
account, and an intern cannot open the load a licence belongs to.

`isSalesManager` is the only role a team's setup affects. They are a broker plus
an admin's powers over the people on the team they lead in Settings → Teams:
those people's records, details and permissions. The scope is a query, and rules
cannot query, so `src/lib/teamScope.ts` resolves it into the `managedUids` /
`managedEmails` mirror above and the rules test that — the same pattern as
`groupIds` for work groups, and `clientOwnerUids` on an order. Anything that
moves somebody between teams, changes a lead, or grants the role has to call
`syncManagedScopes()`.

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
- Because of that, the rules cannot tell one staff account from another. Order paperwork — `bols/`, `invoices/`, `pods/` — is therefore **write-only** in `storage.rules` and read only through `GET /api/orders/{id}/document`, which applies `canSeeOrder()` with the Admin SDK and returns a signed URL good for two hours. `driver-licenses/` stays readable to any allowlisted account on purpose: a licence is checked at pickup and delivery by people who are not on the load.
- A `partyAccessRequests` approval takes one of two forms, `grantKind`. `once` (the default, and every request decided before the field existed) lends the record for a single order and then expires. `ownership` adds the requester to the party's owners via `changeOwners()` + `syncClientOwners()`, so they get every order it is the **client** on — admins and dispatchers only, and deliberately ignored by `approvedPartyIds()`/`findApproval()` so that removing them from the record actually removes their access.
- `orderAccessRequests` is the order-side twin of `partyAccessRequests`: same shape, same closed writes, same read rule. An approved one lends a read of one load for a period the approver picks — 24 hours through 30 days, or no expiry — applied in `/api/orders` only and invisible to `orderVisible()` in the rules. It can be revoked early from Approvals, and never makes the requester an owner. Expiry is enforced at read time via `isGrantLive()`, so a lapsed grant still stores `status: 'approved'`; nothing should read that field to decide access.
- Because licences are open to everyone, `GET /api/documents/licenses` lists them company-wide — the one listing that deliberately reaches past `canSeeOrder()`. Rows for loads the caller cannot see carry the order number, the licence and the owner's name, chat uid and US work number, and **no shipper, client, rate or dates**. It is the only route that redacts rather than filters, so widening its field list is a decision, not a tidy-up.

---

## Collections: `conversations`, `conversations/*/replies`, `chatReads` (staff chat)

Chat between employees. It sits outside the ownership model entirely: everyone
on the allowlist is staff, so everyone can talk to everyone. Nothing here is
gated on `assignedToUids`, work groups or roles.

`src/types/conversation.ts` is the current truth for these shapes.

### `conversations/{conversationId}`

| Field | Type | Notes |
|---|---|---|
| `kind` | `'company' \| 'direct' \| 'group' \| 'record'` | See below |
| `name` | string | Group rooms only; `''` for direct threads |
| `memberUids` | string[] | Empty on the company room — see below |
| `createdBy` | string | uid, or `'system'` for the company room |
| `createdAt` / `updatedAt` | Timestamp | `updatedAt` is bumped by each message and is what the list is ordered by |
| `lastMessage` | `{ text, senderUid, senderName, at } \| null` | Denormalized preview |
| `mentionedAt` | `{ [uid]: Timestamp }` | When each person was last named with an @ here |
| `reactionPings` | `{ [uid]: ReactionPing }` | The last reaction on each person's own messages here |
| `threadPings` | `{ [uid]: ThreadPing }` | The last thread reply aimed at each person — see Threads below |
| `pinned` | `{ [messageId]: PinnedMessage }` | Messages pinned to the top of the room, max 10 — see below |
| `recordType` / `recordId` / `recordLabel` | string | Record rooms only: which order the room is about, and what it is called |

Four shapes, one document type:

- **`company`** — the single room everyone is in, at the fixed document id
  `company`. Its `memberUids` is deliberately empty: listing every employee
  would have to be rewritten on every hire, and the rules grant this room on
  `kind` instead. It is created on demand by `GET /api/chat/conversations`,
  because there is no deployment step in this project that could run a
  migration.
- **`direct`** — two people, at the deterministic id `dm_<uidA>_<uidB>` with
  the uids sorted. Derived rather than random so two colleagues who open each
  other simultaneously land on one thread instead of two half-threads.
- **`group`** — a named room with an explicit membership. Any member may
  rename it, change who is in it, or leave.
- **`record`** — the room about one order, at the derived id
  `rec_order_<orderId>`. Nobody is invited to it: anyone who can see the order
  is entitled to be in it, and pressing **Discuss** on the order is what joins
  them. That check is the union of order visibility, which no client-side query
  can express, so `POST /api/chat/conversations` with `{ kind: 'record' }` is
  the only way in — it runs `readOrder()` before the caller's uid goes anywhere
  near `memberUids`. Never renamed: it is titled from the order's display
  number, so two people looking for the conversation about a load arrive at the
  same name. It can be left, and pressing Discuss again rejoins it.

`pinned` is a **map keyed by message id, never an array**, and that is what
makes it safe to write from the browser: an array has to be written whole, so
the rule allowing it would be allowing any member to replace every pin in the
room. Written at `pinned.<messageId>` instead, one key at a time, so two people
pinning at once cannot lose each other's work. Anybody in the room may pin or
unpin anybody's message. The cap of 10 is enforced in `MAX_PINNED` and again in
`firestore.rules` — **keep the two in step**. `at` inside a pin is plain millis,
because Firestore refuses a server timestamp inside a map value.

`lastMessage` is a preview line and nothing is decided from it. It exists so a
list of a dozen conversations does not cost a dozen extra queries per page
load, and so the unread badge has a timestamp to compare against.

### `conversations/{conversationId}/messages/{messageId}`

| Field | Type | Notes |
|---|---|---|
| `text` | string | Max 4000 chars, enforced in the UI and again in the rules |
| `senderUid` | string | Pinned to the caller by the rules |
| `senderName` | string | Copied at send time, so an old message keeps the name that was on it |
| `createdAt` | Timestamp | Pinned to `request.time` by the rules |
| `deletedAt` | Timestamp \| null | Set when the sender takes it back |
| `editedAt` | Timestamp \| null | Set when the sender corrects the wording |
| `mentions` | string[] | Uids named with an @ in this message |
| `replyTo` | `MessageQuote \| null` | The message this one answers, quoted above it |
| `attachments` | `Attachment[]` | Photos and files. A message may be nothing but these |
| `reactions` | `{ [key]: uid[] }` | Who reacted with what. Keys are ASCII — see REACTIONS |
| `system` | boolean | Written by TTMS, not by a person — see below |

**System messages** carry `senderUid: 'system'`, `senderName: 'TTMS'` and
`system: true`, and only the server can write one: the rules pin `senderUid` to
the caller on every client write, and no Firebase uid is ever the string
`system`. They are the alerts a load's own room posts — carrier signed, BOL
added, status moved — written by `postOrderAlert()` in `src/lib/chatAlerts.ts`
from the routes where each event actually happens. Alerts are only written into
a record room that already exists: a room is created by somebody pressing
Discuss, and posting into one nobody has opened would write a document per order
into a conversation no one can read. The client draws them as a centred line
rather than a bubble, with no menu, no reactions and no thread.

The one browser-driven exception is `/api/orders/{orderId}/announce`, for the
three events a browser carries out directly against Firestore — status, carrier,
POD. **It takes an event name, never message text**: the server re-reads the
order and writes what it finds. A route that posted caller-supplied text would
let any member of staff make TTMS say anything, in a room people trust precisely
because a person did not write it.

A message can be corrected or taken back by its sender, and by nobody else. An
edit always stamps `editedAt`, and the thread shows "(edited)" beside it — the
original objection was that a message somebody has acted on should not
*silently* become something else, and the mark is what removes the silently. A
message that has been taken back is emptied rather than deleted, so the thread
does not reshuffle around a hole, and it cannot then be edited back into
existence.

Attachments keep the **storage path**, never the download URL — a download URL
carries a token that can be regenerated, so a stored one goes stale. Paths are
`chat/{conversationId}/{uuid}-{name}` and are resolved at render time through
`lib/useStorageUrl.ts`, which caches per session.

**What protects an attachment, and what does not.** Storage rules cannot read
Firestore, so they cannot ask whether the fetcher is in the room. The bucket is
gated on the `ttlAccess` claim and nothing finer, so *any signed-in TTMS user who
knows a file's exact path can fetch it, private room or not*. Two things stand
between that and a leak: the path is only written on the message document, which
Firestore does gate on membership, and every path carries a random id so it
cannot be guessed or walked. The order paperwork used to sit on the
same footing and no longer does — it is served through an API route that checks
ownership first — but attachments were left alone deliberately: everyone on the
allowlist is staff, and staff can talk to staff, so the unguessable path is
doing real work here in a way it was not doing for a file named after an order
id. It is still weaker than the Firestore side. The fix, if it is ever wanted,
is the one the documents took: an API route that checks membership with the
Admin SDK and returns a short-lived signed URL, plus a `chat/` prefix in
`storage.rules` that no longer allows `read`. The 25 MB cap is enforced in
the browser only, for the same reason: tightening the blanket bucket rule would
touch every other upload in the app.

Reaction keys are plain ASCII (`up`, `done`, `question`, `eyes`, `thanks`,
`heart`) rather than emoji, because an emoji as a Firestore field name needs
quoting on every path it appears in. Writes use `arrayUnion`/`arrayRemove` on a
dotted path so that several people reacting at once do not overwrite each other.
The rules let **any member** update `reactions` on **anybody's** message — that
is the point of a reaction — and check only that nothing else moved. Rules cannot
walk a map of arrays, so they do not prove the caller only added their own uid;
among trusted staff the worst case is a name appearing under a thumbs-up they did
not leave, and the check that matters is that no message text can be touched
down that branch.

`replyTo` carries a **copy** of the quoted message rather than only its id.
Three reasons point the same way: a reply carried privately out of a room quotes
something the reader may have no permission to fetch; drawing twenty replies
would otherwise cost twenty extra reads; and the copy preserves what was
actually being answered. Where the original is still inside the loaded window of
the same conversation, the thread renders the live version instead — so deleting
a message does blank its quotes there. A quote that travelled into a direct
thread keeps its copy, because the original is in a room it has left.

`replyTo.fromConversationName` only appears on a private reply, and carrying it
across leaks nothing: a private reply can only be addressed to the person who
wrote the quoted message, and they were in that room by definition.

The rules do not validate `replyTo`. The message `create` rule does not restrict
extra fields, and the quote grants no access to anything — adding a check would
mean another production rules deploy for no security gain.

`mentionedAt` lives on the conversation rather than being read off the last
message, because a mention has to survive being talked over: someone asks you a
question, four more lines follow, and the @ mark must still be there when you
look. It is only ever bumped, never cleared — whether you have read past it is
decided by comparing it against your own read mark, exactly like ordinary
unread. The rules check it for type and nothing more: it drives a badge on the
reader's own screen, grants no access, and a stricter rule would be more
machinery to get wrong on a live database for no gain.

### `chatReads/{uid}`

| Field | Type | Notes |
|---|---|---|
| `lastReadAt` | `{ [conversationId]: millis }` | How far this person has read each room |
| `threadReadAt` | `{ [rootMessageId]: millis }` | The same per thread — see below |
| `notify` | `{ [conversationId]: 'all' \| 'mentions' \| 'none' }` | How loud each room is for this person. An absent key is `all` |
| `pinnedConversations` | string[] | Rooms this person keeps at the top of their list, in pin order |
| `pinnedThreads` | string[] | The same for rows in the threads list, keyed by root message id |

One document per user rather than a marker per conversation: the unread badge
needs every conversation's state at once, and a live listener on one document
costs a fraction of one per room. It is the only chat document a user writes
about themselves, and it says nothing about access — only which conversations
still show a dot.

Everything here is a fact about the *reader*, not about the room, which is why
per-room notification settings and both pin lists live here rather than on the
conversation: two people in the same room want different things from it, and the
busiest room in the company is the one nobody may leave. It also means none of
those three features needed a rules change — this document is already the one
thing a user may write about themselves. `mentions` still lets an @, a reply in
a thread they are in, and a reaction on something they said through; only `none`
is silent. Opening a room marks it read whatever it is set to, so unmuting one
months later does not present the whole intervening conversation as unread.

`threadReadAt` is keyed on the message a thread hangs under, not on the room,
and that separation is the point. Opening a room marks the room read; if that
also cleared the threads inside it, every answer written under a message you had
scrolled past would vanish the moment you glanced at the room — which is the one
thing a thread exists to hold on to. An absent key reads as "never opened", so
the first reply to your message is unread.

### Why chat reads live from the client, when orders do not

Orders go through `/api/orders` because "mine, my groups', my clients'" cannot
be written as one query the rules would approve. Chat has no such problem:
"conversations I am a member of" is a single `array-contains` query and the
rules check exactly that. Reads and message sends therefore go direct over
`onSnapshot` — a round trip per message would lose the live updates that are
the point of a chat.

Creating a conversation and changing who is in it still go through
`/api/chat/conversations`, like every other structural write in this codebase.
Those decide who can see what.

**One composite index is required, and only since threads.** The conversation
query uses `array-contains` alone and is sorted in memory, and messages order by
`createdAt` within one subcollection — both covered by automatic single-field
indexes. Reading a thread is the exception: `rootId` equality plus an order on
`createdAt` is two fields, so it needs `rootId ASC + createdAt DESC` on the
`replies` collection id. Until it exists, opening a thread shows a message
saying so, and the browser console carries a one-click link to create it.

### Threads

A reply lives in `conversations/{conversationId}/replies/{replyId}` — a
collection beside the messages, not under them, and not a `rootId` field on the
messages themselves. Three reasons, all pointing the same way:

- Every message written before threads existed has no such field, and a
  Firestore equality query skips documents missing the field entirely. Filtering
  the room by `rootId == null` would have hidden the entire history, on a live
  database, with no way to test it first.
- A forty-reply thread would otherwise eat the room's 200-message loading
  window.
- The unread count is a `count()` aggregation over `messages`. Replies landing
  in it would be counted as things said in the room.

Under the conversation rather than under the message so that one query can reach
every reply in a room — which is what will let search find something said inside
a thread.

A reply is the same shape as a message plus `rootId`, and can be edited, deleted
and reacted to in the same ways. It carries no `replyTo`: there is no thread
inside a thread.

The message a thread hangs under carries the counters, written in the same batch
as the reply:

| Field | Type | Notes |
|---|---|---|
| `replyCount` | number | `increment(1)`, never decremented — a deleted reply leaves a tombstone the thread still shows |
| `lastReplyAt` | Timestamp | What "unread thread" is measured against |
| `replyUids` | string[] | Everyone who has replied; draws the faces, and tells the next reply who to notify |

The rules let **anyone in the conversation** move those three and nothing else.
The point of a thread is that other people answer your message, so a counter only
the sender could write is a counter that never moves. `text` is outside that
`hasOnly`, which is the check that matters.

**A thread reply deliberately touches neither `updatedAt` nor `lastMessage`.**
It does not move the room up anybody's list, does not rewrite the preview line,
and does not mark the room unread. Instead it writes `threadPings.{uid}` on the
conversation for the people the reply is *for*: whoever wrote the message,
whoever has already replied, and anyone named with an @ in the reply itself
(`threadFollowers` in `src/types/conversation.ts`). Everyone else in the room
learns about it only from the reply count under the message, which is exactly the
bargain a thread makes.

`threadPings` mirrors `reactionPings`: one slot per person, overwritten, driving
an interruption at the moment it lands rather than a list to be read back. It is
needed for the same reason — nobody holds a listener on the replies of a thread
they do not have open, so without a mark on the conversation the only person who
could learn of an answer is the one already reading it.
