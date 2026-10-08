/**
 * Carrying a record's fields from the browser to a save route as JSON.
 *
 * Orders, parties and carriers used to be written straight from the browser
 * with the client SDK, which takes a Timestamp as a Timestamp. JSON does not:
 * a Timestamp, a Date and the `{_seconds}` shape an API response arrives in
 * all have to survive the trip and land as a real Firestore Timestamp, never
 * as a map with a `seconds` key that no date formatter recognises.
 *
 * Deliberately free of both Firebase SDKs, so the browser and the server can
 * share it — the server hands in its own Timestamp factory.
 */

const TS_KEY = '$ts';

function millisOf(value: unknown): number | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime();
  if (!value || typeof value !== 'object') return null;
  const o = value as Record<string, unknown>;
  if (typeof o.toMillis === 'function') return (o.toMillis as () => number)();
  if (typeof o._seconds === 'number') {
    return o._seconds * 1000 + Math.floor(((o._nanoseconds as number) ?? 0) / 1e6);
  }
  const keys = Object.keys(o);
  if (keys.length === 2 && typeof o.seconds === 'number' && typeof o.nanoseconds === 'number') {
    return o.seconds * 1000 + Math.floor(o.nanoseconds / 1e6);
  }
  return null;
}

/** Browser side: every date-like value becomes `{ $ts: millis }`. */
export function encodeRecordPatch(value: unknown): unknown {
  const ms = millisOf(value);
  if (ms !== null) return { [TS_KEY]: ms };
  if (Array.isArray(value)) return value.map(encodeRecordPatch);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      // undefined is dropped here rather than sent as null: the client SDK
      // refused an undefined field outright, so no caller relies on it.
      if (v !== undefined) out[k] = encodeRecordPatch(v);
    }
    return out;
  }
  return value;
}

/** Server side: `{ $ts: millis }` back into whatever Timestamp the caller makes. */
export function decodeRecordPatch<T>(value: unknown, makeTimestamp: (ms: number) => T): unknown {
  if (Array.isArray(value)) return value.map((v) => decodeRecordPatch(v, makeTimestamp));
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    const keys = Object.keys(o);
    if (keys.length === 1 && keys[0] === TS_KEY && typeof o[TS_KEY] === 'number') {
      return makeTimestamp(o[TS_KEY] as number);
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o)) out[k] = decodeRecordPatch(v, makeTimestamp);
    return out;
  }
  return value;
}
