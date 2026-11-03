/**
 * The letterhead, as BATS printed it on the Shipper Agreement. Written here
 * rather than read from settings because nothing in the app edits it; if the
 * office moves, this is the line to change.
 *
 * Its own module, apart from pdfBrand.ts, because the browser needs it too
 * (the scan-to-sign card, src/lib/signQrCard.ts) and pdfBrand reads the logo
 * with `fs`, which cannot be bundled for a page.
 */
export const COMPANY = {
  legalName: 'Total Transport Logistics, Inc.',
  street:    '4833 W Royal Ln',
  city:      'Irving, TX 75063',
  phone:     '(469) 472-2334',
  web:       'totaltransportlogistics.us',
} as const;
