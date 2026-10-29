import type { DriverStep } from '@/types/driverLink';
import type { PhotoStage } from '@/types/loadPhoto';

/**
 * Everything the driver page says, in English and Spanish. Written by hand,
 * for the same reason the glossary is: a machine would get "consignee" and
 * "BOL" wrong, and a driver standing at a dock door has no time to puzzle
 * out a bad translation.
 *
 * English is the default; the choice is kept per phone in localStorage.
 */

export type Lang = 'en' | 'es';
export const LANG_KEY = 'ttms.driver.lang';

const en = {
  brand: 'Total Transport Logistics',
  title: 'Driver updates',
  load: 'Load',
  switchLang: 'Español',
  pickup: 'Pickup',
  delivery: 'Delivery',
  directions: 'Directions',
  freight: 'Freight',
  steps: 'Trip',
  stepsHint: 'Tap each step when it happens. Your location is sent with it if your phone allows.',
  step: {
    arrived_pickup: 'Arrived at pickup',
    picked_up: 'Loaded / picked up',
    in_transit: 'In transit',
    arrived_delivery: 'Arrived at delivery',
    delivered: 'Delivered',
  } satisfies Record<DriverStep, string>,
  deliveredNeedsPhoto: 'Delivered needs a picture of the freight at the door or of the signed delivery receipt.',
  takePhoto: 'Take picture',
  choosePhoto: 'Choose from phone',
  confirmDelivered: 'Send Delivered',
  cancel: 'Cancel',
  sending: 'Sending…',
  done: 'Done',
  sendLocation: 'Send my location',
  locationSent: 'Location sent',
  locationHelp: 'Sends where you are right now. Dispatch sees it on a map.',
  noLocation: 'Your phone did not share a location. Allow location for this site in your browser settings and try again.',
  pictures: 'Pictures',
  picturesHint: 'Freight, the truck, the dock, any damage. They go straight to dispatch.',
  addPictures: 'Add pictures',
  photoType: 'What is it?',
  photoStage: {
    commodity: 'Freight', truck: 'Truck / trailer', location: 'Place / dock', proof: 'Damage / problem', other: 'Other',
  } satisfies Record<PhotoStage, string>,
  caption: 'Note (optional)',
  uploaded: (n: number) => `${n} picture${n === 1 ? '' : 's'} sent`,
  payment: 'Payment',
  paidDriver: 'I got paid',
  paidDriverHint: 'Once you have been paid for this load, send proof: a screenshot of the transfer, a picture of the check or a PDF.',
  paidCod: 'The client paid me in full (COD)',
  paidCodHint: 'This is a COD load: the client pays you at delivery. Once they have, send proof — a picture of the payment or the receipt.',
  codCollect: (amount: string) => `Collect on delivery: ${amount}`,
  attachProof: 'Attach proof (picture or PDF)',
  sendProof: 'Send',
  recorded: 'Recorded',
  recordedOn: (when: string) => `Recorded ${when}`,
  waitDelivered: 'Available once the load is delivered.',
  // Verify
  verifyTitle: 'Confirm it is you',
  verifyBody: 'Type the phone number dispatch has for you on this load.',
  phone: 'Phone number',
  continue: 'Continue',
  checking: 'Checking…',
  wrong: (left: number) => `That number does not match this load. ${left} ${left === 1 ? 'try' : 'tries'} left.`,
  locked: 'Too many tries. Please call dispatch for a new link.',
  phoneRequired: 'Type your phone number.',
  // Errors
  problem: {
    missing: 'This link is not valid. Please call dispatch.',
    revoked: 'This link is no longer active. Dispatch may have sent you a new one.',
    expired: 'This link has expired. Please call dispatch for a new one.',
    carrier_changed: 'This load has been moved to another carrier. This link no longer works.',
    cancelled: 'This load was cancelled. Please call dispatch.',
  },
  network: 'Could not reach the server. Check your signal and try again.',
  failed: 'Something went wrong. Please try again.',
  proofRequired: 'Attach the proof first.',
  tooBig: 'That file is too large. Send a picture or a smaller PDF.',
  notMoved: 'Recorded. Dispatch will update the status.',
};

export type Strings = typeof en;

