# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

**TTMS** — an internal freight-brokerage transport management system for Total
Transport Logistics. Brokers create freight orders, assign carriers, send
agreements for e-signature, collect BOL/invoice, and close loads out.

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind 3 ·
Firebase (Firestore, Storage, Auth) · Resend for email · `@react-pdf/renderer`
for documents. Firebase project `ttms-59aa5`.

Human-facing docs: [`docs/admin-handbook.md`](docs/admin-handbook.md) (setup and
operations, written for non-technical staff too) and
[`docs/schema-guide.md`](docs/schema-guide.md) (data model).

## ⚠️ Read this before running anything

**There is no development environment.** `.env.local` points at the **live
production Firebase project**. `npm run dev` on this machine reads and writes
the real company's orders, carriers and clients. There is no staging copy.

What is in that project as of 2026-09-10 is a **small sample, not a full book**:
122 orders, 16 parties, 12 carriers, kept back when the BATS import was cleared
out. Two of those orders were entered by hand through the app and are the only
records carrying a carrier, a shipper and a consignee — the import linked none
of them — so they are the only ones that exercise the whole model. **Treat all
of it as production data anyway.** It is small and it is re-importable from
BATS, but it is still the live project the deployed site serves, and the
allowlist and settings alongside it are not re-creatable.

Consequences for you:

- **Never run a script in `scripts/` without `--dry-run` first.** Every writer supports it. Show the user the dry-run output and let them decide before applying.
- **Never write a throwaway script that mutates Firestore** to test something.
- Treat any operation touching `allowedUsers`, `users`, or Auth accounts as destructive — it can lock real people out of the system they work in.
- If asked to "add test data" or "reset the database", stop and confirm — that would hit production.

Standing up a dev Firebase project (or the Emulator Suite) is a known
outstanding task; see the Deployment section of the Admin Handbook.

## Commands

```bash
npm run dev      # dev server, port 3000
npm run build    # production build — THE gate before any push
npm run lint     # BROKEN: calls `next lint` (removed in Next 16); no eslint.config.js exists
npm start        # serve the production build
```

**There is no test suite, and `npm run lint` does not run.** `npm run build` is
the only automated check that exists. Run it before declaring any code change done, and report the real
result. Do not claim a change is verified on the strength of reading the diff.

`scripts/start-ttms.bat` is a double-click launcher for non-technical staff.
If you change startup requirements (new env var, new install step), update that
file's checks and its plain-language error messages too.

## Accounts

GitHub (org `TTLGT`), the Firebase Console (`ttms-59aa5`) and Vercel are all
reached by **signing in with Google as `it@totaltransportlogistics.us`** — a
role account, not a person. When giving setup or console instructions, say so
rather than implying separate per-service credentials.

**Vercel is set up and building.** Team `TTL IT's projects`, on the Pro plan,
with a project `ttms` connected to `TTLGT/ttms` that deploys on every push to
`main`. Do not create a second project. The site is live at
`https://ttms.totaltransportlogistics.us` — see the gotcha near the end of this
file.

**Firebase is on the Blaze pay-as-you-go plan** (moved 2026-09-10). It was on
Spark until then, and the swap is worth understanding rather than just noting,
because it changes what a read costs from "a step toward an outage" to "a
fraction of a cent".

Blaze keeps the same no-cost daily allowance — **50,000 document reads, 20,000
writes, 20,000 deletes** and 1 GiB stored — and bills only above it, at roughly
**$0.06 per 100,000 reads** (about half that if the database is single-region).
The difference is what happens at the cap: on Spark, requests started failing
with `resource-exhausted` until midnight Pacific, and nothing in this codebase
degrades gracefully when that happens — `/api/auth/session` needs a read to
check the allowlist, so the whole app locks everyone out rather than slowing
down. On Blaze it just carries on and costs pennies.

That is a real failure this project had, not a hypothetical: on 2026-09-09 five
views of the dashboard spent the day's 50,000 reads by mid-evening and nobody
could sign in. One card was reading the entire open-order book — about ten
thousand documents a mount — because roughly nine thousand imported BATS loads
were parked in `carrier_assigned` and still counted as open.

**Both halves of that are fixed.** The imported records were cleared down to a
small test sample on 2026-09-10 (`scripts/purge-records.js`, 28,739 documents
removed, leaving 122 orders / 16 parties / 12 carriers), and the dashboard card
went back to loading on its own because it now reads ~122 documents instead of
~10,000.

What to do about cost now:

- **Do not engineer around the read limit in code without asking.** It is a
  budget line, not a wall, and the app is nowhere near it — a working day of
  development runs in the low thousands of reads.
- **Do say plainly if the Usage tab shows reads climbing**, and name the query
  responsible. Reads scale with people-hours here, not page views: chat's
  `onSnapshot` listeners and `AuthContext`'s per-user listener are live for
  everyone signed in.
