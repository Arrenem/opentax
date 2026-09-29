import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { ApiError, type AuthContext } from '@/lib/auth/authenticateRequest';
import { idempotentCreate } from '@/lib/domain/idempotency';
import { auditRecord, auditRef } from '@/lib/domain/audit';

const FIELDS = ['name', 'nameKana', 'address', 'email', 'phone', 'invoiceRegistrationNumber', 'note'] as const;
function col(userId: string) { return getFirestore().collection('users').doc(userId).collection('customers'); }
function clean(body: Record<string, unknown>, partial = false) {
  const result: Record<string, string> = {};
  for (const key of FIELDS) {
    if (body[key] !== undefined || !partial) {
      if (body[key] !== undefined && typeof body[key] !== 'string') throw new ApiError('INVALID_CUSTOMER', 400);
      result[key] = String(body[key] ?? '').trim();
    }
  }
  if (!partial && !result.name || partial && 'name' in result && !result.name) throw new ApiError('NAME_REQUIRED', 400);
  return result;
}
export async function searchCustomers(auth: AuthContext, query = '') {
  const snap = await col(auth.userId).where('isDeleted', '==', false).orderBy('name', 'asc').limit(500).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Record<string, unknown>)).filter((c) => !query || String(c.name).toLowerCase().includes(query.toLowerCase()));
}
export async function createCustomer(auth: AuthContext, body: Record<string, unknown>) {
  return idempotentCreate(auth, 'customers:create', body.idempotencyKey as string | undefined,
    { ...clean(body), isDeleted: false }, 'customers');
}
export async function updateCustomer(auth: AuthContext, id: string, body: Record<string, unknown>) {
  const ref = col(auth.userId).doc(id); const snap = await ref.get();
  if (!snap.exists || snap.data()?.isDeleted) throw new ApiError('CUSTOMER_NOT_FOUND', 404);
  const patch = { ...clean(body, true), updatedAt: FieldValue.serverTimestamp() };
  const batch = getFirestore().batch(); const log = auditRef(auth);
  batch.update(ref, patch); batch.set(log, { id: log.id, ...auditRecord(auth, 'customers', id, 'UPDATE', snap.data(), patch) });
  await batch.commit();
}
export async function deleteCustomer(auth: AuthContext, id: string) {
  const ref = col(auth.userId).doc(id); const snap = await ref.get();
  if (!snap.exists || snap.data()?.isDeleted) throw new ApiError('CUSTOMER_NOT_FOUND', 404);
  const batch = getFirestore().batch(); const log = auditRef(auth);
  batch.update(ref, { isDeleted: true, updatedAt: FieldValue.serverTimestamp() });
  batch.set(log, { id: log.id, ...auditRecord(auth, 'customers', id, 'DELETE', snap.data()) });
  await batch.commit();
}
