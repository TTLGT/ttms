/**
 * Samsung model codes as phones report them ("SM-S918B") → the name people
 * know ("Galaxy S23 Ultra"), for the device line on an e-signature.
 *
 * Keyed on the letter and three digits after "SM-": the letters after that
 * are the region or carrier (S918B, S918U, S918U1, S918W all a S23 Ultra), so
 * one entry covers every variant. Only codes we are sure of are listed — a
 * code that is missing prints as the code alone, which is still true, while a
 * wrong name would put a false statement on a legal record. The code itself is
 * always printed beside the name, as the evidence.
 *
 * Add a phone when one turns up as a bare code on a signature.
 */
const SAMSUNG_MODELS: Record<string, string> = {
  // Galaxy S
  G960: 'Galaxy S9', G965: 'Galaxy S9+',
  G970: 'Galaxy S10e', G973: 'Galaxy S10', G975: 'Galaxy S10+', G977: 'Galaxy S10 5G',
  G980: 'Galaxy S20', G981: 'Galaxy S20', G985: 'Galaxy S20+', G986: 'Galaxy S20+',
  G988: 'Galaxy S20 Ultra', G780: 'Galaxy S20 FE', G781: 'Galaxy S20 FE',
  G991: 'Galaxy S21', G996: 'Galaxy S21+', G998: 'Galaxy S21 Ultra', G990: 'Galaxy S21 FE',
  S901: 'Galaxy S22', S906: 'Galaxy S22+', S908: 'Galaxy S22 Ultra',
  S911: 'Galaxy S23', S916: 'Galaxy S23+', S918: 'Galaxy S23 Ultra', S711: 'Galaxy S23 FE',
  S921: 'Galaxy S24', S926: 'Galaxy S24+', S928: 'Galaxy S24 Ultra', S721: 'Galaxy S24 FE',
  S931: 'Galaxy S25', S936: 'Galaxy S25+', S938: 'Galaxy S25 Ultra', S937: 'Galaxy S25 Edge',

  // Galaxy Note and Z
  N970: 'Galaxy Note10', N975: 'Galaxy Note10+', N976: 'Galaxy Note10+ 5G',
  N980: 'Galaxy Note20', N981: 'Galaxy Note20', N985: 'Galaxy Note20 Ultra', N986: 'Galaxy Note20 Ultra',
  F700: 'Galaxy Z Flip', F707: 'Galaxy Z Flip 5G', F711: 'Galaxy Z Flip3', F721: 'Galaxy Z Flip4',
  F731: 'Galaxy Z Flip5', F741: 'Galaxy Z Flip6', F766: 'Galaxy Z Flip7',
  F916: 'Galaxy Z Fold2', F926: 'Galaxy Z Fold3', F936: 'Galaxy Z Fold4', F946: 'Galaxy Z Fold5',
  F956: 'Galaxy Z Fold6', F966: 'Galaxy Z Fold7',

  // Galaxy A — the ones most often in a driver's pocket
  A105: 'Galaxy A10', A205: 'Galaxy A20', A305: 'Galaxy A30', A505: 'Galaxy A50', A507: 'Galaxy A50s',
  A705: 'Galaxy A70',
  A015: 'Galaxy A01', A115: 'Galaxy A11', A215: 'Galaxy A21', A217: 'Galaxy A21s', A315: 'Galaxy A31',
  A515: 'Galaxy A51', A516: 'Galaxy A51 5G', A715: 'Galaxy A71', A716: 'Galaxy A71 5G',
  A022: 'Galaxy A02', A025: 'Galaxy A02s', A125: 'Galaxy A12', A127: 'Galaxy A12',
  A225: 'Galaxy A22', A226: 'Galaxy A22 5G', A325: 'Galaxy A32', A326: 'Galaxy A32 5G',
  A525: 'Galaxy A52', A526: 'Galaxy A52 5G', A528: 'Galaxy A52s 5G', A725: 'Galaxy A72',
  A035: 'Galaxy A03', A037: 'Galaxy A03s', A135: 'Galaxy A13', A136: 'Galaxy A13 5G',
  A235: 'Galaxy A23', A236: 'Galaxy A23 5G', A336: 'Galaxy A33 5G', A536: 'Galaxy A53 5G', A736: 'Galaxy A73 5G',
  A045: 'Galaxy A04', A047: 'Galaxy A04s', A145: 'Galaxy A14', A146: 'Galaxy A14 5G',
  A245: 'Galaxy A24', A346: 'Galaxy A34 5G', A546: 'Galaxy A54 5G',
  A055: 'Galaxy A05', A057: 'Galaxy A05s', A155: 'Galaxy A15', A156: 'Galaxy A15 5G',
  A256: 'Galaxy A25 5G', A356: 'Galaxy A35 5G', A556: 'Galaxy A55 5G',
  A065: 'Galaxy A06', A165: 'Galaxy A16', A166: 'Galaxy A16 5G',
  A266: 'Galaxy A26 5G', A366: 'Galaxy A36 5G', A566: 'Galaxy A56 5G',

  // Galaxy Tab
  T220: 'Galaxy Tab A7 Lite', T225: 'Galaxy Tab A7 Lite', T500: 'Galaxy Tab A7', T505: 'Galaxy Tab A7',
  P610: 'Galaxy Tab S6 Lite', P615: 'Galaxy Tab S6 Lite',
  X200: 'Galaxy Tab A8', X205: 'Galaxy Tab A8', X110: 'Galaxy Tab A9', X115: 'Galaxy Tab A9',
  X210: 'Galaxy Tab A9+', X216: 'Galaxy Tab A9+',
  X700: 'Galaxy Tab S8', X706: 'Galaxy Tab S8', X800: 'Galaxy Tab S8+', X806: 'Galaxy Tab S8+',
  X900: 'Galaxy Tab S8 Ultra', X906: 'Galaxy Tab S8 Ultra',
  X710: 'Galaxy Tab S9', X716: 'Galaxy Tab S9', X810: 'Galaxy Tab S9+', X816: 'Galaxy Tab S9+',
  X910: 'Galaxy Tab S9 Ultra', X916: 'Galaxy Tab S9 Ultra', X510: 'Galaxy Tab S9 FE', X516: 'Galaxy Tab S9 FE',
};

/** "SM-S918B" → "Samsung Galaxy S23 Ultra"; '' for a code not in the list. */
export function samsungModelName(code: string): string {
  const m = /^SM-([A-Z]\d{3})/i.exec(code.trim());
  const name = m ? SAMSUNG_MODELS[m[1].toUpperCase()] : undefined;
  return name ? `Samsung ${name}` : '';
}
