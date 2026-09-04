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
the real company's orders, carriers and clients. There is no seeded test data
and no staging copy.

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
rather than implying separate per-service credentials. Nothing is deployed on
the Vercel account yet.

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

**There is no `middleware.ts`.** The auth gate is client-side in
`src/app/dashboard/layout.tsx`. The comment in `src/app/page.tsx` referring to
middleware is stale. Server-side enforcement lives in the API route guards and
in Firestore/Storage rules — not in a middleware layer. Don't assume one exists.

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
| `managesRecord()` | `managesRecord()` |
| `ROLE_PERMISSIONS` (pre-permission access) | `legacyList()` — transitional, see below |
| `NON_DELEGABLE` in `/api/admin/users` | the same array in `settings/people/page.tsx` |
| `isConversationMember()` in `src/types/conversation.ts` | `inConversation()` |
| `MAX_PINNED` in `src/types/conversation.ts` | the count in the `pinned` branch of the conversation update rule |

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

| `src/types/party.ts` | mirrored in |
|---|---|
| `toPhoneKey()` + `partyPhoneKeys()` | `scripts/import-bats.js`, `scripts/backfill-party-phone-keys.js` |

| `src/types/order.ts` | mirrored in |
|---|---|
| `orderSearchTerms()` + `searchWords()` | `scripts/backfill-order-search-terms.js`, `scripts/import-bats.js` |
| `searchableValues()` | `SEARCHABLE_FIELDS` in `src/lib/orders.ts` |

`orderSearchTerms` is what the Orders search box looks up. **Anything that
writes an order must refresh it** — `createOrder` computes it inline,
`updateOrder` posts to `/api/orders/{id}/search-terms`. An order saved without
it exists but cannot be found by searching, and nothing fails loudly.

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

`orders` follow `quote → booked → carrier_assigned → carrier_signed →
shipper_signed → in_transit → delivered → completed`, with `cancelled` a
terminal side-exit deliberately absent from `STATUS_RANK`. `parentOrderId` set
means a suborder — its own carrier, dates and BOL.

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
- `NEXT_PUBLIC_APP_URL` is **not set** — it is absent from `.env.local` entirely, so both agreement routes fall back to the hardcoded `https://ttms.totaltransportlogistics.us`. Nothing resolves there yet, so every e-sign link emailed to a carrier currently points at a host that does not answer. The fallback and the DNS record must match exactly, character for character — a link built from the wrong one 404s on a legal signature page. Set the variable in the deployment once the subdomain is live rather than relying on the fallback.
  - Documents that **leave the company** — the BOL and invoice PDFs, and the two agreement email footers — deliberately show the public site `totaltransportlogistics.us`, not this subdomain. A carrier holding an invoice cannot sign in to a staff tool, so printing its address there is noise.
- No deployment exists: no `vercel.json`, no `.github/workflows/`, no Hosting block in `firebase.json`.
- Firestore composite indexes are listed in `docs/schema-guide.md`. A missing-index error links to a one-click creator in the Console.

## Git

Commit straight to `main` and push. **No feature branches, no PRs** — this is a
solo repo and the code is reviewed in the editor, so a branch only adds a merge
step. (This replaced an earlier "branch off main, PR back into it" rule.)

Do not commit or push unless asked. Never commit `.env.local` or the
service-account JSON.
