import { VectorValue } from '@google-cloud/firestore';
import { FieldValue, Timestamp, GeoPoint, DocumentReference, type Firestore } from 'firebase-admin/firestore';

/** Explicit tags prevent application maps from colliding with serialized SDK values. */
export type Encoded = { t: 'null' } | { t: 'boolean'; v: boolean } | { t: 'string'; v: string }
  | { t: 'number'; v: string } | { t: 'integer'; v: string } | { t: 'timestamp'; seconds: number; nanoseconds: number }
  | { t: 'bytes'; v: string } | { t: 'geopoint'; latitude: number; longitude: number }
  | { t: 'vector'; v: number[] } | { t: 'reference'; path: string } | { t: 'array'; v: Encoded[] }
  | { t: 'map'; v: [string, Encoded][] };
export function encode(value: unknown): Encoded {
  if (value === null) return { t: 'null' };
  if (typeof value === 'boolean') return { t: 'boolean', v: value };
  if (typeof value === 'string') return { t: 'string', v: value };
  if (typeof value === 'bigint') return { t: 'integer', v: value.toString() };
  if (typeof value === 'number' && Number.isInteger(value) && !Number.isSafeInteger(value)) throw new Error('Unsafe numeric integer; configure Firestore useBigInt:true');
  if (typeof value === 'number') return { t: 'number', v: Object.is(value, -0) ? '-0' : String(value) };
  if (value instanceof Timestamp) return { t: 'timestamp', seconds: value.seconds, nanoseconds: value.nanoseconds };
  if (value instanceof Date) return encode(Timestamp.fromDate(value));
  if (value instanceof VectorValue) return { t: 'vector', v: value.toArray() };
  if (value instanceof GeoPoint) return { t: 'geopoint', latitude: value.latitude, longitude: value.longitude };
  if (value instanceof DocumentReference) return { t: 'reference', path: value.path };
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) return { t: 'bytes', v: Buffer.from(value).toString('base64') };
  if (Array.isArray(value)) return { t: 'array', v: value.map(encode) };
  if (value && typeof value === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    return { t: 'map', v: Object.keys(value).sort().map(k => [k, encode((value as Record<string, unknown>)[k])]) };
  }
  throw new Error('Unsupported Firestore value; archive aborted rather than losing its type');
}
export function decode(value: Encoded, db?: Firestore): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid encoded value');
  const fields: Record<Encoded['t'], string[]> = { null:['t'], boolean:['t','v'], string:['t','v'], number:['t','v'], integer:['t','v'], timestamp:['t','seconds','nanoseconds'], bytes:['t','v'], geopoint:['t','latitude','longitude'], vector:['t','v'], reference:['t','path'], array:['t','v'], map:['t','v'] };
  const expected = fields[value.t];
  if (!expected || Object.keys(value).length !== expected.length || Object.keys(value).some(key => !expected.includes(key))) throw new Error('Invalid encoded fields');
  switch (value.t) {
    case 'null': return null;
    case 'boolean': if (typeof value.v !== 'boolean') break; return value.v;
    case 'string': if (typeof value.v !== 'string') break; return value.v;
    case 'integer': {
      if (typeof value.v !== 'string' || !/^-?(?:0|[1-9]\d*)$/.test(value.v)) break;
      const n = BigInt(value.v); if (n.toString() !== value.v || n < BigInt('-9223372036854775808') || n > BigInt('9223372036854775807')) break; return n;
    }
    case 'number': {
      if (typeof value.v !== 'string') break;
      const n = Number(value.v);
      if ((Object.is(n,-0) ? '-0' : String(n)) !== value.v || (Number.isInteger(n) && !Number.isSafeInteger(n))) break;
      return n;
    }
    case 'timestamp': if (!Number.isInteger(value.seconds) || !Number.isInteger(value.nanoseconds)) break; return new Timestamp(value.seconds, value.nanoseconds);
    case 'bytes': if (typeof value.v !== 'string' || Buffer.from(value.v, 'base64').toString('base64') !== value.v) break; return Buffer.from(value.v, 'base64');
    case 'geopoint': if (typeof value.latitude !== 'number' || typeof value.longitude !== 'number') break; return new GeoPoint(value.latitude, value.longitude);
    case 'vector': if (!Array.isArray(value.v) || value.v.some(n => typeof n !== 'number' || !Number.isFinite(n))) break; return FieldValue.vector(value.v);
    case 'reference': if (typeof value.path !== 'string' || !value.path) break; if (!db) return { referencePath: value.path }; return db.doc(value.path);
    case 'array': if (!Array.isArray(value.v)) break; return value.v.map(v => decode(v, db));
    case 'map': {
      const out: Record<string, unknown> = {};
      if (!Array.isArray(value.v)) break;
      let previous: string | undefined;
      for (const pair of value.v) {
        if (!Array.isArray(pair) || pair.length !== 2) throw new Error('Invalid map pair');
        const [k,v] = pair;
        if (previous !== undefined && previous >= k) throw new Error('Map keys must be canonical');
        previous = k;
        if (typeof k !== 'string' || Object.hasOwn(out, k)) throw new Error('Duplicate/invalid field');
        Object.defineProperty(out, k, { value: decode(v, db), enumerable: true, writable: true, configurable: true });
      }
      return out;
    }
  }
  throw new Error('Invalid encoded value');
}
