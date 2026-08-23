/**
 * Person names are captured as First + Last in the UI but stored as the single
 * string the schema already has — `contactName` / `dispatcher` /
 * `billingContact` on a carrier, `driverName` on an order. Splitting the
 * schema would mean backfilling every record BATS imported, and BATS only ever
 * gave us one name string to begin with.
 *
 * The split is on the FIRST space, so "Mary Jo Van Der Berg" reads back as
 * first "Mary", last "Jo Van Der Berg". Multi-word surnames survive a
 * round-trip; multi-word given names land in the wrong box until someone
 * corrects them, which they can, because both boxes are editable.
 */
export function splitPersonName(full: string | null | undefined): {
  first: string;
  last: string;
} {
  const trimmed = (full ?? '').trim();
  if (!trimmed) return { first: '', last: '' };
  const space = trimmed.indexOf(' ');
  if (space === -1) return { first: trimmed, last: '' };
  return {
    first: trimmed.slice(0, space),
    last:  trimmed.slice(space + 1).trim(),
  };
}

export function joinPersonName(first: string, last: string): string {
  return [first.trim(), last.trim()].filter(Boolean).join(' ');
}