const es: Strings = {
  brand: 'Total Transport Logistics',
  title: 'Actualizaciones del chofer',
  load: 'Carga',
  switchLang: 'English',
  pickup: 'Recogida',
  delivery: 'Entrega',
  directions: 'Cómo llegar',
  freight: 'Mercancía',
  steps: 'Viaje',
  stepsHint: 'Toque cada paso cuando ocurra. Si su teléfono lo permite, se envía su ubicación.',
  step: {
    arrived_pickup: 'Llegué a la recogida',
    picked_up: 'Cargado / recogido',
    in_transit: 'En camino',
    arrived_delivery: 'Llegué a la entrega',
    delivered: 'Entregado',
  },
  deliveredNeedsPhoto: 'Para marcar Entregado necesita una foto de la mercancía entregada o del recibo de entrega firmado.',
  takePhoto: 'Tomar foto',
  choosePhoto: 'Elegir del teléfono',
  confirmDelivered: 'Enviar Entregado',
  cancel: 'Cancelar',
  sending: 'Enviando…',
  done: 'Listo',
  sendLocation: 'Enviar mi ubicación',
  locationSent: 'Ubicación enviada',
  locationHelp: 'Envía dónde está ahora mismo. Despacho la ve en un mapa.',
  noLocation: 'Su teléfono no compartió la ubicación. Permita la ubicación para este sitio en la configuración del navegador e intente de nuevo.',
  pictures: 'Fotos',
  picturesHint: 'La mercancía, el camión, el muelle, cualquier daño. Llegan directo a despacho.',
  addPictures: 'Agregar fotos',
  photoType: '¿Qué es?',
  photoStage: {
    commodity: 'Mercancía', truck: 'Camión / tráiler', location: 'Lugar / muelle', proof: 'Daño / problema', other: 'Otro',
  },
  caption: 'Nota (opcional)',
  uploaded: (n: number) => `${n} foto${n === 1 ? '' : 's'} enviada${n === 1 ? '' : 's'}`,
  payment: 'Pago',
  paidDriver: 'Ya me pagaron',
  paidDriverHint: 'Cuando le hayan pagado esta carga, envíe el comprobante: captura de la transferencia, foto del cheque o un PDF.',
  paidCod: 'El cliente me pagó completo (COD)',
  paidCodHint: 'Esta es una carga COD: el cliente le paga a usted en la entrega. Cuando le pague, envíe el comprobante — una foto del pago o del recibo.',
  codCollect: (amount: string) => `Cobrar en la entrega: ${amount}`,
  attachProof: 'Adjuntar comprobante (foto o PDF)',
  sendProof: 'Enviar',
  recorded: 'Registrado',
  recordedOn: (when: string) => `Registrado ${when}`,
  waitDelivered: 'Disponible cuando la carga esté entregada.',
  verifyTitle: 'Confirme que es usted',
  verifyBody: 'Escriba el número de teléfono que despacho tiene para usted en esta carga.',
  phone: 'Número de teléfono',
  continue: 'Continuar',
  checking: 'Verificando…',
  wrong: (left: number) => `Ese número no coincide con esta carga. Le quedan ${left} ${left === 1 ? 'intento' : 'intentos'}.`,
  locked: 'Demasiados intentos. Llame a despacho para pedir un enlace nuevo.',
  phoneRequired: 'Escriba su número de teléfono.',
  problem: {
    missing: 'Este enlace no es válido. Llame a despacho.',
    revoked: 'Este enlace ya no está activo. Es posible que despacho le haya enviado uno nuevo.',
    expired: 'Este enlace venció. Llame a despacho para pedir uno nuevo.',
    carrier_changed: 'Esta carga pasó a otro transportista. Este enlace ya no funciona.',
    cancelled: 'Esta carga fue cancelada. Llame a despacho.',
  },
  network: 'No se pudo conectar. Revise su señal e intente de nuevo.',
  failed: 'Algo salió mal. Intente de nuevo.',
  proofRequired: 'Adjunte el comprobante primero.',
  tooBig: 'El archivo es muy grande. Envíe una foto o un PDF más pequeño.',
  notMoved: 'Registrado. Despacho actualizará el estado.',
};

export const STRINGS: Record<Lang, Strings> = { en, es };

/** The page's error keys, as the API returns them, in the driver's words. */
export function errorText(t: Strings, key: unknown): string {
  if (typeof key !== 'string' || !key) return t.failed;
  if (key in t.problem) return t.problem[key as keyof Strings['problem']];
  if (key === 'locked') return t.locked;
  if (key === 'no_location') return t.noLocation;
  if (key === 'proof_required') return t.proofRequired;
  if (key === 'phone_required') return t.phoneRequired;
  // Anything else is already a sentence, in English, from the server.
  return key;
}
