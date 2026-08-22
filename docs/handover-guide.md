# TTMS — Handover Guide

This guide has **three parts**. Start with whichever describes you.

| | |
|---|---|
| **[Part 1 — Running TTMS](#part-1--running-ttms)** | You need to keep TTMS working day to day, and you are **not technical**. Every step says exactly what to click and what you should see. Start here if you are unsure. |
| **[Part 2 — Technical reference](#part-2--technical-reference)** | You write code. Architecture, invariants, scripts, and the open problems. |
| **[Part 3 — If you use Claude Code or another AI assistant](#part-3--working-on-ttms-with-claude-code)** | You want an AI assistant to help you maintain this. What's already set up, what to ask it, and the things it must not do. |

**A note on who takes this over.** This project does not need a full-time
developer to keep running — a non-technical person can do everything in Part 1
unaided. But it does need someone technical for the outstanding work in
[Deployment](#deployment--currently-unresolved), and for anything that
changes behaviour. If that person is you and you code with an AI assistant,
Part 3 is written for you and the repo is already set up for it.

---
---

# PART 1 — Running TTMS

**Written for someone who has never used a command line.** Follow the steps
exactly, in order. Where a step says "you should see", check that you see it
before moving on. If you don't, jump to [When something goes wrong](#8-when-something-goes-wrong).

> **Most of this Part is also inside TTMS itself.** Once you can sign in as an
> admin, everything below — accounts, starting and stopping, giving access,
> imports, troubleshooting — is on the **Handbook** page in the left-hand menu,
> visible to admins only. Use that day to day; use this document for the setup
> steps you need *before* you can sign in, and for Parts 2 and 3.

---

## 1. What TTMS is, and one thing you must understand

**TTMS** (Total Transportation Management System) is the company's own software
for running freight. Brokers create orders, assign carriers, send agreements
out to be signed, collect the paperwork, and close the load.

Before anything else, understand this:

> ### ⚠️ TTMS is not on the internet yet.
>
> Right now TTMS **only runs on one computer at a time — the one you start it
> on.** When you start it, only *you* can use it, in a browser on that same
> computer. Nobody else in the company can open it, and you cannot open it from
> your phone or from home.
>
> **But the data is real and shared.** The orders, carriers and clients you see
> are the live company records, stored with Google. Anything you change is
> changed for good, immediately. There is no practice mode and no undo.
>
> Getting TTMS onto a real web address so the whole team can use it is the
> biggest outstanding job on this project. See
> [Part 2, Deployment](#deployment--currently-unresolved).

---

## 2. Words you will see

You do not need to understand how these work. You just need to recognise them.

| Word | What it means for you |
|---|---|
| **Terminal** (also *PowerShell*, *Command Prompt*) | A window where you type commands instead of clicking. Usually black or dark blue. Text scrolling past it is normal, not an error. |
| **Node.js** | The engine that runs TTMS. Install it once and never think about it again. |
| **npm** | Comes with Node.js. It fetches the supporting files TTMS needs. |
| **Git** | The tool that copies the TTMS code onto your computer and fetches updates later. |
| **GitHub** | The website where the code is kept. The company account is called `TTLGT`. |
| **Firebase** | Google's service where all TTMS data and files actually live. Run by Google, not by us. |
| **Repository** (or *repo*) | The folder of TTMS code. On your computer it is the folder called `ttms`. |
| **Localhost** | Means "this computer". `localhost:3000` is TTMS running on your own machine. |

---

## 3. Accounts, and how you sign in to each

**Almost everything is reached with one login: the IT Google account,
`it@totaltransportlogistics.us`.** That is deliberate — it is a role account, so
access survives any individual leaving the company. Get into that account first
and most of the rest opens up.

| What | How you sign in | What it is for |
|---|---|---|
| **GitHub** (org `TTLGT`) | **Sign in with Google**, using `it@totaltransportlogistics.us` | Where the TTMS code lives |
| **Firebase Console** (`ttms-59aa5`) | Google — `it@totaltransportlogistics.us` | The database, uploaded files, sign-in, and security rules |
| **Vercel** | Google — `it@totaltransportlogistics.us` | Website hosting. The account exists, but **TTMS is not deployed on it yet** — see [Deployment](#deployment--currently-unresolved). |
| **TTMS itself** | Google — your own company address | The app. Being in the allowlist is what grants access, not the Google login itself. |
| **Resend** | Ask whoever currently runs TTMS | Sends the agreement emails |
| **Claude Code** | ⚠️ **No company account exists** — see below | Optional AI assistant for code work |

> ### ⚠️ The Claude account is personal, and it leaves with Erwin
>
> All the Claude Code work on this project was done on **Erwin Solorzano's own
> personal, paid Claude account**. **Total Transport Logistics does not have a
> paid Claude account.**
>
> That subscription is personal property. It is not part of the handover and it
> will go when he does. If the next person wants to use the AI-assisted
> workflow in [Part 3](#part-3--working-on-ttms-with-claude-code), **TTL needs
> to buy its own Claude plan first.**
>
> Nothing in TTMS depends on this. The system runs, and every task in Part 1
> works, with no Claude account at all. It only affects whether the next person
> gets that particular tool.

---

## 4. First-time setup

**Do this once per computer.** Set aside about 30 minutes. You will need an
administrator password for the computer at a couple of points.

### Step 1 — Install Node.js (about 5 minutes)

1. Open your web browser and go to **`nodejs.org`**
2. Click the big green button labelled **Download Node.js (LTS)**.
   *LTS* means the stable version. If you are offered a "Current" version too, **do not pick it.**
3. Open the file that downloads. It is in your **Downloads** folder and is named something like `node-v22.11.0-x64.msi`.
4. A setup window opens. Click **Next**, tick **I accept the terms in the License Agreement**, then click **Next** on every screen after that, then **Install**, then **Finish**.
   **Do not change any of the options.** The defaults are correct.
5. **Restart your computer.** This matters — Windows will not find Node.js until you do.

### Step 2 — Install Git (about 5 minutes)

1. Go to **`git-scm.com/download/win`**
2. The download usually starts on its own. If it doesn't, click **64-bit Git for Windows Setup**.
3. Open the downloaded file. There are around ten screens. **Click Next on every one** — every default is correct — then **Install**, then **Finish**.

### Step 3 — Copy the TTMS code onto your computer (about 5 minutes)

**You get into GitHub with the IT Google account.** There is no separate GitHub
username and password to hunt for — on the GitHub sign-in page choose
**Continue with Google** and use `it@totaltransportlogistics.us`. That account
is a member of the company organisation, `TTLGT`, which is what lets you
download the code.

If that account cannot get in, stop here and sort it out before continuing —
nothing below will work without it.

1. Open **File Explorer** (the yellow folder icon on your taskbar).
2. Click **Desktop** in the list down the left-hand side.
3. **Right-click on an empty part of the window** — not on a file — and choose **Open in Terminal**.
   *On Windows 10:* hold **Shift** while right-clicking, then choose **Open PowerShell window here**.
4. A dark window opens. Type this exactly, then press **Enter**:

   ```
   git clone https://github.com/TTLGT/ttms.git
   ```

   You can copy that line from this guide and **right-click inside the dark window to paste** — Ctrl+V often does not work there.
5. A GitHub sign-in window may pop up. Choose **Continue with Google** and sign
   in as `it@totaltransportlogistics.us` — there is no separate GitHub password.
6. Wait. Text will scroll past. When your cursor comes back and stops moving, it's done.
7. **You should see:** a new folder called **`ttms`** on your Desktop.
8. Close the dark window.

### Step 4 — Put the settings file in place (about 2 minutes)

TTMS needs a small file of passwords called **`.env.local`**. It is deliberately
not included with the code, because it must never be posted online.

1. Ask whoever currently runs TTMS for this file.
   **Ask them to hand it over on a USB stick, in person, or through a password manager — not by email, not by WhatsApp, not by Slack.** It is the key to all company data.
2. Put it inside the **`ttms`** folder on your Desktop — the same folder that contains a file called `package.json`.
3. The name must be exactly **`.env.local`** — starting with a dot, with nothing after `local`.

> **Watch out for a Windows trap.** Windows hides file endings by default, so a
> file that looks like `.env.local` may really be `.env.local.txt`, and TTMS
> will not find it. To check: in File Explorer click **View** → **Show** →
> tick **File name extensions**. Now you can see the real name. If it ends in
> `.txt`, rename it and delete the `.txt`.

### Step 5 — Start it for the first time (about 5 minutes)

1. Open the **`ttms`** folder on your Desktop, then open the **`scripts`** folder inside it.
2. Double-click **`start-ttms.bat`**.
3. Windows may show a blue box saying *"Windows protected your PC"*. Click **More info**, then **Run anyway**. This appears because the file came from the internet; it is our own file and it is safe.
4. A dark window opens and begins downloading supporting files. **The first time this takes 2–5 minutes.** A lot of text scrolls past. Yellow lines beginning `warn` are normal and can be ignored.
5. When it finishes, **your browser opens by itself** at the TTMS login page.
6. Sign in with your company Google account.

> **If it says you don't have access:** signing in with Google is not enough on
> its own. Somebody with Admin rights must add your email address in TTMS first —
> see [6. Giving someone access](#6-giving-someone-access).

### Step 6 — Make a shortcut so you never have to hunt for it again

1. Right-click **`start-ttms.bat`**.
2. Choose **Show more options** → **Send to** → **Desktop (create shortcut)**.
3. On your Desktop, right-click the new shortcut, choose **Rename**, and call it **Start TTMS**.

---

## 5. Using TTMS every day

### Starting it

1. Double-click **Start TTMS** on your Desktop.
2. A dark window opens. Wait about 10 seconds.
3. Your browser opens at TTMS. Sign in if asked.

That's it. There is nothing to type.

### Stopping it

Click on the dark window and hold **Ctrl** and press **C**. Or simply close the
dark window. Either is fine.

### Three rules while you are using it

1. **Leave the dark window open.** It *is* TTMS. Close it and TTMS stops working
   in your browser — you'll see "This site can't be reached".
2. **Minimise it, don't close it.** Push it down to the taskbar and forget about it.
3. **After restarting your computer, start it again.** It does not come back on
   its own.

### Getting the latest version after a developer makes changes

1. Open the **`ttms`** folder on your Desktop.
2. Right-click an empty part of the window → **Open in Terminal**.
3. Type `git pull` and press **Enter**. Wait for it to finish.
4. Type `npm install` and press **Enter**. Wait for it to finish.
5. Close the window and start TTMS normally.

---

## 6. Giving someone access

**All of this happens inside TTMS in your browser. No typing commands.**
You must be signed in as an **Admin** to see the Settings page.

> Signing in with Google grants nothing on its own. A person can only get in
> once their email address has been added here. This is deliberate.

1. In the left-hand menu click **Settings**.
2. Find the panel headed **Grant Access**.
3. Type or paste their email addresses into the big box, **one per line**. You can add several people at once.
   - Addresses must end in **`@totaltransportlogistics.us`**. Anything else is skipped, and a yellow warning appears naming it — usually that means a typo.
4. Pick their **Site** from the dropdown, if your company uses sites.
5. Pick their **Roles**:

   | Role | What they can do |
   |---|---|
   | **Broker** | The default. Their own clients and loads, and nothing they don't own. |
   | **Admin** | Sees every record, and can manage who has access. |
   | **Dispatcher** | Can send carrier and shipper agreements. |
   | **Finance** | Can generate BOLs and invoices. |

   Everyone is a Broker unless you give them something else. Clicking **Broker** takes the other roles away.
   The roles you pick apply to **everyone in the batch**.
6. Click **Add Person** (or **Add N People**).
7. **You should see:** a small list confirming *"Added 3 of 3"*, with a green tick next to each address.

The new person appears in the **People With Access** list below, marked
**Pending first sign-in** (amber) until they actually log in, then **Active** (green).

### Changing what someone can do

In **People With Access**, click a role chip on their row to switch it on or
off. Click **Broker** to strip the other roles away. Changes take effect the
next time they load a page.

### Suspending versus removing

| | What it does | Use it when |
|---|---|---|
| **Suspend** | Blocks them from signing in but keeps their roles. Reversible. | Someone is on leave, or you need to stop access while you check something. |
| **Remove** (trash icon) | Deletes their entry completely. | Someone has left the company. |

> **One thing to know about removing someone.** They lose access to the records
> immediately. But a file they already had open — a PDF, a scanned document —
> may still download for **up to one hour** afterwards. That is normal and
> expected. If it matters urgently, tell them to sign out, or wait the hour.

### Exporting the list

The **Download** icon above the list saves everyone as a CSV file that opens in
Excel — useful for HR or an audit.

---

## 7. Importing data from BATS

The old BATS CRM data can be pulled in through the browser. **No commands needed.**

1. Export the data from BATS as CSV files. You should end up with files named
   like `carriers-export-....csv`, `customers-export-....csv` and
   `orders-export-....csv`.
2. In TTMS, go to **Settings** and scroll to **BATS Data Import**.
3. There are three drop boxes — **Carriers**, **Customers** and **Orders**.
   Drag each file into its matching box. You can drop **several** order files at once.
4. Click **Run Import**.
5. **You should see:** a result line for each type, reading something like
   *"Carriers — 12 written · 480 unchanged · 492 total"*.

> **Re-importing is safe.** TTMS remembers each row and skips anything that
> hasn't changed, so running a fresh export next week only writes what is
> genuinely new. You will not create duplicates.

Also on the Settings page: **Sites** (your company locations) and **Work
Groups** (teams that share client records). Both are simple add-and-name lists.

---

## 8. When something goes wrong

Work down this table. The **Call for help** column tells you when to stop and
escalate rather than experiment — because the data is live.

| What you see | What it means | What to do |
|---|---|---|
| **"This site can't be reached"** in the browser | TTMS isn't running. | Double-click **Start TTMS** and wait 10 seconds. |
| The dark window flashed up and vanished | It hit a problem and closed too fast to read. | Open the `scripts` folder, right-click `start-ttms.bat`, **Open in Terminal**. Now the message stays on screen. |
| **"Node.js is not installed"** | Setup Step 1 didn't finish, or you skipped the restart. | Redo [Step 1](#step-1--install-nodejs-about-5-minutes), including restarting the computer. |
| **"the settings file is missing"** | `.env.local` isn't there, or is misnamed. | Redo [Step 4](#step-4--put-the-settings-file-in-place-about-2-minutes). Check the `.txt` trap. |
| **"port 3000 is in use"** / **EADDRINUSE** | TTMS is already running in another window. | Look on your taskbar for another dark window and use that one. |
| **You sign in and are instantly signed back out** | Your email isn't on the access list. | Ask an Admin to add you under [Grant Access](#6-giving-someone-access). |
| **"Missing or insufficient permissions"** | A technical settings change hasn't been published to Google. | **Call for help.** A developer must run the rules deploy — [Part 2, section 07](#security-rules--the-trap-that-already-cost-five-weeks). |
| **Nobody in the company can sign in** | Something has gone wrong with the access list. | **Call for help immediately.** The recovery account is `it@totaltransportlogistics.us` — do not remove or change it. |
| **Agreement emails aren't arriving** | The email service key has expired, or the sending domain lost verification. | Check the junk folder first. Then **call for help** — see [Part 2, Troubleshooting](#troubleshooting). |
| **A signing link sent to a carrier points at "localhost"** | Expected until TTMS is properly deployed. | The carrier cannot use that link. **Call for help** — this needs [Deployment](#deployment--currently-unresolved) resolved. |
| Red text mentioning a **"missing index"** | A search needs a database setting Google has to create. | **Call for help.** It's a two-minute fix for a developer. |

---

## 9. Things you must never do

- **Never post the `.env.local` file anywhere** — not email, not chat, not a shared drive. It is the password to all company data.
- **Never delete or demote `it@totaltransportlogistics.us`** in Settings. It is the emergency way back in if the access list breaks. The system will refuse, and it is right to.
- **Never delete the `ttms` folder** while trying to fix something.
- **Never run any command from Part 2** unless a developer has told you to and is watching. Several of them write directly to live company data.
- **Never assume you are on a test copy.** You are not. There isn't one.

---
---

# PART 2 — Technical reference

**For whoever maintains the code.** Normal developer knowledge assumed.

Companion doc: [`schema-guide.md`](./schema-guide.md) — the Firestore data model.

| | |
|---|---|
| Repo | `https://github.com/TTLGT/ttms.git` (branch `main`) |
| Framework | Next.js 16 (App Router, Turbopack) + React 19 + TypeScript |
| Styling | Tailwind CSS 3 |
| Database | Cloud Firestore |
| File storage | Firebase Storage |
| Auth | Firebase Auth — Google sign-in only |
| Email | Resend (`noreply@totaltransportlogistics.us`) |
| PDFs | `@react-pdf/renderer` (server-side) |
| Charts | Recharts · Icons: `lucide-react` |
| Firebase project | `ttms-59aa5` |

## Local development

```bash
git clone https://github.com/TTLGT/ttms.git
cd ttms
npm install
# create .env.local — see below
npm run dev
```

| Command | What it does |
|---|---|
| `npm run dev` | Dev server, hot reload, port 3000. |
| `npm run build` | Production build. **Run before every push** — catches TS and build errors `dev` tolerates. |
| `npm start` | Serves the production build. |
| `npm run lint` | **Currently broken** — the script still calls `next lint`, removed in Next.js 16, and there is no `eslint.config.js` for ESLint 9's flat config. Nothing lints today. |

There is **no test suite**. `npm run build` is the only automated safety net.

`scripts/start-ttms.bat` is a double-click launcher for non-technical users — it
checks for Node, checks for `.env.local`, runs `npm install` if `node_modules`
is absent, opens the browser after 8s, then runs `npm run dev`.

## Environment variables

All in `.env.local`, gitignored, never committed.

```
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=

FIREBASE_ADMIN_PROJECT_ID=
FIREBASE_ADMIN_CLIENT_EMAIL=
FIREBASE_ADMIN_PRIVATE_KEY=

RESEND_API_KEY=
RESEND_FROM_EMAIL=noreply@totaltransportlogistics.us

NEXT_PUBLIC_APP_URL=http://localhost:3000
```

- *Client values*: Firebase Console → Project Settings → General → Your apps.
- *Admin values*: Project Settings → Service Accounts → **Generate new private key**; take `client_email` and `private_key` from the JSON.
- `FIREBASE_ADMIN_PRIVATE_KEY` keeps its `\n` escapes and is quoted; `src/lib/firebase-admin.ts` converts them back.
- *Resend*: resend.com → API Keys. The sending domain must stay verified.

> ⚠️ `NEXT_PUBLIC_APP_URL` is still `http://localhost:3000`. Every e-sign link
> emailed to a carrier or shipper is built from it.

> ⚠️ A service-account JSON (`ttms-59aa5-firebase-adminsdk-*.json`) sits in the
> project root. Correctly gitignored, but it is a live credential on disk.
> Rotate it in the Firebase Console if ever exposed.

## Code layout

```
src/
├─ app/                          Next.js App Router
│  ├─ (auth)/login/              Sign-in page
│  ├─ dashboard/                 The authenticated app
│  │  ├─ layout.tsx              Sidebar, nav, auth gate
│  │  ├─ orders/ carriers/ parties/ approvals/ documents/
│  │  ├─ clients|shippers|consignees/   Party views by role
│  │  ├─ analytics/              Admin only
│  │  └─ settings/               Access, sites, groups, BATS import (admin only)
│  ├─ sign/[token]/              PUBLIC e-signature page — no auth
│  └─ api/                       Server routes
├─ components/                   Reusable UI, grouped by feature
├─ context/AuthContext.tsx       Sign-in state + session establishment
├─ lib/                          Business logic and data access
└─ types/                        One file per domain object
```

`@/` aliases `src/`.

| File | Why it matters |
|---|---|
| `lib/accessControl.ts` | **Single source of truth for who may sign in.** Bootstrap admins, normalization, party visibility. |
| `lib/firebase-admin.ts` | Server-side Firebase; the `requireCompanyUser` / `requireAdmin` / `requirePermission` guards. |
| `lib/firebase.ts` | Browser-side Firebase init. |
| `context/AuthContext.tsx` | Establishes the session; signs people out if not allowed. |
| `lib/parties.ts` | Party model — ownership, access requests. |
| `lib/batsImport.ts` | CSV import from the legacy BATS CRM. |
| `lib/bol-pdf.tsx`, `lib/invoice-pdf.tsx` | PDF generation. |
| `lib/alerts.ts` | At-risk-load warnings on the dashboard. |
| `firestore.rules`, `storage.rules` | Server-enforced security. Editing is not enough — see below. |

## Access control

Signing in with Google grants nothing. An admin must create an
`allowedUsers/{email}` document via **Settings → Grant Access**.

On every sign-in: `AuthContext` posts the ID token to `POST /api/auth/session`,
which verifies it, requires an `allowedUsers` entry, provisions `users/{uid}`
with that entry's roles, and mirrors them into custom claims. Any failure and
`AuthContext` signs the user straight back out — there is no signed-in state
without a verified entry.

- `allowedUsers/{email}` — the allowlist, keyed by lowercased email. Source of truth for roles. `uid: null` means a pending invite.
- `users/{uid}` — live profile for someone who has signed in. Provisioned server-side.

Neither is client-writable; all changes go through the Admin SDK, so nobody can
self-promote.

**Roles:** `isAdmin`, `isDispatcher`, `isFinance`. *Broker* is the default and is
derived, not stored — deliberately, so there is no account that is neither a
broker nor anything else.

**🔑 Lockout escape hatch.** `BOOTSTRAP_ADMIN_EMAILS` in
`src/lib/accessControl.ts` is always allowed and always admin, even against an
empty allowlist: `it@`, `operations@` and `dispatch@totaltransportlogistics.us`.
These cannot be removed or demoted through the UI. **Confirm you can sign in as
`it@totaltransportlogistics.us` before changing anything here.** The same list
is duplicated in `firestore.rules` as `isBootstrapAdmin()` — change one, change
both, then deploy.

**Revocation** deletes both documents, clears claims, revokes refresh tokens and
disables the Auth account. Firestore cuts off immediately; Storage gates on the
custom claim, so it lags up to one hour.

## API routes

All under `src/app/api/`. Each guards itself with a helper from
`firebase-admin.ts` — do the same in anything you add.

| Route | Purpose | Guard |
|---|---|---|
| `POST /api/auth/session` | Verify sign-in, provision profile, set claims | Token only |
| `/api/admin/users` | Manage the allowlist | `requireAdmin` |
| `/api/admin/import-bats` | Run the BATS import | `requireAdmin` |
| `/api/orders/[id]/bol` | BOL PDF | authenticated |
| `/api/orders/[id]/invoice` | Invoice PDF | authenticated |
| `/api/orders/[id]/send-agreement` | Email the carrier agreement | authenticated |
| `/api/orders/[id]/send-shipper-agreement` | Email the shipper agreement | authenticated |
| `/api/orders/[id]/party-approvals` | Record party authorization | authenticated |
| `/api/parties`, `/api/parties/resolve` | Party CRUD, dedup lookup | authenticated |
| `/api/parties/access-requests[/id]` | Request/approve party access | authenticated |
| `/api/sites[/id]`, `/api/work-groups[/id]` | Settings reference data | authenticated |
| **`POST /api/sign/[token]`** | **PUBLIC.** External signer submits a signature | One-time token |

**The e-sign flow** is the one genuinely public surface. `/sign/{token}` takes no
login; the route validates `signing_tokens/{token}` and rejects it if missing,
already used, or past `expiresAt`. On success it records the signer's name, IP,
user agent and timestamp — the legal audit trail. Don't loosen those checks.

## Security rules — the trap that already cost five weeks

`firestore.rules` and `storage.rules` live in the repo, but **committing a change
to them does nothing.** Rules take effect only once uploaded as a ruleset with a
release pointed at it. Skipping that is how the repo rules sat undeployed for
five weeks while users saw *"Missing or insufficient permissions."*

```bash
node scripts/deploy-rules.js --dry-run     # show what would change
node scripts/deploy-rules.js               # upload and release both
node scripts/deploy-rules.js --only firestore
node scripts/deploy-rules.js --only storage
```

Uses the admin service account over the Firebase Rules REST API — no
`firebase login`, no CLI install.

**Rollback** if a deploy locks people out:

```bash
node scripts/rollback-rules.js --list
node scripts/rollback-rules.js --to <rulesetId> [--only firestore|storage]
```

Rulesets are immutable and never deleted, so rollback is just repointing the
release — far faster than editing rules under pressure.

> **Limitation:** the service account can *update* an existing release but not
> *create* one. Both already exist, so day-to-day changes work. A new bucket or
> database needs its first release published from the Console by an Owner.

Storage rules cannot read Firestore, so they gate on the `ttlAccess` custom
claim stamped at sign-in — hence the revocation lag.

## Maintenance scripts

All plain Node, all read `.env.local` themselves, all writers support
`--dry-run`. **Always dry-run first — these write to live data.**

```bash
# BATS CRM import. CSV exports go in the project root.
# Re-running is safe: rows are hashed, unchanged ones skipped.
node scripts/import-bats.js
node scripts/import-bats.js --only orders

# One-time: seed the allowlist from everyone who already had access.
node scripts/seed-allowed-users.js --dry-run

# One-time backfill: old single-shipper orders -> the shared parties model.
node scripts/migrate-parties.js --dry-run

# On rep onboarding: turn BATS owner names into real account ownership.
node scripts/resolve-party-owners.js --dry-run
node scripts/resolve-party-owners.js --map "Nery Mendez=nery@ttl.us"
```

`migrate-parties.js` and `seed-allowed-users.js` are historical one-time
migrations. The BATS import also has a drag-and-drop UI at **Settings → BATS
Data Import**, which is what non-technical staff should use.

## Data model

Detail in [`schema-guide.md`](./schema-guide.md). In short:

**`parties`** is the central record — any company or individual you do business
with. The same party can be the *client* on one order, the *shipper* on
another, the *consignee* on a third: **the role lives on the order, not the
party.** Parties have owners (`assignedToUids`, `assignedToGroupIds`, or a
legacy `assignedToName` string from BATS). An owned party is private to its
owners; an unowned one is shared reference data; using someone else's requires
an approval recorded on the order.

**`orders`** is a freight load on the ladder
`quote → booked → carrier_assigned → carrier_signed → shipper_signed →
in_transit → delivered → completed`, with `cancelled` as a terminal side-exit.
An order with `parentOrderId` set is a **suborder** — its own carrier, dates and
BOL. **`carriers`** are trucking companies, insurance expiry driving a dashboard
alert. **`agreements`** and **`signing_tokens`** run the e-sign lifecycle.
Binary files live in Storage, referenced by a `storagePath` string.

> `schema-guide.md` still documents a top-level `shippers` collection, replaced
> by `parties` in commit `660d057`. `src/types/party.ts` and `order.ts` are the
> current truth.

## Day-to-day workflow

```bash
git checkout main && git pull
git checkout -b feat/short-description
# ...
npm run build          # must pass
npm run lint
git add -A && git commit -m "Describe the change"
git push -u origin feat/short-description
```

Then open a PR against `main`.

**Conventions worth matching:**

- Comments explain *why*, not *what*, and there are a lot of them on non-obvious decisions. Keep that up — it is the main reason this codebase is handoverable.
- Types in `src/types/`, one per domain object, with their helpers alongside.
- Data access in `src/lib/`, never inline in a page component.
- Every API route calls a guard from `firebase-admin.ts` first.
- Anything security-relevant duplicated across `accessControl.ts` and `firestore.rules` carries a "keep in sync" comment. Believe it.

Remote branches `feat/invite-only-access`, `feat/user-directory` and
`party-model-and-ownership` are merged into `main` and are history.

## Deployment — currently unresolved

**There is no deployment configured.** Confirmed: no `vercel.json` or
`.vercel/`, no `.github/workflows/`, no Hosting block in `firebase.json`, and
`NEXT_PUBLIC_APP_URL` still points at localhost.

Today this runs on someone's machine against the **live production Firebase
project**. Two things need doing:

1. **Deploy the app.** Vercel is the path of least resistance for Next.js 16,
   and **a Vercel account already exists — sign in with Google as
   `it@totaltransportlogistics.us`.** Nothing is deployed on it from this repo
   yet. Connect the repo, add every variable above as a project env var, and set
   `NEXT_PUBLIC_APP_URL` to the real domain. Firebase App Hosting also works.
   Then add the production domain under Firebase Console → Authentication →
   Settings → **Authorized domains**, or Google sign-in is rejected there.
2. **Separate dev from production.** Local development currently writes to live
   business data. Stand up a second Firebase project for development, or use the
   Emulator Suite, and point `.env.local` at it.

Until #2 is done, assume every local change is live.

## First-week checklist

- [ ] **Access to the `it@totaltransportlogistics.us` Google account.** This is the master key — GitHub, Firebase and Vercel all sign in through it. Get this first.
- [ ] GitHub org (`TTLGT`) reachable via **Continue with Google** as `it@`; repo cloned.
- [ ] Firebase Console access to `ttms-59aa5` (Google, `it@`) — ideally Owner, some rules operations need it.
- [ ] Vercel reachable (Google, `it@`). Nothing is deployed there yet.
- [ ] Resend account login — **owner unknown, ask before handover completes.**
- [ ] Confirmed sign-in to TTMS itself as `it@totaltransportlogistics.us` — the lockout recovery path.
- [ ] **If you want the Claude Code workflow: TTL has no paid Claude account.** The prior work used a personal one. Budget for a company plan or skip Part 3.
- [ ] `.env.local` built and `npm run dev` serving the dashboard.
- [ ] `npm run build` passes on a clean checkout.
- [ ] `node scripts/deploy-rules.js --dry-run` confirms deployed rules match the repo. If not, that's job one.
- [ ] Read `accessControl.ts` and `firebase-admin.ts` end to end — short, and they govern everything.
- [ ] Resend sending domain still verified.
- [ ] Production deployment and dev/prod split planned.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| *"Missing or insufficient permissions"* | Repo rules aren't deployed. `node scripts/deploy-rules.js`. |
| Signed in, immediately signed back out | No `allowedUsers` entry. Add via Settings → Grant Access, or use a bootstrap admin. |
| Everyone locked out | Sign in as `it@totaltransportlogistics.us`. If a rules deploy caused it, `rollback-rules.js --list` then `--to <rulesetId>`. |
| Signing links point at localhost | `NEXT_PUBLIC_APP_URL` wrong for that environment. |
| No email at all | `RESEND_API_KEY` missing, or sending domain lost verification. Resend init is deliberately lazy, so it fails at send time, not build time. |
| Revoked user still opens a Storage file | Expected, up to one hour — claim lives in the ID token until expiry. |
| Build fails on `@react-pdf/renderer` | It's in `serverExternalPackages` in `next.config.ts` for a reason. Don't remove it. |
| Firestore query errors on a missing index | See the composite index table in `schema-guide.md`; the error links to a one-click creator. |
| Port 3000 in use | Dev server already running. `npm run dev -- -p 3001`. |

---
---

# PART 3 — Working on TTMS with Claude Code

You do not have to be a developer to use this, but you do need to understand
what you are changing. An AI assistant will do exactly what you ask, including
things you did not mean.

## What is already set up for you

**[`CLAUDE.md`](../CLAUDE.md) in the project root.** Claude Code reads this
automatically every time it starts in this folder. It already knows:

- that `.env.local` points at **live production data**, and to dry-run every script
- that security rules do not take effect until `deploy-rules.js` is run
- that `BOOTSTRAP_ADMIN_EMAILS` and `canSeeAllParties()` are duplicated in `firestore.rules` and must stay in sync
- that every API route must guard itself, because there is no middleware backstop
- that `npm run build` is the only test that exists
- that the `sign/[token]` audit trail is a legal record and must not be weakened

**Keep that file current.** When you learn something non-obvious about this
project, add it there. It is the difference between an assistant that
understands the codebase and one that guesses.

## Getting started

> **⚠️ Before you start: there is no company Claude account.** Everything
> described in this Part was done on **Erwin Solorzano's personal, paid Claude
> account**, which is not part of the handover. TTL will need to buy its own
> plan before anyone can follow these steps. See
> [3. Accounts](#3-accounts-and-how-you-sign-in-to-each).

1. Install Claude Code — see `claude.com/claude-code` for the current installer.
2. Open a terminal **inside the `ttms` folder** (right-click the folder → **Open in Terminal**).
3. Run `claude`.
4. Ask it something small first, to check it has context: *"Read CLAUDE.md and tell me what you must not do in this repo."* If the answer mentions live production data, you are set up correctly.

## Good first requests

These match real outstanding work on this project:

- *"Rules are showing 'Missing or insufficient permissions'. Check whether the deployed Firestore rules match the repo, and walk me through fixing it."*
- *"Set this project up to deploy on Vercel. List every environment variable I'll need to add, and tell me what I have to do in the Firebase Console afterwards."*
- *"Create a second Firebase project for development so local work stops writing to live data. Tell me exactly what to click."*
- *"`docs/schema-guide.md` still documents the old `shippers` collection. Update it to match `src/types/party.ts` and `src/types/order.ts`."*
- *"Add a `Site` filter to the Orders list, matching how the filter on the Settings page works."*
- *"Explain what `src/lib/parties.ts` does, in plain English, as if I don't know the codebase."*

That last kind is worth using often. Asking for an explanation costs nothing
and changes nothing.

## The rules for AI-assisted work here

1. **Say "dry run first" whenever a script is involved.** Every writing script
   in `scripts/` supports `--dry-run`. Ask to see that output and read it
   before approving the real run.
2. **Never let it "add test data" or "reset the database".** There is no test
   database. It would hit live company records.
3. **Read the summary of what changed, not just the final message.** Ask
   *"what files did you change and why?"* if it isn't clear.
4. **Run `npm run build` before you accept any code change.** Ask the assistant
   to run it and show you the actual result. There is no test suite; this is
   the only check that exists.
5. **Never paste `.env.local` into a chat**, an issue, or a pull request.
   The assistant does not need it — it is already on disk where the app reads it.
6. **Changes to security rules are not live until deployed.** If it edited
   `firestore.rules` or `storage.rules`, ask directly: *"is this live yet?"*
   The answer should be no, until `deploy-rules.js` has run.
7. **Work on a branch, not on `main`.** `git checkout -b my-change` first. If
   something goes wrong you can throw the branch away.
8. **When it says something is done, ask how it was verified.** "The build
   passes" is an answer. "The code looks correct" is not.

## If you would rather not code at all

That is a legitimate choice, and most of the day-to-day does not require it.
Everything in [Part 1](#part-1--running-ttms) — access, imports, sites, work
groups — is done through the browser. What genuinely needs a technical person
is the deployment work in [Deployment](#deployment--currently-unresolved).
That is a one-off project, and a contractor could do it in a few days using
Part 2 and `CLAUDE.md` as the brief.
