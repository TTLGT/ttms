# Putting TTMS on the internet

**Goal:** TTMS answers at **`https://ttms.totaltransportlogistics.us`**, so
anyone on the team can open it from any computer or phone, instead of only on
the one machine it was started on.

**Written for someone who has never deployed anything.** Do the parts in order.
Where a step says "you should see", check that you see it before moving on.

> ### What this does not change
>
> **Being able to open TTMS still grants nothing.** Anyone on the internet will
> be able to reach the sign-in page and press "Sign in with Google" — that is
> true of every website. They will get *no further*. Access is granted one email
> address at a time in **Settings → Team Access**, and an account that is not on
> that list is signed straight back out. Putting TTMS on a web address does not
> open the company's data to the public.
>
> It also does **not** create a practice copy. The deployed site and your laptop
> will read and write the *same live company records*.

---

## Before you start

You need three things. Get them first — each one is a dead stop.

1. **The IT Google account**, `it@totaltransportlogistics.us`. GitHub, Firebase
   and Vercel are all reached by signing in with Google as that account. There
   is no separate password for each.
2. **The Namecheap login** for `totaltransportlogistics.us`. This is the one
   thing that is *not* on the Google account. If nobody knows who has it, stop
   and find out — Part C cannot be done without it, and no amount of work in
   Parts A or B will put the site on the address.
3. **A payment card**, and permission to spend about **$20 a month**. See the
   cost warning in Part A.

You will also need the contents of `.env.local` from the machine TTMS currently
runs on. Have that file open. **Never paste it into a chat, an email, or a
document.** It is typed into one place only: the Vercel settings screen.

---

## Part A — Put the app on Vercel

Vercel is a hosting company. You point it at the code on GitHub, and it builds
the site and serves it to the world. It is the normal choice for this kind of
app, and an account already exists.

> ### This costs about $20 a month, and the free plan is not allowed
>
> **Budget $20/month. Not $20 per member of staff.**
>
> Vercel charges **per Vercel seat** — people who log in to *Vercel* to manage
> deployments. That is one account, `it@`. Brokers, dispatchers and finance
> staff never sign in to Vercel; they just open
> `ttms.totaltransportlogistics.us`. Adding staff to TTMS costs nothing.
>
> **The free "Hobby" plan is not an option, even though we do not sell TTMS.**
> Vercel defines commercial use as any deployment "used for the purpose of
> financial gain of *anyone* involved in *any part of the production* of the
> project, including a paid employee or consultant writing the code." A company
> running its freight on a tool its paid staff built and use is commercial under
> that definition. The examples Vercel lists — payment processing, adverts,
> affiliate links — are "including but not limited to", so not matching them
> does not get you out of it.
>
> Do not try Hobby to save the money. Getting caught means TTMS goes down, and
> it would go down on a working day.
>
> The Pro plan's included usage (1 TB of transfer, 1 million function calls a
> month) is far beyond what a few dozen internal users produce, so surprise
> overage bills are not a realistic worry. Set a spend limit anyway:
> **Settings → Billing → Spend Management**.

### A1 — Sign in

1. Go to **`vercel.com`** and click **Log In**.
2. Choose **Continue with Google** and sign in as `it@totaltransportlogistics.us`.
3. If it offers to create a team, name it **Total Transport Logistics** and
   choose the **Pro** plan. Enter the card.

### A2 — Connect the code

1. Click **Add New... → Project**.
2. Vercel asks to connect GitHub. Allow it, signing in with Google as `it@`
   again. Grant it access to the **`TTLGT`** organisation.
3. In the list of repositories, find **`ttms`** and click **Import**.
4. Vercel should detect **Next.js** on its own. Do not change Build Command,
   Output Directory or Install Command — the defaults are correct.
5. **Do not press Deploy yet.** Do A3 first. One of the settings below cannot be
   fixed afterwards without deploying a second time.

### A3 — Type in the settings

Still on the import screen, open **Environment Variables**. You are copying
lines out of `.env.local` into this screen, one at a time — the name on the
left, the value on the right.

