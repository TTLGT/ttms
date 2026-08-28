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

Roles: `isAdmin`, `isDispatcher`, `isFinance`, `isHr`. **Broker is derived,
never stored** — `isBroker()` returns true when none of the four is set. Do not
add an `isBroker` field; the file explains why (a stored flag would permit an
account that is neither a broker nor anything else, a state the rules don't
enforce).

`isHr` is read-only access to the people directory and nothing else. It is
deliberately **not** in `canSeeAllParties()` and deliberately has **no custom
claim**. The payroll fields it exists to expose (`legalName`, `dateOfBirth`,
`personalEmail`, `startDate`) must never be mirrored onto `users/{uid}`, which
every signed-in user can read — check `MIRRORED_FIELDS` in `src/lib/userImport.ts`
and the `patch`/`privatePatch` split in `/api/admin/users` before adding a field.

`sites` and `teams` are reference data that grant nothing — a team records who
someone reports to. `workGroups` is the access boundary. Nothing in the rules
reads `teamId`; don't make it.

### Duplicated logic that must stay in sync

These exist in two places by necessity — security rules cannot import TypeScript.
Changing one without the other creates a silent security hole:

| `src/lib/accessControl.ts` | `firestore.rules` |
|---|---|
| `BOOTSTRAP_ADMIN_EMAILS` | `isBootstrapAdmin()` |
| `canSeeAllParties()` | `canSeeAllParties()` |
| `canSeeDirectory()` | `isHr()` + the `allowedUsers` read rule |
| `canSeeParty()` | `partyVisible()` |
| `canSeeOrder()` | `orderVisible()` |
| `canEditSource()` | `canEditSource()` |

The owner matcher is duplicated three ways for the same reason — plain node
scripts cannot import TypeScript either:

| `src/lib/ownerResolution.ts` | mirrored in |
|---|---|
| `resolveOwner()` + `loadOwnerDirectory()` | `scripts/import-bats.js`, `scripts/resolve-party-owners.js` |

| `src/types/leadSource.ts` | mirrored in |
|---|---|
| `toSourceKey()` + `leadSourceDocId()` | `scripts/import-bats.js` |

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
node scripts/deploy-rules.js --dry-run
node scripts/deploy-rules.js
node scripts/rollback-rules.js --list
node scripts/rollback-rules.js --to <rulesetId>
```

If you edit a rules file, say plainly in your summary that it is not live until
that script is run.

Storage rules cannot read Firestore, so they gate on the `ttlAccess` custom
claim set at sign-in — which is why revoked access lags in Storage for up to an
hour. That's expected, not a bug to fix.

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
- `NEXT_PUBLIC_APP_URL` is still `http://localhost:3000`. Every e-sign link emailed to a carrier is built from it, so links currently point at localhost. Fixing this properly requires a real deployment.
- No deployment exists: no `vercel.json`, no `.github/workflows/`, no Hosting block in `firebase.json`.
- Firestore composite indexes are listed in `docs/schema-guide.md`. A missing-index error links to a one-click creator in the Console.

## Git

Commit straight to `main` and push. **No feature branches, no PRs** — this is a
solo repo and the code is reviewed in the editor, so a branch only adds a merge
step. (This replaced an earlier "branch off main, PR back into it" rule.)

Do not commit or push unless asked. Never commit `.env.local` or the
service-account JSON.