- **The thing actually worth watching is the number of open orders.** Several
  screens count or list them, and what made the dashboard safe again was the
  data shrinking, not the code changing. If open orders climb back into the
  thousands, those screens become expensive again.
- **The Firestore client cache is on disk** (2026-09-10). `src/lib/firebase.ts`
  calls `initializeFirestore` with `persistentLocalCache` and the *multi-tab*
  manager, not plain `getFirestore(app)`. The default was memory-only, so every
  full page reload re-read every watched document from the server — and
  `ChatProvider` sits in the dashboard layout, so its listeners start on every
  page, not just the chat one. Keep the multi-tab manager: with the single-tab
  default, persistence works in whichever tab claimed it first and fails in the
  rest, and people here keep chat open in one tab and work in another. It falls
  back to the memory cache when the browser refuses IndexedDB (a private
  window, site data blocked) and on the server, where client components are
  also rendered.
- **What that fixed, and what it did not.** It only helps documents the browser
  watches — the chat listeners and `AuthContext`'s own profile. It does nothing
  for the dashboard cards: those go through `/api/orders/summary` and the Admin
  SDK, server-side, where a browser cache cannot reach. The most expensive
  thing left on a dashboard load is the busiest-clients card, which reads one
  document per *open* order because "how many distinct clients" is not an
  aggregation Firestore offers — see `lib/orderSummary.ts`. That is another
  reason to watch the open-order count rather than the code.

**There is still no development environment** — see the warning at the top of
this file. The Emulator Suite is the outstanding task, and it matters more than
any of the above: essentially all usage of this project today is one person
building it, against live production data.

## Environment

Windows. The shell is PowerShell 5.1 by default — no `&&`, no ternary, no
`2>&1` on native executables. A Bash tool is also available and takes POSIX
syntax. Pick one per command and match its syntax.

All secrets live in `.env.local` (gitignored). Never print its values, never
write them into a file that is tracked, never include them in a commit,
artifact, or PR body. A service-account JSON also sits in the project root and
is gitignored — same rules.

## Architecture

```
src/app/          App Router. (auth)/login, dashboard/* (the app), sign/[token] (PUBLIC), api/*
src/components/   Reusable UI, grouped by feature
src/context/      AuthContext — session establishment
src/lib/          All business logic and data access
src/types/        One file per domain object, domain helpers alongside
```

`@/` aliases `src/`.

**Nothing is gated in a middleware layer.** The auth gate is client-side in
`src/app/dashboard/layout.tsx`. Server-side enforcement lives in the API route
guards and in Firestore/Storage rules. Don't assume a request has been checked
before it reaches a route.

There is no `middleware.ts` and no `proxy.ts` (Next 16's name for the same
file). There was one: it matched every request and returned `NextResponse.next()`
in every branch, so it enforced nothing while adding a hop to every page and API
request. It was deleted rather than fixed — the guards it would have duplicated
already live in the routes.

**If you add one back, it is a second gate, not the first.** The API guards and
the Firestore/Storage rules stay authoritative; a proxy cannot see the allowlist
without a Firestore read it is not able to make.

### Access control — the core invariant

Authenticating with Google grants **nothing**. An `allowedUsers/{email}`
document is the only thing that authorizes an account.

`AuthContext` → `POST /api/auth/session` → verify token → require
`allowedUsers` entry → provision `users/{uid}` → mirror roles into custom
claims. Any failure signs the user straight back out. Preserve that property:
**there must never be a signed-in state without a verified allowlist entry.**

- `allowedUsers/{email}` — the allowlist, keyed by lowercased email, source of truth for roles. `uid: null` = pending invite.
- `users/{uid}` — live profile, provisioned server-side.
- Neither is client-writable. All mutations go through the Admin SDK so nobody can self-promote.

### Ability is a permission, not a role

`src/types/permission.ts` is the catalog. A **role** is a bundle that expands
to a set of permissions; individually **granted** permissions
(`allowedUsers/{email}.grantedPermissions`) are added on top; the union is
computed by `effectivePermissions()` and mirrored onto
`users/{uid}.permissions`.

**That mirrored array is what `firestore.rules` reads.** The rules do no role
maths any more — they test one array — which is why the duplication table below
got shorter rather than longer. Everything else asks `can(profile, 'orders.bol')`:
the API guard (`requirePermission(req, 'orders.bol')`), the nav, the screens.

- Permissions are **additive**. There is no deny. A permission a role grants
  cannot be unticked; remove the role instead.
- **Renaming a key is a migration**, not a rename — the old string is in live
  `grantedPermissions` arrays and matched by the rules.
- Adding a key to `ROLE_PERMISSIONS` widens an existing role at everyone's next
  sign-in. Say so out loud.
- The list is rewritten on every sign-in and on every change to an entry.
  `POST /api/admin/users/sync` rebuilds it for everybody at once — needed only
  after editing documents by hand in the Console.

