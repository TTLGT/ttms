# TTMS — Admin Handbook

This handbook has **three parts**. Start with whichever describes you.

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
before moving on. If you don't, jump to [When something goes wrong](#9-when-something-goes-wrong).

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
| **Resend** | **Continue with GitHub** — which is itself Google, `it@totaltransportlogistics.us` | Sends the agreement emails. Account is owned by the `it@` role account. **Not yet usable — no verified domain, no API key.** See [Email sending](#email-sending--not-yet-provisioned). |
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

   You can copy that line from this handbook and **right-click inside the dark window to paste** — Ctrl+V often does not work there.
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
You must be signed in as an **Admin** to change anything on the Settings page.
Someone with the **HR** role can open it and read the list, but every button
described in this section is absent for them.

> Signing in with Google grants nothing on its own. A person can only get in
> once their email address has been added here. This is deliberate.

### How Settings is laid out

Settings is split across five tabs along the top, so you are never scrolling
through the whole system to reach one thing.

| Tab | What is on it |
|---|---|
| **Overview** | Every panel on one screen, each showing what it is currently set to. A map, not a page you change things on. |
| **People** | Add People · People With Access · Removed People |
| **Organization** | Sites · Teams · Work Groups |
| **Operations** | Date Format · Lane Distance · Lead Sources |
| **Data** | BATS Data Import |

Each tab is its own web address, so you can bookmark one or send someone a link
straight to it, and the browser's Back button works the way you expect.

**If you cannot remember which tab something is on, use the search box in the
top right.** Type what you are after — `miles`, `office`, or a person's name —
and it takes you there. Searching a person's name jumps to their row in the
directory.

HR sees only the People tab, with no tabs shown at all — there is nothing else
they are allowed to open.

1. In the left-hand menu click **Settings**, then open the **People** tab.
2. Find the panel headed **Add People**. It has two modes, in the top right:
   **Type it in** (what follows) and **Spreadsheet** (section 7).
3. Type their email address into the box.
   - It must end in **`@totaltransportlogistics.us`**. Anything else is skipped, and a yellow warning appears naming it — usually that means a typo.
   - You can paste **several** addresses, one per line, to add a batch.
4. Fill in **Their details** — name, **full legal name**, personal email,
   phones, extension, start date, date of birth. Fill in what you know; the
   rest can be added later.
   - **Phone numbers tidy themselves up.** Type a US number any way you like —
     `4699354100`, `(469) 935-4100`, `+1 469-935-4100` — and it is saved as
     **+(469) 935-4100**. You will see the field change as you tab out of it.
   - **Other phone** is for someone's number in their home country. Pick the
     country from the dropdown beside the box, then type the number: Guatemala
     saves as **+(502) 4874-0227** and Mexico as **+(52) 55 1234-5678**. Change
     the country and the number already in the box is re-read for the new one.
     Each person has one of these — pick the country that applies to them.
   - A number with the wrong number of digits is **not saved** — the box turns
     amber and says so, and the person is still added without it. US and
     Mexican numbers need 10 digits, Guatemalan ones 8. A desk extension goes
     in the **Extension** box, not on the end of the number.
   - Because a Mexican number is 10 digits like a US one, nothing can tell
     those two apart on its own. The box you type it in is what says which
     country it is, so put a Mexican number in **Other phone**, not in
     **Work phone (US)**.
   - These fields are only available when there is **one** address in the box.
     A name and a birthday belong to one person, so with several addresses
     pasted in they grey out. Use the Spreadsheet mode to give details to
     several people at once.
5. Pick their **Site** and their **Team** from the dropdowns. Site is where
   they sit; Team is who they report to. See section 6a.
6. Pick their **Roles**:

   | Role | What they can do |
   |---|---|
   | **Broker** | The default. Their own clients and loads, and nothing they don't own. |
   | **Admin** | Sees every record, and can manage who has access. |
   | **Dispatcher** | Can send carrier and shipper agreements. |
   | **Finance** | Can generate BOLs and invoices. |
   | **HR** | Can open Settings and **read** the people list, including full legal names, birthdays and personal emails. Can export it. Cannot change anything, and sees no more clients or loads than a Broker. |

   Everyone is a Broker unless you give them something else. Clicking **Broker** takes the other roles away.
   Site, team and roles are the things that **do** apply to everyone in a batch, which is why they stay available however many addresses you paste.
7. Click **Add Person** (or **Add N People**).
8. **You should see:** a small list confirming *"Added 3 of 3"*, with a green tick next to each address.

The new person appears in the **People With Access** list below, marked
**Pending first sign-in** (amber) until they actually log in, then **Active** (green).

### Filling in their details

Click the **pencil** icon on someone's row to record who they are: first and
last name, a photo, their site, their team, work phone, other phone, desk
extension, **full legal name**, **personal email**, **start date** and
**date of birth**.

Phone numbers are reformatted here the same way they are on the Add People
panel, and **Other phone** has the same country dropdown beside it. One with
the wrong number of digits is saved blank rather than as typed, with a message
saying so. This is the one place that clears a field on purpose, so check the
amber note under a phone box before saving.

> **Full legal name, date of birth and personal email are seen by Admins and HR
> only.** They are stored against the access list, which nobody else can read —
> they are never copied onto the profile the rest of the company can see. Name,
> phones, extension, site and team are visible to everyone.

**Full legal name** is for payroll: the name exactly as it appears on their
paperwork, for the people whose everyday name is not the one on the form —
a maiden name, a full compound surname, a middle name nobody uses at work.
Leave it blank when it is simply their first and last name.

Use this to change details **after** someone is on the list — when adding them,
fill the same fields in on the Add People panel instead. For more than a handful
of people, use the spreadsheet in section 7.

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

### The removal log

Removing someone deletes their entry, so the list below stops showing them
entirely. **Settings → People → Removed People** is the record that they were ever here:
click it open to see everyone who has been removed, when, and **which admin did
it** — along with the name, full legal name, phones, site, team, roles, start
date and personal email they had at the time.

Two things it is good for:

- **Answering "who took Ana off the system?"** — every removal is stamped with
  the admin's address and the date and time.
- **Undoing a mistake.** Removing someone does not keep their details anywhere
  else, so if they have to be set up again, this is where to copy them from.

There is an **Export CSV** button, same as the main list. Nothing here can be
edited or deleted from inside TTMS — it is a record, not a list you manage.

> **These records are kept forever.** That is a deliberate decision, not an
> oversight: the log is the only evidence someone was ever on the system, and
> the only place their details survive if a removal turns out to have been a
> mistake. Nothing in TTMS will ever delete from it.

### Three ways to look at the list

The buttons above the list switch between them. Whichever you pick is
remembered in your browser, and the filters, the search and the order stay the
same across all three — only the shape changes.

| View | What it is for |
|---|---|
| **Cards** | One roomy card each, with the photo down the side. Reading somebody's record, or editing it. |
| **Compact** | Smaller cards, three across. Still a photo, but a screenful of people instead of four. |
| **List** | One line each. The view for the question this page exists to answer: who is an admin, who has never signed in, who is suspended — across everybody at once. |

In the **List** view the headings sort: click **Person**, **Email**, **Work
phone**, **Started** or **Born** to order by it, and click the same heading
again to reverse it. Status and roles have a column each and cannot be switched
off. The role chips still work — if you spot a role that is wrong while
scanning, click it there and then; you do not have to go and find the person in
another view. The pencil opens the same editor, in a panel under their line.

### Choosing what each card shows

Each person's card shows their photo and the details on file — including their
full legal name, personal email and date of birth, which only this page and the
CSV ever show.

The **Show** button above the list is where you turn any of those off. Tick or
untick a detail and every card updates — and in the List view, so does every
column, since it is the same choice behind both. Status and roles are not on
that menu: they are what this page is for, and hiding them by accident is not
worth the convenience of being able to. This is your own view and nobody else's:
it is remembered in this browser only, so hiding birthdays before you share your
screen changes nothing for anyone else, and it does not change who is allowed to
see what — everyone who can open this page can read all of it either way.
**Show everything again** puts them all back.

The full legal name only appears when it is different from the everyday name,
since a card repeating the same name twice tells you nothing.

### Exporting the list

The **Export CSV** button above the list saves everyone as a CSV file that opens
in Excel — useful for HR or an audit. It saves exactly what is on screen, so if
you have filtered the list, you get the filtered version. The **Show** button
does not affect it: the CSV always has every column, so a file exported today
can be read — or imported — the same as one exported last month.

---

## 6b. The Directory — the one people page everyone can open

**Directory** in the left-hand menu is the company phone book. Unlike Settings,
**every single person who can sign in to TTMS can open it**, brokers included.

| Who is looking | What they see on each person |
|---|---|
| Anyone signed in | Name, photo, company email, US work phone, extension, office and team |
| Admin and HR | The above, plus the second phone number — and anyone who has been set up but has never signed in |

The email address and the phone numbers are clickable: one opens a new email,
the other dials, which is the whole reason the page exists. The box at the top
right searches names, addresses, numbers, extensions, offices and teams all at
once, and the dropdown beside it narrows the page to one office.

The two buttons at the top left of the controls switch between **Cards** and
**List**. Cards are for looking someone up when you are not sure how their name
is spelled — the photo is the quickest way to recognise a colleague. The list is
for running an eye down a whole office: one line per person, and clicking any
column heading sorts the list by that column (clicking the same heading again
reverses it).

On the list there is also a **Columns** button. It switches individual columns
off, which matters because the full table is wider than most laptop screens — if
you are only after extensions, turn the rest off and everything fits without
scrolling sideways. The button says how many columns are currently off, and
*Show every column* puts them all back. The view, the filters, the sorting and
the columns all live in the web address, so refreshing the page keeps them and a
link pasted to a colleague opens exactly the same view.

Two things it deliberately does **not** show anyone: date of birth, personal
email, full legal name and start date are never on it, and neither is anyone
whose access has been suspended — except for Admins and HR, who see them marked
as suspended because doing something about it is their job.

**Nothing on the Directory can be edited there.** It reads the details from
**Settings → People**, so a wrong extension is corrected on that page and is
right in the Directory immediately.

---

## 6c. Chat — talking to each other inside TTMS

**Chat** in the left-hand menu is a messaging page for staff. Everyone who can
sign in to TTMS can use it, and everyone can message everyone — there is no
setting to configure and nobody to grant access to. If they are on the access
list, they are reachable.

There are three kinds of conversation:

| Kind | Who is in it | How it starts |
|---|---|---|
| **Everyone** | Every person who can sign in | Already there; nobody has to be added |
| **One person** | Just the two of you | The **+** button, then **One person** |
| **A room** | Whoever you pick | The **+** button, then **A room**, name it and tick the people |

Anyone in a room can rename it, add or remove people, or leave it — rooms are
shared working spaces, not something one person owns. Taking somebody out of a
room stops them seeing it from that moment on; what they already wrote stays in
it.

You can also chat without leaving the page you are on. The blue speech-bubble
button in the bottom right corner of every screen opens the same conversations
in a small panel over your work, which is what you want when the question is
about the order already in front of you. The arrow at the top of that panel
opens the full page if you need more room.

A number beside **Chat** in the menu, or on the bubble, is how many
conversations have something in them you have not read yet. Opening one clears
its mark.

### Naming someone with @

Type **@** in the message box and a list of people appears. Pick a name and it
goes into the message. The person you named gets an amber **@** beside that
conversation instead of the ordinary blue dot, so a question meant for them does
not get buried under twenty other messages.

You can only name people who are actually in the conversation. In the Everyone
room that is the whole company.

**Click any name in a message** and a small card appears with that person's
photo, company email, work number and extension, their office and their team.
The email address and the number are clickable — one opens a new email, the
other dials. At the bottom is a **Message** button that opens a direct
conversation with them, which is usually why you clicked the name in the first
place.

The card shows exactly what the Directory shows everyone and nothing more. The
second phone number, which the Directory keeps to Admin and HR, is not on it.

### How a conversation looks

Messages sit in bubbles, like WhatsApp. **Yours are on the right in blue, other
people's on the left in white**, with their photo beside the first one. When the
same person sends several messages in a row they stack together under one photo,
and only the first has the little pointed corner.

In a room, the sender's name sits at the top of their bubble. In a direct
message it does not — there are only two of you, and which side the bubble is on
already says who wrote it. The time is inside the bubble, bottom right.

### Replying to a message

Hover over any message and **a small arrow appears in the top right corner of
the bubble**. Click it and a menu opens next to that message, listing what you
can do by name:

| | What it does | Appears on |
|---|---|---|
| **Reply** | Quotes the message above yours | Anyone's, including your own |
| **Reply privately** | Answers in a direct thread instead | Anyone's but your own, and only in a room |
| **Edit** | Change the wording | Only your own |
| **Delete** | Take it back | Only your own |

Clicking anywhere outside the menu closes it.

**Reply** puts the message you are answering in a bar above the box. Send, and
your message appears with the quote attached, so a room where three
conversations are running at once still makes sense. Clicking a quote jumps to
the original and highlights it for a second. The **x** on the bar drops the
quote if you change your mind.

**Reply privately** is for when the answer does not belong in the room — a
correction, a rate, anything you would rather not say in front of twelve people.
It opens your direct thread with whoever wrote the message and brings the quote
with you, labelled with the room it came from, so they know what you are
answering. It always goes to the person who wrote that message and nobody else.

One thing to know: **a quote keeps a copy of what was said.** If the original is
still in the conversation, the quote follows it — delete the original and the
quote turns into "Message deleted". But a quote you carried into a private
thread keeps the words, because the original lives in a room the copy has left.

### Reacting instead of replying

Hover a message and a small face-with-a-plus appears under it. Click it and pick
one of six: 👍 Got it, ✅ Done, ❓ Question, 👀 Looking, 🙏 Thanks, ❤️ Love it.

Reactions exist so that "ok" does not have to be a message. Twelve people
acknowledging a dispatch note is twelve lines of noise in a room, or one small
count under the note itself. Hovering a count lists who reacted, which answers
the question actually worth asking: *who has seen this?*

Click your own reaction again to take it back. There is no full emoji picker on
purpose — hunting through three thousand faces is slower than typing "ok", which
would defeat the point.

### Sending photos and files

Three ways, whichever suits:

- **Drag** the file onto the message box
- **Paste** it — a screenshot copied with the Snipping Tool goes straight in
- Click the **paperclip** beside the box

Photos appear in the conversation at a readable size; click one to see it full
screen. Anything else — a PDF rate confirmation, a spreadsheet — appears as a row
you click to open. You can add a caption or send the file on its own. Files start
uploading as soon as you choose them, so a large BOL photo is usually ready by
the time you have finished typing. The **x** on a file removes it before sending.

The limit is **25 MB** per file. Anything bigger should go by email or a link.

> **Worth knowing:** a file sent in a private room is protected by the room, not
> by the file itself. Someone who has the exact web address of an attachment
> could open it even if they are not in that room. Addresses are never shown
> outside the conversation and cannot be guessed, so this is not a practical
> risk — but it is the same as the BOLs and licences already in TTMS, and it is
> the honest answer if anyone asks whether an attachment is truly private.

### Formatting a message

The same marks as WhatsApp, so there is nothing new to learn:

| Type this | To get |
|---|---|
| `*load 41207*` | **load 41207** |
| `_urgent_` | *urgent* |
| `~cancelled~` | ~~cancelled~~ |
| `` `MC 123456` `` | `MC 123456` in plain type |

Web addresses turn into links on their own — you do not have to do anything.

### Older messages, and linking to one

A conversation opens with its most recent messages. **Scroll to the top and the
next batch loads by itself**, keeping your place, until you reach the beginning.

To point somebody at one particular message, open its arrow menu and choose
**Copy link to message**. Pasting that link into another conversation, or an
email, opens TTMS on that conversation with the message highlighted.

### Being told a message arrived

The bell at the top of the conversation list controls how this computer lets you
know. There are three ways, and they work together:

| | What it does | Setup |
|---|---|---|
| **Tab title** | A count appears in front of "TTMS" in the browser tab | Always on |
| **Desktop notification** | A box pops up in the corner of your screen | Click the bell, then **Allow notifications**, and say yes to the browser |
| **Sound** | A short chime | Click the bell and switch it on — it is off to start with |

The bell settings belong to the computer you are sitting at, not to your
account. Turning the sound off at a shared desk does not turn it off at home.

When you come back to a conversation you have been away from, a red **New
messages** line marks where you left off, and TTMS opens the conversation at
that line rather than at the bottom.

### Three things worth knowing

- **All of this needs TTMS open in a tab.** There are still no email alerts and
  no phone notifications. If someone has closed TTMS for the day, they will see
  your message when they open it again — that needs TTMS to be properly
  deployed, which has not happened yet.
- **You can edit and delete your own messages.** An edited message is marked
  **(edited)** so nobody is left arguing with a version that quietly changed.
  A deleted one leaves a "Message deleted" line where it was.
- **A person has to have signed in at least once** before they can be messaged.
  Being on the access list is not enough on its own.

---

## 6a. Sites, Teams and Work Groups

The **Organization** tab of Settings holds three panels that group people in
three different ways. They are easy to mix up, so here is the difference in one
table.

| Panel | Answers | Changes what they can see? |
|---|---|---|
| **Sites** | *Where do they sit?* An office, terminal or yard. | **No** |
| **Teams** | *Who do they report to?* | **No** |
| **Work Groups** | *Whose clients and loads can they open?* | **Yes** |

**Sites** and **Teams** are just labels. Putting someone on a team records
their place in the org chart and nothing else — it does not give them access to
one single extra record. **Work Groups** are the opposite: everyone in a work
group can see every client, shipper and consignee that group owns. That is the
whole point of them.

> If you want two people to share a book of business, that is a **Work Group**.
> If you want to record that Maria reports to Gabe, that is a **Team**. Doing it
> with the wrong one either fails to share anything, or shares far more than you
> meant to.

### Setting up teams

**Settings → Organization → Teams**.

1. Type the team name — for example `GT`, `Top Brokers`, `Hibrid`, `Staff`.
2. Pick the **lead** from the dropdown: the person everyone on that team reports
   to. You can leave it as *No lead yet* and set it later.
   - Everyone on the People With Access list can be picked, including someone
     who has not logged in yet — the dropdown says *has not signed in yet*
     beside their name, and so does the team's row until they do. This is on
     purpose: a new manager is usually named before their first day. They
     cannot see anything in TTMS until they sign in, and being a team's lead
     does not change that.
3. Click **Add team**.

Each team's row shows who it reports to and how many people are on it. The
pencil icon renames it or changes the lead; the trash icon deletes it.

**Deleting a team** leaves everyone who was on it without a team. It does not
touch their access, their records or anything else — TTMS tells you how many
people were affected.

A team often turns out to be everyone in one office, but it does not have to
be. Site and team are separate fields precisely so a team can span two offices,
or one office can hold several teams.

People are put on a team from the **People With Access** list above — the pencil
icon on their row — or in bulk with the spreadsheet in section 7.

---

## 7. Adding or updating many people at once

When you are setting up TTMS for the whole company — or your HR list has been
updated and you want TTMS to match — do it with a spreadsheet instead of
typing each person in.

**Settings → People → Add People**, then switch the mode in the top right to
**Spreadsheet**.

1. Click **Template** to download a CSV with the right column headings and one
   example row. Open it in Excel.
   - Or click **Export CSV** above the People With Access list to download
     everyone you already have, and edit that. The two files have the same
     columns, so an export can be edited and uploaded straight back.
2. Fill it in. The columns are:

   | Column | Notes |
   |---|---|
   | **Email** | Required. Must end in `@totaltransportlogistics.us`. This is what identifies the person. |
   | First name, Last name | The name the office uses. |
   | **Full legal name** | The payroll name, if it differs. Admin and HR only. Leave blank when it is just their first and last name. |
   | Personal email | Any address. Admin and HR only. |
   | Work phone (US) | Typed however you like — `4699354100`, `(469) 935-4100` and `+1 469-935-4100` all save as `+(469) 935-4100`. Needs 10 digits. |
   | Guatemala phone, Mexico phone | The person's home-country number. A spreadsheet has no dropdown, so there is a column per country and the **heading** is what says which country the digits are. Fill in the one that applies and leave the other blank — a row with something in both is refused, because a person has one of these, not two. Guatemala needs 8 digits, Mexico 10. |
   | Extension | Typed however you like. Keep it out of the phone columns — a number with an extension stuck on the end has too many digits and will be left out. |
   | Site | The site's **name**, spelled as it appears under Sites. Write `None` to clear it. |
   | **Team** | The team's **name**, spelled as it appears under Teams. Write `None` to clear it. |
   | Date of birth, Start date | Best written as `1990-03-04`. `3/4/2020` and `Mar 4, 2020` also work. |
   | Roles | `Admin`, `Dispatcher`, `Finance`, `HR` — separated by commas — or `Broker` for none. |

3. Drag the file onto the drop box and click **Check the file**.
4. **You should see:** a summary such as *"Ready to save: 4 new, 11 updated"*,
   then a line per person saying exactly which fields would change.
   Read it. Nothing has been saved yet.
5. **Fix anything that went wrong without leaving the screen.** Every row has a
   button on the right — it reads **Fix** in amber on a row with a problem, and
   **Edit** on the rest. It opens the whole person: email, name, legal name,
   personal email, both phones, extension, site, team, dates and roles. The box
   that caused the problem is outlined in amber with the reason under it.
   - Site, team and roles are **dropdowns and buttons**, so a name that does not
     exist or a misspelled role cannot happen twice.
   - Dates are a date picker, so what goes back is always readable.
   - Phone numbers tidy themselves up here too.
   - You can fill in a column **the spreadsheet does not even have** — pick a
     Team on a file with no Team column and the column is added for you.
   - This edits **the spreadsheet, not the directory.** After editing, the
     Apply button disappears and the Check button turns blue: press
     **Check again** to see what your corrections would now do. That is
     deliberate — nothing is ever saved against a preview that no longer
     matches the file.
   - **Download corrected file** gives you the spreadsheet with your fixes in
     it, to keep or to send back to whoever produced it.
6. If it looks right, click **Apply N changes**.

**The three rules that make this safe to use:**

- **Someone already on the list is updated, not duplicated.** TTMS matches on
  the email address, so uploading a fuller version of the same list fills in
  the gaps rather than creating everyone twice.
- **An empty cell changes nothing.** If you only know two people's birthdays,
  fill in those two and leave the rest of the column blank — nobody else's
  details are touched. To *erase* something, clear it with the pencil icon on
  their row; a blank cell will never do it.
- **Leaving someone out of the file does nothing to them.** The import only
  adds and updates. It never suspends and never removes anyone — those are
  still deliberate, one-at-a-time actions.

If a row has something TTMS cannot read — an unrecognisable date, a site or
team that does not exist, a misspelled role — that **whole row** is skipped and
named in the results, so it never gets half-saved. Fix it in Excel and upload
again. Sites and teams have to exist before you can import people into them, so
add those first.

**A phone number is the one exception.** A number with the wrong count of digits
does not throw its row away — the rest of that person's row saves, and only the
number is left out. The summary says how many were dropped and the row itself
names them, for example *"Work phone (US) “469-935-41” is not a 10-digit US
number, so it was left blank."* On someone who already has a number on file, the
one they have is kept rather than overwritten.

Either way you do not have to go back to Excel: click **Fix** on the row, correct
it there, and **Check again**. Uploading a corrected file from Excel still works
exactly as it always did.

> You cannot remove your own Admin role this way, and neither can the protected
> `it@`, `operations@` and `dispatch@` accounts lose theirs. If a file tries,
> the Roles column on that row is ignored and the rest of it still saves.

---

## 8. Importing data from BATS

The old BATS CRM data can be pulled in through the browser. **No commands needed.**

1. Export the data from BATS as CSV files. You should end up with files named
   like `carriers-export-....csv`, `customers-export-....csv` and
   `orders-export-....csv`.
2. In TTMS, go to **Settings → Data**, which holds **BATS Data Import**.
3. There are three drop boxes — **Carriers**, **Customers** and **Orders**.
   Drag each file into its matching box. You can drop **several** order files at once.
4. Click **Run Import**.
5. **You should see:** a result line for each type, reading something like
   *"Carriers — 12 written · 480 unchanged · 492 total"*.

> **Re-importing is safe.** TTMS remembers each row and skips anything that
> hasn't changed, so running a fresh export next week only writes what is
> genuinely new. You will not create duplicates.

Also in Settings, on the **Organization** tab: **Sites** (your company
locations) and **Work Groups** (teams that share client records). Both are
simple add-and-name lists.

---

## 9. When something goes wrong

Work down this table. The **Call for help** column tells you when to stop and
escalate rather than experiment — because the data is live.

| What you see | What it means | What to do |
|---|---|---|
| **"This site can't be reached"** in the browser | TTMS isn't running. | Double-click **Start TTMS** and wait 10 seconds. |
| The dark window flashed up and vanished | It hit a problem and closed too fast to read. | Open the `scripts` folder, right-click `start-ttms.bat`, **Open in Terminal**. Now the message stays on screen. |
| **"Node.js is not installed"** | Setup Step 1 didn't finish, or you skipped the restart. | Redo [Step 1](#step-1--install-nodejs-about-5-minutes), including restarting the computer. |
| **"the settings file is missing"** | `.env.local` isn't there, or is misnamed. | Redo [Step 4](#step-4--put-the-settings-file-in-place-about-2-minutes). Check the `.txt` trap. |
| **"port 3000 is in use"** / **EADDRINUSE** | TTMS is already running in another window. | Look on your taskbar for another dark window and use that one. |
| **You sign in and are instantly signed back out** | Your email isn't on the access list. | Ask an Admin to add you under [Add People](#6-giving-someone-access). |
| **"Missing or insufficient permissions"** | A technical settings change hasn't been published to Google. | **Call for help.** A developer must run the rules deploy — [Part 2, section 07](#security-rules--the-trap-that-already-cost-five-weeks). |
| **Nobody in the company can sign in** | Something has gone wrong with the access list. | **Call for help immediately.** The recovery account is `it@totaltransportlogistics.us` — do not remove or change it. |
| **Agreement emails aren't arriving** | The email service key has expired, or the sending domain lost verification. | Check the junk folder first. Then **call for help** — see [Part 2, Troubleshooting](#troubleshooting). |
| **A signing link sent to a carrier points at "localhost"** | Expected until TTMS is properly deployed. | The carrier cannot use that link. **Call for help** — this needs [Deployment](#deployment--currently-unresolved) resolved. |
| Red text mentioning a **"missing index"** | A search needs a database setting Google has to create. | **Call for help.** It's a two-minute fix for a developer. |

---

## 10. Things you must never do

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

GOOGLE_MAPS_API_KEY=

NEXT_PUBLIC_APP_URL=http://localhost:3000
```

- `GOOGLE_MAPS_API_KEY` is **optional and costs money**. Leave it blank unless
  someone has decided to pay for exact mileage. Orders work fine without it —
  they use the free built-in estimate, which is the default. See
  [Lane distance](#lane-distance) below before adding it.
- *Client values*: Firebase Console → Project Settings → General → Your apps.
- *Admin values*: Project Settings → Service Accounts → **Generate new private key**; take `client_email` and `private_key` from the JSON.
- `FIREBASE_ADMIN_PRIVATE_KEY` keeps its `\n` escapes and is quoted; `src/lib/firebase-admin.ts` converts them back.
- *Resend*: resend.com → API Keys. **There is no key yet, and the sending
  domain is not verified** — leave `RESEND_API_KEY` blank until both are done, or
  agreement emails will fail at send time. See
  [Email sending](#email-sending--not-yet-provisioned).

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
│  │  └─ settings/               Tabbed: Overview, People, Organization,
│  │                          Operations, Data (admin only; HR sees People)
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
`allowedUsers/{email}` document via **Settings → People → Add People**.

On every sign-in: `AuthContext` posts the ID token to `POST /api/auth/session`,
which verifies it, requires an `allowedUsers` entry, provisions `users/{uid}`
with that entry's roles, and mirrors them into custom claims. Any failure and
`AuthContext` signs the user straight back out — there is no signed-in state
without a verified entry.

- `allowedUsers/{email}` — the allowlist, keyed by lowercased email. Source of truth for roles. `uid: null` means a pending invite.
- `users/{uid}` — live profile for someone who has signed in. Provisioned server-side.

Neither is client-writable; all changes go through the Admin SDK, so nobody can
self-promote.

**Roles:** `isAdmin`, `isDispatcher`, `isFinance`, `isHr`. *Broker* is the
default and is derived, not stored — deliberately, so there is no account that
is neither a broker nor anything else.

`isHr` grants **read-only access to the people directory and nothing else**: an
HR user can open Settings, read every allowlist entry including the payroll
fields (`legalName`, `dateOfBirth`, `personalEmail`, `startDate`) and export the
list. They cannot write anything, and they are deliberately absent from
`canSeeAllParties()`, so they see no more clients or loads than a plain broker.
Three things follow, all easy to break by accident:

- The `allowedUsers` read rule in `firestore.rules` is `isAdmin() || isHr()`. That rule, not the Settings page, is what enforces this.
- `isHr` has **no custom claim**. Nothing in either rules file reads one, and the profile lookup is enough. Don't add one speculatively.
- Payroll fields must never reach `users/{uid}` — every signed-in user can read that document. Check `MIRRORED_FIELDS` in `src/lib/userImport.ts` and the `patch`/`privatePatch` split in `/api/admin/users` before adding a field.

**Sites vs teams vs work groups.** `sites` (where someone sits) and `teams` (who
they report to) are reference data and grant nothing; `workGroups` is an access
boundary that shares parties between members. Nothing in `firestore.rules` reads
`teamId` and nothing should start to — see `src/types/team.ts`.

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
| `/api/sites[/id]`, `/api/teams[/id]`, `/api/work-groups[/id]` | Settings reference data. `GET` authenticated; writes `requireAdmin`. | authenticated |
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

That same limit is why the rules cannot tell one staff account from another.
Bills of lading, invoices and proofs of delivery are therefore **not readable
from the browser at all**: the app fetches them through a server route that
first checks whether you are entitled to the order — its owners, the owners of
its client, and admin, dispatch and finance. Driver's licences are the
exception and are readable by anyone on the allowlist, because they get checked
at pickup and delivery by people who are not the broker on the load.

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
migrations. The BATS import also has a drag-and-drop UI at **Settings → Data → BATS
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

### Date format

How dates are written on screen is one company-wide choice, in **Settings →
Operations → Date Format**. The options, all showing the same day — the 4th of
March 2020:

| Option | Looks like |
|---|---|
| **Day, month name, year** *(default)* | 4-Mar-2020 |
| **MM/DD/YYYY** | 03/04/2020 |
| **DD/MM/YYYY** | 04/03/2020 |

It applies to every date TTMS shows you: pickup and delivery dates, insurance
expiry, start dates, birthdays, the "created" and "last updated" lines. Changing
it changes what everyone sees the next time their page loads — it does not touch
any stored data, so switching back and forth is safe.

One deliberate exception:

- **Documents keep the month spelled out.** Bills of lading, invoices, carrier
  agreements and the page a carrier signs always say "March 4, 2020". They leave
  the company, they are the record of the shipment, and 03/04/2020 is two
  different days depending on who is reading it.
Typing a date follows the setting as well. Every date box shows and accepts the
chosen format, and the calendar button at its right still opens the usual picker
if you would rather click than type. Two things the box will not do:

- **It will not guess.** With the spelled-out month set, typing `3/4/2020` gets
  you "That could be two different days" rather than a silent choice between the
  4th of March and the 3rd of April. Type `4-Mar-2020`, or use the calendar.
  Under MM/DD/YYYY or DD/MM/YYYY the order is already settled, so `3/4/2020` is
  taken at its word.
- **It will not keep a date it could not read.** Nothing is stored until what
  you typed is a real date, so a half-finished or mistyped one cannot be saved
  as though you meant it.

The default is the spelled-out month for a reason: staff here enter dates from
both the US and Latin America, where 03/04 means two different days. If
everyone reading TTMS shares one convention, either slash format is fine.

---

### Lane distance

Every order can show the distance between its pickup and delivery addresses.
An admin chooses how in **Settings → Operations → Lane Distance**, and the choice applies to
everyone:

| Option | What it does | Cost |
|---|---|---|
| **Off** | No distance shown. | — |
| **Estimate** *(default)* | Worked out inside TTMS from the two ZIP codes. Usually within about 5% of real driving distance. Mountain routes such as Denver–Salt Lake read low, because the interstate detours a long way around. | Free |
| **Google Routes** | Real road miles from Google. | **Google charges for every lookup** |

Two things worth knowing before switching to Google Routes:

1. It needs `GOOGLE_MAPS_API_KEY` in `.env.local`. Until that is set the option
   is greyed out in Settings. To get one: Google Cloud Console for `ttms-59aa5`
   (the same `it@totaltransportlogistics.us` sign-in as Firebase) → enable the
   **Routes API** → APIs & Services → Credentials → create an API key →
   restrict it to the Routes API. Billing must be on for the project.
2. It bills per lookup, on each new order and each time an address changes.
   TTMS looks a lane up **once** and stores the answer on the order, so viewing
   an order again is free — but a busy day of new orders is a real bill.

Whichever is chosen, the number is stored on the order and labelled with how it
was obtained, so nobody mistakes an estimate for exact mileage. **Never bill a
customer per mile from an estimate.**

---

## Email sending — not yet provisioned

TTMS sends two emails, both carrying an e-signature link: the carrier rate
confirmation and the shipper load confirmation. Both go through Resend. **Today
neither can send.** Nothing is broken — it was simply never finished.

**What exists.** A Resend account, on the team `totaltransportlogistics`, owned
by `it@totaltransportlogistics.us`. Sign in at resend.com with **Continue with
GitHub** — that GitHub account is itself Google sign-in as `it@`, so the chain is
Google → GitHub → Resend. There is no password to look for. If you try
email-and-password you will conclude you have no access, and you would be wrong.

**What is missing.** Three things, in this order:

1. **A verified sending domain.** Resend lists no domains. `totaltransportlogistics.us`
   has no Resend DNS records at all.
2. **An API key.** Resend lists none, and `.env.local` has no `RESEND_API_KEY`.
3. **A real `NEXT_PUBLIC_APP_URL`.** Signing links are built from it, so until
   there is a deployment they point at `localhost` and are useless to a carrier.

Because Resend is initialized lazily and both routes check for the key first,
the current behaviour is a clean failure at send time — not a crash, and not a
silently dropped email. No agreement email has ever been sent from this system.

### Finishing it

The step that depends on someone else is **DNS**, so start there.

1. Resend → **Domains** → Add domain → `totaltransportlogistics.us`. Resend shows
   the DKIM and SPF records to add.
2. Add those records to the DNS zone for `totaltransportlogistics.us`. **You need
   whoever controls that zone.** Mail is on Google Workspace (`smtp.google.com`),
   so it is likely managed alongside it.
3. Once Resend shows the domain verified: **API keys** → Create API key → put it
   in `.env.local` as `RESEND_API_KEY`. Never commit it.

Two things worth deciding while you are in there:

- **MFA is off** on the only member of the account, and that member is an Admin.
  This account sends the documents your signature audit trail is built on. Turn
  it on.
- **The domain's SPF record currently authorizes SendGrid**, not Resend
  (`include:sendgrid.net`). Someone at TTL set that up for something. Before
  adding a second email provider, it is worth asking whether TTL already pays
  for one — switching TTMS to it is a code change in both send routes, not a
  settings change, so decide before rather than after.

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
- [ ] Resend reachable at resend.com via **Continue with GitHub** as `it@`. Owned by the `it@` role account — nothing to chase. **Turn on MFA:** it is currently off, and this account sends your signed agreements.
- [ ] Confirmed sign-in to TTMS itself as `it@totaltransportlogistics.us` — the lockout recovery path.
- [ ] **If you want the Claude Code workflow: TTL has no paid Claude account.** The prior work used a personal one. Budget for a company plan or skip Part 3.
- [ ] `.env.local` built and `npm run dev` serving the dashboard.
- [ ] `npm run build` passes on a clean checkout.
- [ ] `node scripts/deploy-rules.js --dry-run` confirms deployed rules match the repo. If not, that's job one.
- [ ] Read `accessControl.ts` and `firebase-admin.ts` end to end — short, and they govern everything.
- [ ] Resend sending domain verified — **it is not yet.** This blocks all agreement email; see [Email sending](#email-sending--not-yet-provisioned).
- [ ] Production deployment and dev/prod split planned.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| *"Missing or insufficient permissions"* | Repo rules aren't deployed. `node scripts/deploy-rules.js`. |
| Signed in, immediately signed back out | No `allowedUsers` entry. Add via Settings → People → Add People, or use a bootstrap admin. |
| Everyone locked out | Sign in as `it@totaltransportlogistics.us`. If a rules deploy caused it, `rollback-rules.js --list` then `--to <rulesetId>`. |
| Signing links point at localhost | `NEXT_PUBLIC_APP_URL` wrong for that environment. |
| No email at all | `RESEND_API_KEY` missing, or sending domain lost verification. Resend init is deliberately lazy, so it fails at send time, not build time. |
| No distance on an order's Route section | Either lane distance is set to **Off** in Settings, or the two addresses are missing a ZIP. The field says which on screen. |
| An order's distance looks wrong | On **Estimate** it is not a routed distance — see [Lane distance](#lane-distance). Usually within ~5%; mountain routes read low. Never bill per mile off an estimate. |
| An order says "Google Routes unavailable — showing an estimate" | The key is missing or wrong, billing lapsed on `ttms-59aa5`, or Google could not route those addresses. The message carries Google's own reason. Orders keep working on the free estimate meanwhile. |
| A script says a setting is missing when `.env.local` is clearly there | Was a real bug until Aug 2026: the scripts could not read a `.env.local` saved with Windows line endings. Fixed. If it recurs, check the file was not saved in an editor that mangled it. |
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
