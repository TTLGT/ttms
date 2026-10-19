# Change Order feature — what was built and what is left for you

Built and released 2026-10-19 (one commit to `main`, live on
`ttms.totaltransportlogistics.us`). Security rules deployed the same day.

## What it does now

**1. Dispatch Sheet (carrier) works like the SA (client).**
When a load changes after its Dispatch Sheet went out, and the change is
something printed on it (carrier, carrier pay, stops, dates, freight,
accessorials, dock work, carrier instructions, this load's carrier terms):

- the carrier's link goes on hold and can't be signed;
- if the carrier had signed, the order stops showing them as signed (the
  signed copy is kept on the old link);
- a "Dispatch Sheet update" review opens for dispatch, in Approvals and with
  a line in the load's chat room;
- dispatch sends the updated sheet from that review (a new link; the old one
  stops working).

Swapping the carrier also opens that review and posts in the room.
The driver's name and phone don't count as a change (they're not terms).

**2. Change orders.**
Once an SA or Dispatch Sheet has been sent by e-signature link, a broker
can't save a change to anything printed on it. When they press Save:

- a box asks "Why is the load changing?";
- the edit goes to dispatch as a change order — nothing on the load changes yet;
- dispatch sees it on the load (top of the page) and in Approvals, with old →
  new values and the reason, plus a line in the load's chat room;
- **Approve and apply** saves the change, which puts the links on hold and
  reopens the SA and/or Dispatch Sheet review so dispatch resends;
- **Turn down** needs a note, which the broker sees;
- the broker can **Withdraw** their own while it waits;
- one waiting change order per load; if the load changed in the same fields
  meanwhile, approval is refused and the broker submits again.

Admin and dispatch save directly (new permission: "Change loads after
agreements are sent", `orders.applyChanges`, in Settings → Permissions; it can
also be given to one person).

## What you need to do

1. **Try it once on a real load.** There's no test database, so the first
   real use is the test. Use one of the two complete loads (with carrier,
   shipper, consignee):
   - As a broker account: open a load whose SA was sent, change the rate →
     the box should appear → submit → the load should show "Change order —
     Waiting" and not have changed.
   - As dispatch/admin: Approve → the load changes, the SA shows "SA update"
     with the link on hold → send it.
   - Change the carrier pay on a load whose Dispatch Sheet was sent → the
     carrier's link shows "being updated" and a "Dispatch Sheet update" review
     appears.
2. **Nothing to do for permissions.** Each person's saved permission list
   picks up the new one at their next sign-in, and until then the code reads
   their role directly, so no dispatcher is blocked. (There's no button for
   it; `POST /api/admin/users/sync` does everyone at once if ever wanted.)
   Once everybody has signed in again, the fallback in
   `canApplyOrderChanges()` (`src/lib/changeOrders.ts`) can be removed.
3. **If anything goes wrong with rules:** the previous Firestore ruleset was
   `86698698-105a-4e92-b66a-7f10dd0abc53` —
   `node scripts/rollback-rules.js --to 86698698-105a-4e92-b66a-7f10dd0abc53`.
   (The only rules change is one more closed collection, `changeOrders`.)

No new Firestore index is needed (only single-field queries).

## Known limits (decided, not bugs)

- An SA or Dispatch Sheet signed **on paper** with no e-signature link out
  doesn't trigger a change order or a hold.
- Dispatch Sheets sent **before today** carry no fingerprint, so a change is
  measured against the load as it was just before the edit. Edits made before
  today that were never resent won't be caught.
- Approvals shows dispatch only the **waiting** change orders (to keep the
  nav badge cheap). Decided ones stay on the load for 14 days and on its
  Change log for good.
- A change order holds the whole edit; part of it can't be approved.

## Where the code is

- `src/lib/carrierAgreements.ts` — the carrier hold
- `src/types/changeOrder.ts`, `src/lib/changeOrders.ts`,
  `src/lib/changeOrderDecisions.ts` — change orders
- gate: `updateOrderAsCaller()` in `src/lib/orderWrites.ts`
- browser: `saveOrderPatch()` in `src/lib/orders.ts`,
  `src/components/orders/ChangeOrderPrompt.tsx`, `ChangeOrderPanel.tsx`,
  `ChangeOrdersSection.tsx`
- routes: `/api/orders/{id}/change-order`, `/api/change-orders`
- docs: CLAUDE.md ("Change orders"), Schema Guide (`changeOrders`, `caRequests`)