Roles: `isAdmin`, `isDispatcher`, `isFinance`, `isHr`, `isSalesManager`,
`isIntern`. **Broker is derived, never stored** — `isBroker()` returns true when
none of them is set. Do not add an `isBroker` field; the file explains why (a
stored flag would permit an account that is neither a broker nor anything else,
a state the rules don't enforce).

**Intern is the one role that is *less* than a broker** — the directory, chat
and `/dashboard/intern` (guide, onboarding survey, task list, all placeholders
for now). It has to be a stored role for exactly that reason: "no roles set"
already means broker, and a broker holds the whole baseline. It is also the one
role `storage.rules` knows about, via an `intern` custom claim, because
driver's licences are otherwise readable by every staff account.

**Sales Manager is the only role a team's setup affects.** They are a broker
plus admin-level power over the people on the team they lead in Settings →
Teams: their records, their details, and the permissions they hold. For anybody
else, leading a team still grants nothing.

That scope is a query — "everyone whose `teamId` is a team I lead" — and rules
cannot query, so `src/lib/teamScope.ts` computes it and mirrors it onto the
manager's own profile as `managedUids` / `managedEmails`, the same way
`groupIds` works for work groups. **Anything that can move a person between
teams, change a team's lead, or grant the role must call `syncManagedScopes()`**
— the invite, the details patch, the role toggle, the CSV import, all three team
routes and first sign-in do. It recomputes every manager rather than working out
which one changed; both collections are tiny and a missed trigger leaves a
manager quietly seeing a former report's loads.

Deliberate limits on a Sales Manager, enforced in `/api/admin/users`: they
cannot add or remove people, cannot change a role, cannot grant a permission
they do not hold themselves, and can never delegate `people.manage` or
`settings.manage`. They also cannot read `allowedUsers` from the client — a rule
cannot narrow a collection read to one team, so they go through
`GET /api/admin/users`, which returns their team and nobody else.

`isHr` is the people directory and nothing else. It grants
no `.viewAll` of anything and deliberately has **no custom claim**. The payroll fields it exists to expose (`legalName`, `dateOfBirth`,
`personalEmail`, `startDate`) must never be mirrored onto `users/{uid}`, which
every signed-in user can read — check `MIRRORED_FIELDS` in `src/lib/userImport.ts`
and the `patch`/`privatePatch` split in `/api/admin/users` before adding a field.

The one thing HR can write is `profile.decideUpdates`: approving a change
somebody asked for on **their own** record. That is why the role is no longer
strictly read-only, and the boundary that keeps it safe is the catalog, not the
role — `PROFILE_FIELDS` in `src/types/profileUpdateRequest.ts` is the whole of
what can be requested, `src/lib/profileFields.ts` is the only thing that applies
one, and neither can reach a role, a granted permission, a suspension or the
email address. **Do not add any of those to that catalog.**

**Everybody can see their own record** at `/dashboard/profile`, payroll fields
included, served by `GET /api/me` — a rule cannot narrow a collection read to
one document, so the narrowing is the verified email off the ID token and there
is no parameter for whose record it is. Everything on that page is a *request*;
nothing there writes `allowedUsers`. Approving does, through the Admin SDK.
See `profileUpdateRequests` in the Schema Guide.

`sites` are reference data that grant nothing. `teams` grant nothing **except**
to a Sales Manager, for whom the team they lead is their scope — see above.
Nothing in the rules reads `teamId` itself; the membership is resolved
server-side into the `managedUids` mirror and the rules read that. Don't gate
anything on `teamId` directly. `workGroups` remains the general access
boundary, and is the right tool for sharing a book of business between people
who are not one manager's reports.

### Duplicated logic that must stay in sync

These exist in two places by necessity — security rules cannot import TypeScript.
Changing one without the other creates a silent security hole:

| `src/lib/accessControl.ts` | `firestore.rules` |
|---|---|
| `BOOTSTRAP_ADMIN_EMAILS` | `isBootstrapAdmin()` |
| `can()` | `can()` — both read `users/{uid}.permissions` |
| `viewablePartyRoles()` / `canOpenParty()` | `viewableKinds()` / `canOpenParty()` |
| `viewAllPartyRoles()` | `wholesaleKinds()` / `canSeeAllPartiesOfKind()` |
| `canSeeDirectory()` | `canSeeDirectory()` + the `allowedUsers` read rule |
| `canSeeParty()` | `partyVisible()` |
| `canSeeOrder()` | `orderVisible()` |
| `canEditSource()` | `canEditSource()` |
| `clientSignatureSatisfied()` (the gate it feeds) | `signatureRecordUnchanged()` — the rules only refuse the fields; the gate itself is API-side |
| `managesRecord()` | `managesRecord()` |
| `ROLE_PERMISSIONS` (pre-permission access) | `legacyList()` — transitional, see below |
| `NON_DELEGABLE` in `/api/admin/users` | the same array in `settings/people/page.tsx` |
| `isConversationMember()` in `src/types/conversation.ts` | `inConversation()` |
| `MAX_PINNED` in `src/types/conversation.ts` | the count in the `pinned` branch of the conversation update rule |
| `roomAdminUids()` in `src/types/conversation.ts` | `roomAdmins()` — the `createdBy` fallback, written out |
| `isRoomAdmin()` in `src/types/conversation.ts` | `isRoomBoss()` — including the `kind == 'group'` test |
| `roomAllows()` + the `RoomPolicy` keys | `roomAllows()` — the keys and the `everyone` default, written out |
| `isMuted()` / `mutedUntil` | `notMuted()` |
| `containsLink()` in `src/types/conversation.ts` | the link pattern in `maySay()`, in RE2 |

The owner matcher is duplicated three ways for the same reason — plain node
scripts cannot import TypeScript either:

| `src/lib/ownerResolution.ts` | mirrored in |
|---|---|
| `resolveOwner()` + `loadOwnerDirectory()` | `scripts/import-bats.js`, `scripts/resolve-party-owners.js` |

| `src/types/leadSource.ts` | mirrored in |
|---|---|
| `toSourceKey()` + `leadSourceDocId()` | `scripts/import-bats.js` |

| `src/types/carrier.ts` | mirrored in |
|---|---|
| `carrierNameKey()` | `scripts/import-bats.js`, `scripts/backfill-carrier-name-keys.js` |

| `src/types/driver.ts` | mirrored in |
|---|---|
| `driverNameKey()` | `scripts/backfill-drivers.js` |

| `src/types/party.ts` | mirrored in |
|---|---|
| `phoneKeysFor()` + `partyPhoneKeys()` | `scripts/import-bats.js`, `scripts/backfill-party-phone-keys.js` |

| `src/lib/orderViews.ts` | mirrored in |
|---|---|
| the `unsigned` and `documents_missing` queries | `unsignedStat()` / `missingDocumentsStat()` in `src/lib/orderSummary.ts` |

| `src/types/order.ts` | mirrored in |
|---|---|
| `orderSearchTerms()` + `searchWords()` | `scripts/backfill-order-search-terms.js`, `scripts/import-bats.js` |
| `searchableValues()` | `SEARCHABLE_FIELDS` in `src/lib/orders.ts` |

`orderSearchTerms` is what the Orders search box looks up. **Anything that
writes an order must refresh it** — `createOrder` computes it inline,
`updateOrder` posts to `/api/orders/{id}/search-terms`. An order saved without
it exists but cannot be found by searching, and nothing fails loudly.

**A dashboard card and the list it opens are one definition.** Each card links
to `/dashboard/orders?view=<id>`, and `src/lib/orderViews.ts` holds the filter
behind that id: the summary counts through `viewQuery()` and the Orders screen
lists through the same catalog, so a number cannot disagree with the loads it
opens. The ids, labels and sort table live in `src/types/orderView.ts` because
the browser needs them and that module must not pull in the Admin SDK.

Two views are the exception in the table above. "Missing either signature" and
"missing either document" are ORs, which Firestore will not serve from one
index — the list runs two queries and merges them, while the card counts by
inclusion–exclusion. **Change one and change the other**, or the card's number
stops matching its own list.

A view is **bounded, not paged** — 200 rows. Sorting most of them in Firestore
would want a composite index per view, so `ORDER_VIEW_SORT_FIELDS` names only
the fields already carried by an index the counts use, and is `null` for the
four that could not have one for free. Those four come back in document order,
and the Orders screen says "200 of them" rather than "the most recent 200".
Adding a view means checking whether its query needs an index it does not have:
a missing one fails outright.

`carrierNameKey` is what the carriers list searches on. **Anything that writes a
carrier must write `nameKey` alongside `companyName`** — `createCarrier`,
`updateCarrier` and both BATS importers do. A carrier saved without one exists
but cannot be found by name, and one whose name changes without its key being
rewritten stays findable only under the name it used to have.

`phoneKeys` is what the party phone lookup searches on — the BATS habit of
typing the number that rang in. **Anything that writes a party's `phone` or
`phone2` must rewrite it** — `POST /api/parties` computes it, `updateParty`
rebuilds it from the pair. Same failure mode as the two above: findable only
under the number it used to have, with nothing failing loudly.
`scripts/backfill-party-phone-keys.js` fills in the imported records.

Both carry "keep in sync" comments. **After editing either, deploy the rules
(below) — otherwise only half the change is live.**

`BOOTSTRAP_ADMIN_EMAILS` is the lockout escape hatch: those accounts are always
allowed and always admin even against an empty allowlist. Never remove that
mechanism or make those accounts demotable.

### API routes

Every route in `src/app/api/` guards itself as its first act, using a helper
from `src/lib/firebase-admin.ts`: `requireCompanyUser`, `requireAdmin`, or
`requirePermission(req, ['dispatcher'])`. **Any new route must do the same.** A
route without a guard is a data leak — there is no middleware backstop.

The sole exception is `POST /api/sign/[token]`, which is deliberately public.
It validates a one-time `signing_tokens/{token}` document (rejecting missing,
already-used, or expired) and records the signer's name, IP, user agent and
timestamp. **That is a legal audit trail — do not weaken those checks or drop
those fields.**

### Security rules do not deploy themselves

Editing `firestore.rules` / `storage.rules` and committing changes **nothing**.
Rules only take effect once uploaded as a ruleset with a release pointed at it.
This repo's rules once sat undeployed for five weeks while users saw "Missing or
insufficient permissions".

```bash
node scripts/check-rules.js               # COMPILE them — see below
node scripts/deploy-rules.js --dry-run
node scripts/deploy-rules.js
node scripts/rollback-rules.js --list
node scripts/rollback-rules.js --to <rulesetId>
```

`--dry-run` reports what it *would* upload and does **not** compile, so a syntax
error passes it cleanly and only surfaces on a real deploy — with the broken
rules already live. `scripts/check-rules.js` compiles both files by creating a
ruleset nothing points at and deleting it again; it never touches a release.
Run it before every deploy.

`firestore.rules` reads `users/{uid}.permissions`, and a profile written before
permissions existed has no such field. `legacyList()` in the rules gives those
profiles exactly the access their role flags used to imply, so the deploy order
does not matter and nobody is locked out waiting to sign in again. Once
everyone has signed in once (or `POST /api/admin/users/sync` has run), that
function and the `legacyProfile()` branch can be deleted.

If you edit a rules file, say plainly in your summary that it is not live until
that script is run.

**Composite indexes work the same way.** They live in `firestore.indexes.json`
and are created by `scripts/deploy-indexes.js`. A missing index is worse than a
missing rule: the query does not run slowly, it fails outright, so a page that
needs one is broken until the index reports `READY`.

```bash
node scripts/deploy-indexes.js --dry-run   # what is missing
node scripts/deploy-indexes.js             # create them
node scripts/deploy-indexes.js --list      # what exists, and its build state
```

**The service account cannot create indexes.** It can read them, and it can
deploy rules, but `roles/firebase.sdkAdminServiceAgent` does not carry
`datastore.indexes.create`, so the script above fails with "The caller does not
have permission" until somebody grants it Cloud Datastore Index Admin. Until
then, deploy them as a human instead — same file, no IAM change:

```bash
npx -y firebase-tools login
npx -y firebase-tools deploy --only firestore:indexes --project ttms-59aa5
```

`firestore.indexes.json` must list **every** index the project has, including
ones this app does not query — the CLI offers to delete anything present in
Firestore but absent from the file. The chat `replies` index is in there for
exactly that reason; do not tidy it out.

Adding a filter or a sort to a list screen usually needs a new index. Add it to
`firestore.indexes.json` and to the table in the Schema Guide, and say in your
summary that it is not live until the script is run.

Storage rules cannot read Firestore, so they gate on the `ttlAccess` custom
claim set at sign-in — which is why revoked access lags in Storage for up to an
hour. That's expected, not a bug to fix.

The same limit means the rules cannot ask who owns an order, so **`bols/`,
`invoices/` and `pods/` are write-only in `storage.rules`** and read only
through `GET /api/orders/{id}/document`, which applies `canSeeOrder()` with the
Admin SDK and signs a two-hour URL. Adding `read` back to those prefixes
reopens the hole silently — nothing in the app would fail. `driver-licenses/`
is deliberately readable by any allowlisted account; `needsOrderAccess()` in
`src/types/orderDocument.ts` is where that split is decided.

Because licences are open to everyone, `GET /api/documents/licenses` lists them
across the whole company — **the one listing that deliberately reaches past
`canSeeOrder()`**. It redacts instead of filtering: a row for a load the caller
cannot see carries the order number, the licence and the owner's contact, and
no shipper, client, rate or dates. Its `SELECTED_FIELDS` is the guard; adding
to it is how the load leaks out beside the licence.

### Data model

`parties` is the central record. The same party can be the client on one order,
the shipper on another, the consignee on a third — **the role lives on the
order, not on the party.** Ownership (`assignedToUids` / `assignedToGroupIds` /
legacy `assignedToName`) determines visibility; unowned parties are shared
reference data.

`drivers` hang off a carrier — one record per carrier per person, gated by the
**carrier** permissions rather than ones of their own. **An order keeps its own
`driverName` and `driverPhone`**; `driverId` is only a link back, and is null
for a one-off driver and for every load predating the collection. Do not make
the order read its driver through the record: a BOL, an agreement and a signed
PDF are what was true on the day, and correcting a phone number must not
rewrite paperwork that has already left the building. `scripts/backfill-drivers.js`
seeds the collection from drivers already named on orders.

`orders` follow `quote → booked → carrier_assigned → shipper_signed →
carrier_signed → in_transit → delivered → completed`, with `cancelled` a
terminal side-exit deliberately absent from `STATUS_RANK`. `parentOrderId` set
means a suborder — its own carrier, dates and BOL.

**The client signs before the carrier does**, and `POST
/api/orders/{id}/send-agreement` refuses until they have: a rate confirmation
commits us to paying a carrier for freight nobody has yet agreed to pay us for.
The one way past is `POST /api/orders/{id}/waive-signature`, gated on
`orders.waiveSignature` — admin and dispatch by default. Ask
`clientSignatureSatisfied()` in `src/types/order.ts`; never read the fields.

`shipper_signed` is a misnomer kept deliberately. The document is the **client's**
load confirmation — it quotes `agreedRate`, which is what the client pays us —
and for years it was emailed to `shipperId`, putting our client's rate in a
facility's inbox. The recipient and the wording are fixed; the stored status
string, the token `type`, and `shipperSignedAt` / `shipperSignerName` /
`shipperSignerIp` are not, because live orders and live signing links carry
them. Renaming a stored status is a migration, not a rename.

A waiver is **not** a signature: `shipperSignedAt` stays null and the
confirmation can still be sent and signed afterwards. `signatureWaivedAt` is the
record, never cleared. `signatureWaived` is a boolean mirror that exists only
because Firestore cannot ask "null or absent" in one query and the dashboard's
unsigned count is an aggregation — it must be on every order, which is what
`scripts/backfill-signature-waived.js` is for.

**Orders are owned records, and closed by default.** Two independent routes in:
the order's own `assignedToUids` / `assignedToGroupIds`, and the owners of its
client, mirrored onto the order as `clientOwnerUids` / `clientOwnerGroupIds`.
That mirror exists because rules cannot query — a `get()` on the client party
per order would exceed the 20-document-access limit on any list — so
`syncClientOwners()` refreshes it whenever a client changes hands. An order
with **no** owner is visible only to admin/dispatch/finance; this is
deliberately stricter than a party, where unowned means shared reference data.

Reads go through `/api/orders`, never the client SDK: the union of "mine, my
groups', my clients'" cannot be expressed as one client-side query the rules
would approve. `listOrders()` / `getOrder()` in `src/lib/orders.ts` are the
single choke point every order-reading page uses.

**Chat is the largest deliberate exception to that.** The other is
`AuthContext`, which keeps an `onSnapshot` on the signed-in user's own
`users/{uid}` so a photo, name or permission changed by an admin lands without
a sign-out. Same argument, more narrowly: one document, addressed by the
caller's own uid, on a collection the rules already open to every signed-in
user — there is no query for a rule to fail to express. It is not a second
gate; `/api/auth/session` is still the only thing that verifies the allowlist
entry.

 `src/lib/chat.ts` reads
Firestore live from the browser over `onSnapshot`, and messages are written
straight from the client under the rules. That is safe here and is not safe for
orders because "conversations I am a member of" is a single `array-contains`
query the rules can check exactly, whereas the order union cannot be expressed
as one query at all. Creating a conversation and changing who is in it still go
through `/api/chat/conversations`. Chat crosses none of the ownership
boundaries: everyone on the allowlist is staff, and staff can talk to staff.
Nothing else in the app should copy the live-read pattern without the same
argument.

**A room can be governed, and half of that lives in the rules because it has
to.** A `group` room names its `adminUids` and carries a `policy` of six
switches (`post`, `membership`, `details`, `files`, `links`, `pins`), each
`everyone` or `admins`, plus `mutedUntil` — one deadline per silenced person.
**Every key is optional and absent means `everyone`**, which is what let this
ship onto live rooms with no backfill and no deploy order.

The split in where each switch is enforced is not arbitrary and must be kept:

- `post`, `files`, `links`, `pins` and every mute are enforced in
  `firestore.rules` (`maySay()`, `notMuted()`, `roomAllows()`), because
  messages are written from the browser. A check that lives only in the
  composer is a suggestion.
- `membership` and `details` are enforced in
  `PATCH /api/chat/conversations/{id}`, which is the only thing allowed to
  write `memberUids`, `adminUids`, `policy` or `mutedUntil` at all.

Two invariants the rules lean on, kept by that route rather than hoped for:
**`adminUids` never names a non-member**, so an empty list means "nobody left
who runs this" and opens the room to everybody in it; and **it is never empty
while the room has members** — the last admin cannot leave without naming a
successor (`DELETE` answers 409 with the candidates). A room from before this
existed has no `adminUids` at all and falls back to `createdBy`; the route
normalises it on the first save.

**A mute always has a deadline**, applied when it is read rather than by
anything scheduled — there is no scheduler here, and the worst failure this
could have is a mute that outlived its clock because a job did not fire. Same
shape and same reason as `isGrantLive()` on an order access grant. Never add a
mute with no expiry.

The **Everyone room** has no membership to name admins in, so `policy.post` on
it is gated by the `chat.announce` permission — admin and HR by default. It is
the only policy key that reaches that room, and the route reads nothing else
from the body for it.

A **room admin can take back somebody else's message**, and only take it back:
the rules let `text` go to empty and nowhere else down that branch, so it can
never become a way to rewrite what a colleague said. The tombstone records
`deletedByUid` / `deletedByName` and says "Removed by X", because an author who
sees a bare "Message deleted" assumes they did it themselves.

Changes to any of this write a `memberEvents` entry beside the membership ones
and post one line in the room — **except a mute, which is recorded but never
announced.** Saying "Vivian muted Tom until Friday" in front of eleven
colleagues is a larger and different act from stopping Tom writing for a day,
and not the one the admin chose.

**An approved access request lends visibility that the rules cannot see.**
`partyAccessRequests` and `orderAccessRequests` each grant a read that
`canSeeParty()` / `canSeeOrder()` know nothing about — the grant is applied in
the API layer only, because a rule cannot run the query it needs. That is sound
only while parties and orders are never read through the client SDK. Anything
that starts reading them in the browser bypasses both grants.

The two differ in what approval buys, and the difference is deliberate. A party
approval has two forms, chosen by the approver: `once` is spent on one order and
expires, keeping the audit trail one-to-one with the orders it authorized;
`ownership` instead adds the requester to the party's owners through
`changeOwners()` — writing an `ownerEvents` entry like any other change of
hands — and then runs `syncClientOwners()`, which is what carries the party's
orders with it. Only admins and dispatchers may grant that form, matching
`/api/parties/{id}/owners`. **An `ownership` request is excluded from
`approvedPartyIds()` and `findApproval()` on purpose**: it never expires, so
counting it as a loan would mean removing the person from the record took
nothing away.

An **order** approval runs on a clock the approver picks (`expiresAt`, or null
for no expiry) and is revocable early from the Approvals screen, because there
is nothing for it to be spent on. It is never ownership: the requester cannot
reassign the load and does not appear as an owner on it. Ownership of a *load*
is not requestable at all — only of the client, through the form above, which
then carries its orders.

**A lapsed order grant still reads `status: 'approved'`.** Expiry is applied
when the grant is read, not by a scheduled job — there is no scheduler here,
and a grant that outlived its clock because a cron did not fire is the worst
failure this could have. `isGrantLive()` in `src/types/orderAccessRequest.ts`
is the only correct test; anything that reads `status` directly to decide
access is a bug.

Ownership changes only through `/api/{orders,parties}/{id}/owners`, which is
**admin and dispatcher only** and writes an `ownerEvents` subcollection entry in
the same batch. Every owner a record has ever had is kept, including the
original BATS name as a `text` target that grants nothing. Ownership fields are
closed to client writes in the rules — before that, any broker could claim any
unowned client and lock everyone else out, untraceably.

Someone who exists on the allowlist but has never signed in can still be
assigned records and added to work groups: there is no uid yet, so the
assignment is held in `assignedToEmails` / `memberEmails` and converted by
`claimPendingAssignments()` at first sign-in. Those fields must be part of every
"is this unowned?" test — miss one and the record reads as public.

> `docs/schema-guide.md` still documents a top-level `shippers` collection.
> That was replaced by `parties` in commit `660d057`. `src/types/party.ts` and
> `src/types/order.ts` are the current truth. Prefer the types over that doc.

## Conventions

- **Comments explain why, not what.** This codebase is unusually well commented on non-obvious decisions, and that is the main reason it is handoverable. Match that density. When you make a non-obvious call, leave the reasoning.
- Data access belongs in `src/lib/`, never inline in a page component.
- **Every date shown on screen goes through `src/lib/dateFormat.ts`** — in a component, via `useDateFormatters()`. The format is a company-wide setting (`appSettings/general.dateFormat`, Settings → Operations → Date Format), so a page that formats its own dates silently ignores the setting. That is exactly what the old per-page `formatDate` copies did. The PDFs, the agreement emails and the public `sign/[token]` page deliberately stay on the spelled-out "March 4, 2020": they leave the company, and a slashed date is two different days depending on the reader.
- **Phone numbers are typed into `src/components/PhoneField.tsx`, and shown through `src/components/PhoneValue.tsx`.** The field carries the country beside the number (US, Mexico, Canada, Guatemala — `RECORD_PHONE_REGIONS` in `src/lib/phone.ts`, defaulting to US); the display dials it and offers a copy button. **The country is never guessed from the digits** — Mexican and US numbers are both ten digits and Canada shares the US country code, so the field a number was typed into is the only thing that says which country it is. A record with no region reads as US through `phoneRegionOf()`; do not read the raw field. Adding a country is an entry in `REGIONS`, a branch in the format switch, and a line in each table below it.
- **Dates are typed into `src/components/DateField.tsx`, never `<input type="date">`.** A native date input takes its format from the browser's language, which is neither the setting nor anything the app can read. `DateField` keeps the same `YYYY-MM-DD` in/out contract, so it drops straight in, and its calendar button still opens the native picker. `parseDateInput()` in `dateFormat.ts` resolves a typed `3/4/2020` using the company setting, and refuses it as ambiguous when the setting is the spelled-month one — same rule as the spreadsheet importer, for the same reason.
- Types in `src/types/`, one file per domain object, with domain helpers (`toNameKey`, `partyDisplayName`, `isUnowned`, `isBroker`) beside them.
- Tailwind only; brand colors are `brand-*` tokens in `tailwind.config.ts`. Rajdhani is the display face for TTMS branding, Inter for body.
- `lucide-react` for icons. No emoji in UI chrome.
- User-facing copy is plain and specific — see the Settings panel descriptions for the established voice.

## Known gotchas

- `@react-pdf/renderer` is in `serverExternalPackages` in `next.config.ts`. Removing it breaks the build.
- Resend is lazily initialized on purpose, so a missing `RESEND_API_KEY` fails at send time rather than crashing the build.
- Order lane distances have **two methods behind one admin setting** (`appSettings/general.laneDistanceMode`, Settings → Lane Distance): `estimate` (default) is free and offline — ZIP centroids in `src/lib/data/zipCentroids.json` plus a circuity factor, `src/lib/routeDistance.ts`, ~5% typical error and ~17% on mountain lanes; `routes` is the Google Routes API, exact but **billed per lookup**, `src/lib/routeDistanceGoogle.ts`, needs `GOOGLE_MAPS_API_KEY`. `off` hides distances entirely.
  - The mode is read server-side in `/api/route-distance` and **never taken from the request** — a client that could name its own method could run up a Routes bill.
  - The default is `estimate` on purpose: a default must never be the option that spends money.
  - Distances are looked up once and stored on the order (`laneMiles` + `laneMilesSource`). Don't add code that re-derives them on render — under `routes` that bills on every page view.
  - An estimate is labelled as one everywhere it appears. Keep it that way; it must never be billed per mile against.
- **The public address lives in `src/lib/appUrl.ts`, nowhere else.** `APP_URL` reads `NEXT_PUBLIC_APP_URL` and falls back to `PRODUCTION_APP_URL`; `signUrl(token)` builds every e-sign link. That constant and the DNS record must match exactly, character for character — a link built from the wrong one 404s on a legal signature page. Don't reintroduce an inline `process.env.NEXT_PUBLIC_APP_URL ?? '...'`; that duplication is what the module replaced.
  - `ttms.totaltransportlogistics.us` **resolves and serves the app** (checked 2026-09-09: CNAME to `c8d7304de8e54a70.vercel-dns-017.com`, valid certificate, `http` redirects to `https`). E-sign links built from `APP_URL` reach a real page now.
  - `NEXT_PUBLIC_APP_URL` is `http://localhost:3000` in `.env.local` and **should stay that way on every staff machine** — only the Vercel deployment carries the real address. A developer machine that sets the production host would mail carriers links to a site it cannot itself change.
  - `NEXT_PUBLIC_*` is inlined at **build** time, not read at run time. Setting it on the host after a deploy changes nothing until the next build — which is why the fallback is the production host rather than localhost.
  - Documents that **leave the company** — the BOL and invoice PDFs, and the two agreement email footers — deliberately show the public site `totaltransportlogistics.us`, not this subdomain. A carrier holding an invoice cannot sign in to a staff tool, so printing its address there is noise.
- **It is deployed on Vercel and live at `https://ttms.totaltransportlogistics.us`** (DNS added and verified 2026-09-09). A push to `main` builds and goes live for the whole company within minutes, so **a push to `main` is a production release**; say so before pushing. The repo side is done: security headers in `next.config.ts`, the address centralised in `src/lib/appUrl.ts`, [`docs/deployment.md`](docs/deployment.md) as the runbook.
  - **Firebase → Authentication → Settings → Authorized domains** holds both `ttms.totaltransportlogistics.us` and the fallback `ttms-iota.vercel.app` (confirmed 2026-09-09). Firebase refuses to sign anyone in on a host it has not been told about, and the failure is silent — the Google popup opens and closes with no error on the page — so that list is still the first thing to check if anyone reports it.
  - **`ttms` with two t's is the agreed spelling** (2026-09-08), and the record that exists at Namecheap is the two-t one; `tms.totaltransportlogistics.us` has no record and should not be given one. A Vercel project card was showing a one-t `tms.` variant; if that reappears it is the thing to change, not the code.
  - Deliberately absent: no `vercel.json` (Vercel's Next.js defaults are correct and each route declares its own `maxDuration`), no `.github/workflows/` (Vercel builds on push), no Hosting block in `firebase.json`.
- Firestore composite indexes are listed in `docs/schema-guide.md`. A missing-index error links to a one-click creator in the Console.

## Git

Commit straight to `main` and push. **No feature branches, no PRs** — this is a
solo repo and the code is reviewed in the editor, so a branch only adds a merge
step. (This replaced an earlier "branch off main, PR back into it" rule.)

Do not commit or push unless asked. Never commit `.env.local` or the
service-account JSON.