Add every one of these:

```
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID
FIREBASE_ADMIN_PROJECT_ID
FIREBASE_ADMIN_CLIENT_EMAIL
FIREBASE_ADMIN_PRIVATE_KEY
RESEND_API_KEY
RESEND_FROM_EMAIL
```

Then add this one, which is **not** in `.env.local` and must be typed by hand,
exactly as written here:

| Name | Value |
|---|---|
| `NEXT_PUBLIC_APP_URL` | `https://ttms.totaltransportlogistics.us` |

No slash on the end. No `www.`. `https`, not `http`.

Two of these have a catch:

- **`FIREBASE_ADMIN_PRIVATE_KEY`** is very long and contains `\n` sequences.
  Copy it out of `.env.local` **including its surrounding quotes**, exactly, in
  one go. If TTMS later fails with a message about a private key or a PEM file,
  this is what went wrong.
- **`GOOGLE_MAPS_API_KEY`** — leave it out entirely, unless someone has decided
  to pay per lookup for exact mileage. Without it TTMS uses its free built-in
  estimate, which is the intended default.

> **Why the order matters.** Anything whose name starts `NEXT_PUBLIC_` is
> stamped into the site when it is *built*, not read while it runs. If you add
> or change `NEXT_PUBLIC_APP_URL` after deploying, the site keeps the old value
> until you deploy again. So set it now — and after any later change to it, go
> to **Deployments → the "..." menu → Redeploy**.

### A4 — Set the Node version

Once the project exists, go to **Settings → General → Node.js Version** and
choose **22.x**.

### A5 — Deploy

Press **Deploy**. It takes a few minutes.

**You should see** a "Congratulations" screen with a temporary address like
`ttms-xxxx.vercel.app`. Open it. You should get the TTMS sign-in page.

**Signing in will fail at this point, and that is expected.** Part B fixes it.

If the build failed instead, open the log and read the last few red lines. The
usual cause is a mistyped or missing variable from A3.

---

## Part B — Let Google sign-in work on the new address

Firebase refuses to sign anyone in on an address it has not been told about.
That is a safety feature, and it is why A5 ends with a broken sign-in.

1. Go to **`console.firebase.google.com`**, sign in with Google as `it@`, and
   open the project **`ttms-59aa5`**.
2. Left menu → **Authentication** → the **Settings** tab → **Authorized domains**.
3. Click **Add domain** and add:

   ```
   ttms.totaltransportlogistics.us
   ```

4. Click **Add domain** again and add the temporary Vercel address too — the
   `something.vercel.app` one from A5. That gives you a working way in while DNS
   is still spreading in Part C, and a useful fallback later if the domain is
   ever misconfigured.

**You should see** both addresses listed alongside `localhost`.

Now reload the `.vercel.app` address and sign in with your own company Google
account. **You should get into TTMS.** If you are signed straight back out, that
is the allowlist, not the deployment — your address needs adding in
**Settings → Team Access** by an admin.

---

## Part C — Point the address at it

This is the part that needs Namecheap, and the part people are right to be
careful about. Read the warning, then it is two form fields.

> ### Do not touch any existing record
>
> The same DNS zone runs two things the company depends on:
>
> - the **public website** at `totaltransportlogistics.us`, which is on Wix
> - **company email**, which is on Google Workspace — the `MX` records
>
> You are **adding one new record**, for the `ttms` name only. Adding it cannot
> affect either of the above. **Deleting or editing an existing record can take
> down the website or stop all company email.** If any screen offers to replace
> your existing records, say no and stop.

### C1 — Tell Vercel the address

1. In Vercel, open the `ttms` project → **Settings → Domains**.
2. Type `ttms.totaltransportlogistics.us` and click **Add**.
3. Vercel shows you a record to create and says the domain is not configured
   yet. **Leave this tab open** — you need the value it shows.

   It will be a **CNAME**, and the value is normally `cname.vercel-dns.com`.
   **Use whatever Vercel shows on screen**, not what is written here, in case
   they have changed it.

