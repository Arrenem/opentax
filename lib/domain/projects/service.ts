import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { ApiError, type AuthContext } from '@/lib/auth/authenticateRequest';
import { idempotentCreate, findExistingCreate } from '@/lib/domain/idempotency';
import { auditRecord, auditRef } from '@/lib/domain/audit';
import type { ProjectStatus } from '@/types';

function col(userId: string) { return getFirestore().collection('users').doc(userId).collection('projects'); }
function customers(userId: string) { return getFirestore().collection('users').doc(userId).collection('customers'); }
const STATUSES: ProjectStatus[] = ['active', 'completed', 'cancelled'];
function clean(body: Record<string, unknown>, partial = false) {
  const result: Record<string, unknown> = {};
  for (const key of ['name', 'description', 'startDate', 'endDate']) {
    if (body[key] !== undefined || !partial) {
      if (body[key] !== undefined && typeof body[key] !== 'string') throw new ApiError('INVALID_PROJECT', 400);
      result[key] = String(body[key] ?? '').trim();
    }
  }
  if (!partial && !result.name || partial && 'name' in result && !result.name) throw new ApiError('NAME_REQUIRED', 400);
  if (body.status !== undefined || !partial) {
    const status = body.status ?? 'active';
    if (!STATUSES.includes(status as ProjectStatus)) throw new ApiError('INVALID_PROJECT_STATUS', 400);
    result.status = status;
  }
  return result;
}
export async function searchProjects(auth: AuthContext, filters: { customerId?: string; status?: string; query?: string } = {}) {
  const snap = await col(auth.userId).where('isDeleted', '==', false).orderBy('updatedAt', 'desc').limit(500).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Record<string, unknown>)).filter((p) =>
    (!filters.customerId || p.customerId === filters.customerId) && (!filters.status || p.status === filters.status) &&
    (!filters.query || String(p.name).toLowerCase().includes(filters.query.toLowerCase())));
}
export async function getProject(auth: AuthContext, id: string) {
  const snap = await col(auth.userId).doc(id).get();
  if (!snap.exists || snap.data()?.isDeleted) throw new ApiError('PROJECT_NOT_FOUND', 404);
  return { id: snap.id, ...snap.data() };
}
export async function createProject(auth: AuthContext, body: Record<string, unknown>) {
  const customerId = String(body.customerId ?? '');
  if (!customerId) throw new ApiError('CUSTOMER_REQUIRED', 400);
  const fields = clean(body);
  const fingerprint = { ...fields, customerId, isDeleted: false };
  const existing = await findExistingCreate(auth, 'projects:create', body.idempotencyKey as string | undefined, fingerprint);
  if (existing) return existing;
  const customer = await customers(auth.userId).doc(customerId).get();
  if (!customer.exists || customer.data()?.isDeleted) throw new ApiError('CUSTOMER_NOT_FOUND', 404);
  return idempotentCreate(auth, 'projects:create', body.idempotencyKey as string | undefined,
    { ...fields, customerId, customerName: customer.data()?.name, isDeleted: false }, 'projects', fingerprint);
}
export async function updateProject(auth: AuthContext, id: string, body: Record<string, unknown>) {
  const ref = col(auth.userId).doc(id); const snap = await ref.get();
  if (!snap.exists || snap.data()?.isDeleted) throw new ApiError('PROJECT_NOT_FOUND', 404);
  const patch = clean(body, true);
  if (body.customerId !== undefined) {
    const customerId = String(body.customerId);
    const customer = await customers(auth.userId).doc(customerId).get();
    if (!customer.exists || customer.data()?.isDeleted) throw new ApiError('CUSTOMER_NOT_FOUND', 404);
    patch.customerId = customerId; patch.customerName = customer.data()?.name;
  }
  const update = { ...patch, updatedAt: FieldValue.serverTimestamp() };
  const batch = getFirestore().batch(); const log = auditRef(auth);
  batch.update(ref, update); batch.set(log, { id: log.id, ...auditRecord(auth, 'projects', id, 'UPDATE', snap.data(), update) });
  await batch.commit();
}
export async function deleteProject(auth: AuthContext, id: string) {
  const ref = col(auth.userId).doc(id); const snap = await ref.get();
  if (!snap.exists || snap.data()?.isDeleted) throw new ApiError('PROJECT_NOT_FOUND', 404);
  const batch = getFirestore().batch(); const log = auditRef(auth);
  batch.update(ref, { isDeleted: true, updatedAt: FieldValue.serverTimestamp() });
  batch.set(log, { id: log.id, ...auditRecord(auth, 'projects', id, 'DELETE', snap.data()) });
  await batch.commit();
}
