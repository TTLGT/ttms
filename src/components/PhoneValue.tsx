'use client';

import CopyValue from '@/components/CopyValue';
import { telHref } from '@/lib/phone';
import type { PhoneRegion } from '@/lib/phone';

/**
 * A phone number on a record: dialable, and copyable.
 *
 * The directory has had both for a while — a `tel:` link for whoever is at a
 * desk with a softphone, and a copy button for everyone else, because the
 * office reaches TTMS over plain http where `navigator.clipboard` does not
 * exist and selecting small grey text with a mouse is the fiddliest way to get
 * a number into a dialler. The client, shipper, consignee and carrier records
 * are read for exactly the same reason — somebody is about to ring them — so
 * they behave the same way now.
 *
 * **Colour is inherited on purpose.** Each screen already sets the weight and
 * shade its own rows use, and a number that suddenly went brand-blue would
 * read as a different kind of thing on each one. Like the directory, it looks
 * like the text around it and underlines on hover.
 *
 * The copy button reveals on hover of a `group` ancestor, so one is wrapped
 * around the pair rather than relying on the caller's row to carry the class —
 * every one of these sits in a different table, card or definition list, and a
 * missing `group` fails silently by never showing the button at all.
 *
 * Region defaults to US because none of these records carries one. Parties and
 * carriers store whatever was typed, with no country field beside it — unlike
 * a staff profile, which has an explicit `otherPhoneRegion`. A number written
 * with its own country code still dials correctly; see telHref.
 */
export default function PhoneValue({
  value,
  label = 'phone number',
  region = 'US',
  className = '',
}: {
  value: string | null | undefined;
  /** What it is, for the copy tooltip: "Copy dispatcher phone". */
  label?: string;
  region?: PhoneRegion;
  className?: string;
}) {
  const phone = (value ?? '').trim();
  // Rendered bare so it inherits whatever the caller's placeholder looked like
  // before — every one of these sites wrote its own `|| '—'`.
  if (!phone) return <>—</>;

  return (
    <span className="group inline-flex min-w-0 align-bottom">
      <CopyValue value={phone} label={label}>
        <a
          href={telHref(phone, region)}
          className={`hover:text-brand-700 hover:underline ${className}`}
        >
          {phone}
        </a>
      </CopyValue>
    </span>
  );
}