### C2 — Create the record in Namecheap

1. Go to **`namecheap.com`** and sign in.
2. **Domain List** → find `totaltransportlogistics.us` → **Manage**.
3. Open the **Advanced DNS** tab.
4. Click **Add New Record** and fill it in exactly:

   | Field | Value |
   |---|---|
   | Type | `CNAME Record` |
   | Host | `ttms` |
   | Value | the value Vercel showed you, e.g. `cname.vercel-dns.com` |
   | TTL | `Automatic` |

   **Host is `ttms`, not the whole address.** Namecheap adds
   `.totaltransportlogistics.us` for you. Typing the full address there creates
   `ttms.totaltransportlogistics.us.totaltransportlogistics.us`, which is the
   most common mistake at this step.

5. Click the green tick to save.

### C3 — Wait

Go back to the Vercel Domains tab and reload it every few minutes. It usually
turns to **Valid Configuration** within 10 to 30 minutes, though it can take a
few hours. There is nothing to do but wait — Vercel gets the HTTPS certificate
by itself.

**You should see** `https://ttms.totaltransportlogistics.us` open TTMS, with a
padlock in the address bar.

---

## Part D — Check it properly

Do all of these before telling anyone the address.

- [ ] `https://ttms.totaltransportlogistics.us` loads the sign-in page, with a padlock.
- [ ] `http://` (no s) redirects to `https://` on its own.
- [ ] You can **sign in** with your company Google account and reach the dashboard.
- [ ] The **public website** `totaltransportlogistics.us` still loads. Part C should not have touched it. Check anyway.
- [ ] **Company email still arrives.** Send yourself one from an outside address.
- [ ] Someone else, on a different computer and a different network, can sign in.
- [ ] Open an order, upload a document, and open it again. That proves file storage works from the new address.
- [ ] Send one agreement to **your own email address**, on a real but harmless order. Check that the signature link in it starts `https://ttms.totaltransportlogistics.us/sign/` — **not** `localhost`, and not the `.vercel.app` address.

That last one is the most important check on this page. A wrong link there means
every carrier and client gets a signature link that does not work.

---

## After it is live

**Every push to `main` now deploys.** The moment code is pushed to GitHub,
Vercel builds it and puts it live for the whole company. There is no separate
"publish" step and no confirmation. Treat `git push` as going live.

**Local development still writes to live data**, and now so does the deployed
site — the same records, reached from two places. Standing up a second Firebase
project for development is still the outstanding job it always was. It is now
more urgent, not less.

Worth doing soon:

- Turn on **two-factor authentication** on the `it@` Google account. It is now
  the key to a live system, not just to a code repository.
- In Vercel → **Settings → Deployment Protection**, consider protecting preview
  deployments so branch builds are not publicly reachable.
- Leave `NEXT_PUBLIC_APP_URL` as `http://localhost:3000` in `.env.local` on
  every staff machine. Only the deployment gets the real address.

---

## If something goes wrong

| What you see | What it means |
|---|---|
| Vercel build fails on a missing variable | One of the names in A3 is missing or misspelled. Names are case-sensitive. |
| An error mentioning a private key or PEM | `FIREBASE_ADMIN_PRIVATE_KEY` was pasted incompletely. Re-copy the whole value, quotes included. |
| Sign-in popup opens, closes, nothing happens | The address is not in Firebase → Authentication → Authorized domains. Part B. |
| "Your access to TTMS has been removed." | The deployment is fine. Your email is not on the allowlist. Settings → Team Access. |
| Domain stuck on "Invalid Configuration" for hours | The Namecheap **Host** field is probably the full address instead of just `ttms`. Check C2. |
| Every page says "Missing or insufficient permissions" | Not a deployment problem. The Firestore rules are not deployed: run `node scripts/check-rules.js`, then `node scripts/deploy-rules.js`. |
| Agreement emails contain a `localhost` link | `NEXT_PUBLIC_APP_URL` was added after the deploy. Redeploy from Deployments → "..." → Redeploy. |
