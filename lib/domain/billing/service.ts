import { createHash } from 'node:crypto';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { ApiError, type AuthContext } from '@/lib/auth/authenticateRequest';
import { auditRecord, auditRef } from '@/lib/domain/audit';
import { calculateDocumentTotals, generateDocumentNumber, nextSequence, syncLineItemAmount, totalsFields } from '@/lib/billing';
import type { BillingLineItem, IssuedDocumentKind, IssuedDocumentStatus, TaxType } from '@/types';

const KINDS: IssuedDocumentKind[] = ['estimate', 'invoice', 'receipt'];
const STATUSES: IssuedDocumentStatus[] = ['draft', 'issued', 'sent', 'paid', 'cancelled'];
const TAX_TYPES: TaxType[] = ['standard10', 'reduced8', 'exempt', 'non_taxable', 'export'];
function user(auth: AuthContext) { return getFirestore().collection('users').doc(auth.userId); }
function col(auth: AuthContext) { return user(auth).collection('issuedDocuments'); }

export function normalizeLineItems(raw: unknown): BillingLineItem[] {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 100) throw new ApiError('INVALID_LINE_ITEMS', 400);
  return raw.map((item, index) => {
    if (!item || typeof item !== 'object') throw new ApiError('INVALID_LINE_ITEM', 400);
    const row = item as Record<string, unknown>;
    const quantity = Number(row.quantity ?? 1), unitPrice = Number(row.unitPrice ?? 0);
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0 ||
        !TAX_TYPES.includes(row.taxType as TaxType) || !String(row.description ?? '').trim()) throw new ApiError('INVALID_LINE_ITEM', 400);
    if (row.priceMode !== undefined && !['exclusive', 'inclusive'].includes(String(row.priceMode))) throw new ApiError('INVALID_PRICE_MODE', 400);
    return syncLineItemAmount({ id: String(row.id ?? `line-${index + 1}`), description: String(row.description).trim(),
      quantity, unitPrice, taxType: row.taxType as TaxType, priceMode: row.priceMode === 'inclusive' ? 'inclusive' : 'exclusive',
      withholding: Boolean(row.withholding) });
  });
}
function validDate(value: unknown) {
  const date = String(value ?? '');
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) throw new ApiError('INVALID_DATE', 400);
  return date;
}
export async function searchBillingDocuments(auth: AuthContext, filters: { id?: string; projectId?: string; kind?: string; status?: string } = {}) {
  if (filters.id) {
    const snap = await col(auth).doc(filters.id).get();
    if (!snap.exists || snap.data()?.isDeleted) throw new ApiError('DOCUMENT_NOT_FOUND', 404);
    return { document: { id: snap.id, ...snap.data() } };
  }
  const snap = await col(auth).where('isDeleted', '==', false).orderBy('issueDate', 'desc').limit(500).get();
  return { documents: snap.docs.map((d) => ({ id: d.id, ...d.data() } as Record<string, unknown>)).filter((d) =>
    (!filters.projectId || d.projectId === filters.projectId) && (!filters.kind || d.kind === filters.kind) &&
    (!filters.status || d.status === filters.status)) };
}
export async function createBillingDocument(auth: AuthContext, body: Record<string, unknown>) {
  const kind = body.kind as IssuedDocumentKind;
  if (!KINDS.includes(kind)) throw new ApiError('INVALID_DOCUMENT_KIND', 400);
  const projectId = String(body.projectId ?? '');
  if (!projectId) throw new ApiError('PROJECT_REQUIRED', 400);
  const issueDate = validDate(body.issueDate);
  if (body.dueDate) validDate(body.dueDate);
  const lineItems = normalizeLineItems(body.lineItems);
  const totals = calculateDocumentTotals(lineItems);
  const status = auth.actorType === 'agent' ? 'draft' : (body.status ?? 'draft');
  if (auth.actorType === 'agent' && body.status !== undefined && body.status !== 'draft') throw new ApiError('STATUS_DENIED', 403);
  if (!STATUSES.includes(status as IssuedDocumentStatus)) throw new ApiError('INVALID_DOCUMENT_STATUS', 400);
  const key = body.idempotencyKey;
  if (key !== undefined && (typeof key !== 'string' || key.length < 1 || key.length > 200)) throw new ApiError('INVALID_IDEMPOTENCY_KEY', 400);
  const idemRef = key ? user(auth).collection('idempotency').doc(createHash('sha256').update(`${auth.userId}\0billing:create\0${key}`).digest('hex')) : null;
  const payloadHash = createHash('sha256').update(JSON.stringify({ kind, projectId, issueDate, dueDate: body.dueDate ?? '', lineItems,
    title: body.title ?? '', notes: body.notes ?? '' })).digest('hex');
  if (idemRef) {
    const existing = await idemRef.get();
    if (existing.exists) {
      if (existing.data()?.payloadHash !== payloadHash) throw new ApiError('IDEMPOTENCY_CONFLICT', 409);
      return { id: String(existing.data()?.id), documentNumber: String(existing.data()?.documentNumber), status: 'existing' as const };
    }
  }
  const projectSnap = await user(auth).collection('projects').doc(projectId).get();
  if (!projectSnap.exists || projectSnap.data()?.isDeleted) throw new ApiError('PROJECT_NOT_FOUND', 404);
  const project = projectSnap.data()!;
  const customerSnap = await user(auth).collection('customers').doc(project.customerId).get();
  if (!customerSnap.exists || customerSnap.data()?.isDeleted) throw new ApiError('CUSTOMER_NOT_FOUND', 404);
  const existingSnap = await col(auth).where('kind', '==', kind).where('isDeleted', '==', false).limit(500).get();
  const existingNumbers = existingSnap.docs.map((d) => String(d.data().documentNumber ?? ''));
  const counterRef = user(auth).collection('billingCounters').doc(`${kind}_${issueDate.slice(0, 7)}`);
  const ref = col(auth).doc();
  const logRef = auditRef(auth);
  return getFirestore().runTransaction(async (tx) => {
    if (idemRef) {
      const prev = await tx.get(idemRef);
      if (prev.exists) {
        if (prev.data()?.payloadHash !== payloadHash) throw new ApiError('IDEMPOTENCY_CONFLICT', 409);
        return { id: String(prev.data()?.id), documentNumber: String(prev.data()?.documentNumber), status: 'existing' as const };
      }
    }
    const counter = await tx.get(counterRef);
    const sequence = Math.max(nextSequence(kind, issueDate, existingNumbers), Number(counter.data()?.last ?? 0) + 1);
    const documentNumber = auth.actorType === 'user' && typeof body.documentNumber === 'string' && body.documentNumber.trim()
      ? body.documentNumber.trim() : generateDocumentNumber(kind, issueDate, sequence);
    const now = FieldValue.serverTimestamp();
    tx.set(counterRef, { last: sequence });
    const document = { id: ref.id, kind, documentNumber, projectId, projectName: project.name,
      customerId: project.customerId, customerName: customerSnap.data()?.name ?? project.customerName,
      customerAddress: customerSnap.data()?.address ?? '', issueDate, dueDate: body.dueDate ?? '',
      title: String(body.title ?? ''), lineItems, ...totalsFields(totals), notes: String(body.notes ?? ''),
      status, linkedJournalIds: [], postedToAccounting: false,
      sourceDocumentId: auth.actorType === 'user' ? body.sourceDocumentId ?? null : null,
      isDeleted: false, createdAt: now, updatedAt: now, createdBy: auth.userId, updatedBy: auth.userId,
      agentConnectionId: auth.actorType === 'agent' ? auth.actorId : null };
    tx.create(ref, document);
    tx.create(logRef, { id: logRef.id, ...auditRecord(auth, 'issuedDocuments', ref.id, 'CREATE', undefined, document) });
    if (idemRef) tx.create(idemRef, { id: ref.id, documentNumber, payloadHash, createdAt: now });
    return { id: ref.id, documentNumber, status: 'created' as const };
  });
}
export async function updateBillingDocument(auth: AuthContext, id: string, body: Record<string, unknown>) {
  if (!body || typeof body !== 'object') throw new ApiError('INVALID_UPDATE', 400);
  if (auth.actorType === 'agent' && body.status !== undefined) throw new ApiError('STATUS_DENIED', 403);
  const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp(), updatedBy: auth.userId };
  for (const field of ['title', 'issueDate', 'dueDate', 'notes', 'customerAddress']) {
    if (body[field] !== undefined) patch[field] = field === 'issueDate' || field === 'dueDate' && body[field] ? validDate(body[field]) : String(body[field]);
  }
  if (auth.actorType === 'user' && body.documentNumber !== undefined) patch.documentNumber = String(body.documentNumber);
  if (auth.actorType === 'user' && body.status !== undefined) {
    if (!STATUSES.includes(body.status as IssuedDocumentStatus)) throw new ApiError('INVALID_DOCUMENT_STATUS', 400);
    patch.status = body.status;
  }
  if (body.lineItems !== undefined) {
    const lineItems = normalizeLineItems(body.lineItems);
    patch.lineItems = lineItems; Object.assign(patch, totalsFields(calculateDocumentTotals(lineItems)));
  }
  // 案件の付け替え。顧客情報は案件から引き直す（明示された宛先住所は優先）。
  const projectId = body.projectId === undefined ? undefined : String(body.projectId ?? '').trim();
  if (projectId !== undefined && !projectId) throw new ApiError('PROJECT_REQUIRED', 400);
  const projectRef = projectId ? user(auth).collection('projects').doc(projectId) : null;
  const ref = col(auth).doc(id); const log = auditRef(auth);
  await getFirestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data()?.isDeleted) throw new ApiError('DOCUMENT_NOT_FOUND', 404);
    if (auth.actorType === 'agent' && snap.data()?.status !== 'draft') throw new ApiError('NOT_DRAFT', 409);
    if (projectRef && projectId !== snap.data()?.projectId) {
      const project = await tx.get(projectRef);
      if (!project.exists || project.data()?.isDeleted) throw new ApiError('PROJECT_NOT_FOUND', 404);
      const customer = await tx.get(user(auth).collection('customers').doc(String(project.data()?.customerId ?? '')));
      if (!customer.exists || customer.data()?.isDeleted) throw new ApiError('CUSTOMER_NOT_FOUND', 404);
      Object.assign(patch, { projectId, projectName: project.data()?.name ?? '', customerId: project.data()?.customerId,
        customerName: customer.data()?.name ?? project.data()?.customerName ?? '',
        customerAddress: body.customerAddress !== undefined ? String(body.customerAddress) : customer.data()?.address ?? '' });
    }
    tx.update(ref, patch);
    tx.create(log, { id: log.id, ...auditRecord(auth, 'issuedDocuments', id, 'UPDATE', snap.data(), patch) });
  });
}
/** エージェントは会計連携されていない下書きのみ削除できる。 */
export async function deleteBillingDocument(auth: AuthContext, id: string) {
  const ref = col(auth).doc(id); const log = auditRef(auth);
  await getFirestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data()?.isDeleted) throw new ApiError('DOCUMENT_NOT_FOUND', 404);
    if (auth.actorType === 'agent' && (snap.data()?.status !== 'draft' || snap.data()?.postedToAccounting ||
        (snap.data()?.linkedJournalIds ?? []).length > 0)) throw new ApiError('NOT_DRAFT', 409);
    tx.update(ref, { isDeleted: true, updatedAt: FieldValue.serverTimestamp(), updatedBy: auth.userId });
    tx.create(log, { id: log.id, ...auditRecord(auth, 'issuedDocuments', id, 'DELETE', snap.data()) });
  });
}
