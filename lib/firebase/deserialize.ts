import { Timestamp } from 'firebase/firestore';

// Firestore Admin timestamps become plain {_seconds, _nanoseconds} objects
// when NextResponse serializes API responses. Restore the client SDK type.
export function restoreTimestamps<T>(value: T): T {
  if (Array.isArray(value)) return value.map(restoreTimestamps) as T;
  if (value && typeof value === 'object') {
    const data = value as Record<string, unknown>;
    if (typeof data._seconds === 'number' && typeof data._nanoseconds === 'number' && Object.keys(data).length === 2) {
      return new Timestamp(data._seconds, data._nanoseconds) as T;
    }
    return Object.fromEntries(Object.entries(data).map(([key, nested]) => [key, restoreTimestamps(nested)])) as T;
  }
  return value;
}
