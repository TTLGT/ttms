# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

**TTMS** — an internal freight-brokerage transport management system for Total
Transport Logistics. Brokers create freight orders, assign carriers, send
agreements for e-signature, collect BOL/invoice, and close loads out.

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind 3 ·
Firebase (Firestore, Storage, Auth) · Resend for email · `@react-pdf/renderer`
for documents. Firebase project `ttms-59aa5`.

Human-facing docs: [`docs/handover-guide.md`](docs/handover-guide.md) (setup and
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
outstanding task; see the Deployment section of the handover guide.

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

Roles: `isAdmin`, `isDispatcher`, `isFinance`. **Broker is derived, never
stored** — `isBroker()` returns true when none of the three is set. Do not add
an `isBroker` field; the file explains why (a stored flag would permit an
account that is neither a broker nor anything else, a state the rules don't
enforce).

### Duplicated logic that must stay in sync

These exist in two places by necessity — security rules cannot import TypeScript.
Changing one without the other creates a silent security hole:

| `src/lib/accessControl.ts` | `firestore.rules` |
|---|---|
| `BOOTSTRAP_ADMIN_EMAILS` | `isBootstrapAdmin()` |
| `canSeeAllParties()` | `canSeeAllParties()` |

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
- `NEXT_PUBLIC_APP_URL` is still `http://localhost:3000`. Every e-sign link emailed to a carrier is built from it, so links currently point at localhost. Fixing this properly requires a real deployment.
- No deployment exists: no `vercel.json`, no `.github/workflows/`, no Hosting block in `firebase.json`.
- Firestore composite indexes are listed in `docs/schema-guide.md`. A missing-index error links to a one-click creator in the Console.

## Git

Branch off `main`, PR back into it. Do not commit or push unless asked.
Never commit `.env.local` or the service-account JSON.
