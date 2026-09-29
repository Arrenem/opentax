import { createHash } from 'node:crypto';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { ApiError } from '@/lib/auth/authenticateRequest';
import type { AuthContext } from '@/lib/auth/authenticateRequest';
import { auditRecord, auditRef } from '@/lib/domain/audit';

export function idempotencyDocument(auth: AuthContext, operation: string, key: string) {
  return getFirestore().collection('users').doc(auth.userId).collection('idempotency')
    .doc(createHash('sha256').update(`${auth.userId}\0${operation}\0${key}`).digest('hex'));
}

export function payloadDigest(payload: Record<string, unknown>) {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export async function findExistingCreate(auth: AuthContext, operation: string, key: string | undefined,
  fingerprint: Record<string, unknown>) {
  if (key === undefined) return null;
  if (typeof key !== 'string' || key.length < 1 || key.length > 200) throw new ApiError('INVALID_IDEMPOTENCY_KEY', 400);
  const snap = await idempotencyDocument(auth, operation, key).get();
  if (!snap.exists) return null;
  if (snap.data()?.payloadHash !== payloadDigest(fingerprint)) throw new ApiError('IDEMPOTENCY_CONFLICT', 409);
  return { id: String(snap.data()?.id), status: 'existing' as const };
}

export async function idempotentCreate(auth: AuthContext, operation: string, key: string | undefined,
  payload: Record<string, unknown>, collectionName: string, fingerprint = payload) {
  const userId = auth.userId;
  if (key !== undefined && (typeof key !== 'string' || key.length < 1 || key.length > 200)) throw new ApiError('INVALID_IDEMPOTENCY_KEY', 400);
  const db = getFirestore();
  const userRef = db.collection('users').doc(userId);
  const ref = userRef.collection(collectionName).doc();
  const logRef = auditRef(auth);
  const idemRef = key ? idempotencyDocument(auth, operation, key) : null;
  const payloadHash = payloadDigest(fingerprint);
  return db.runTransaction(async (tx) => {
    if (idemRef) {
      const prior = await tx.get(idemRef);
      if (prior.exists) {
        if (prior.data()?.payloadHash !== payloadHash) throw new ApiError('IDEMPOTENCY_CONFLICT', 409);
        return { id: String(prior.data()?.id), status: 'existing' as const };
      }
    }
    tx.create(ref, { ...payload, id: ref.id, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    tx.create(logRef, { id: logRef.id, ...auditRecord(auth, collectionName, ref.id, 'CREATE', undefined, payload) });
    if (idemRef) tx.create(idemRef, { id: ref.id, payloadHash, createdAt: FieldValue.serverTimestamp() });
    return { id: ref.id, status: 'created' as const };
  });
}
