import { createHash } from 'node:crypto';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { ApiError, type AuthContext } from '@/lib/auth/authenticateRequest';
import { auditRecord, auditRef } from '@/lib/domain/audit';
import { idempotencyDocument, payloadDigest } from '@/lib/domain/idempotency';
import type { Document, DocumentType, FileType } from '@/types';

const ALLOWED_TYPES: FileType[] = ['image/jpeg', 'image/png', 'application/pdf'];
const DOCUMENT_TYPES: DocumentType[] = ['credit_card_statement', 'invoice', 'bank_statement', 'receipt', 'other'];
const MAX_BYTES = 10 * 1024 * 1024;

function col(userId: string) { return getFirestore().collection('users').doc(userId).collection('documents'); }

export async function searchEvidence(auth: AuthContext, filters: { counterparty?: string; minAmount?: number; maxAmount?: number }) {
  const snap = await col(auth.userId).where('isDeleted', '==', false).orderBy('uploadedAt', 'desc').limit(200).get();
  const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Document)).filter((d) =>
    (!filters.counterparty || d.counterparty?.toLowerCase().includes(filters.counterparty.toLowerCase())) &&
    (filters.minAmount === undefined || (d.amount ?? 0) >= filters.minAmount) &&
    (filters.maxAmount === undefined || (d.amount ?? 0) <= filters.maxAmount));
  const bucket = getStorage().bucket();
  return Promise.all(docs.map(async (document) => {
    if (!document.fileName?.startsWith(`users/${auth.userId}/documents/`)) return { ...document, storageUrl: '' };
    const [storageUrl] = await bucket.file(document.fileName).getSignedUrl({ action: 'read', expires: Date.now() + 3600000 });
    return { ...document, linkedJournalIds: document.linkedJournalIds ?? [], storageUrl };
  }));
}

export async function uploadEvidence(auth: AuthContext, form: FormData) {
  const file = form.get('file');
  if (!(file instanceof File)) throw new ApiError('FILE_REQUIRED', 400);
  if (!ALLOWED_TYPES.includes(file.type as FileType)) throw new ApiError('UNSUPPORTED_FILE_TYPE', 400);
  if (file.size === 0 || file.size > MAX_BYTES) throw new ApiError('INVALID_FILE_SIZE', 400);
  const documentType = String(form.get('documentType') ?? 'other') as DocumentType;
  if (!DOCUMENT_TYPES.includes(documentType)) throw new ApiError('INVALID_DOCUMENT_TYPE', 400);
  const dateText = form.get('transactionDate');
  let transactionDate: Timestamp | undefined;
  if (dateText) {
    const date = new Date(`${String(dateText)}T00:00:00.000Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateText)) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== String(dateText)) throw new ApiError('INVALID_DATE', 400);
    transactionDate = Timestamp.fromDate(date);
  }
  const amountText = form.get('amount');
  const amount = amountText === null || amountText === '' ? undefined : Number(amountText);
  if (amount !== undefined && (!Number.isFinite(amount) || amount < 0)) throw new ApiError('INVALID_AMOUNT', 400);
  const projectId = String(form.get('projectId') ?? '').trim();
  const idempotencyKey = form.get('idempotencyKey');
  if (idempotencyKey !== null && (typeof idempotencyKey !== 'string' || idempotencyKey.length < 1 || idempotencyKey.length > 200))
    throw new ApiError('INVALID_IDEMPOTENCY_KEY', 400);
  const buffer = Buffer.from(await file.arrayBuffer());
  const payloadHash = payloadDigest({ fileHash: createHash('sha256').update(buffer).digest('hex'), fileType: file.type,
    documentType, transactionDate: String(dateText ?? ''), amount: amount ?? null,
    counterparty: String(form.get('counterparty') ?? '').trim(),
    invoiceRegistrationNumber: String(form.get('invoiceRegistrationNumber') ?? '').trim(), projectId,
    sourceReference: String(form.get('sourceReference') ?? '').trim() });
  const idemRef = idempotencyKey ? idempotencyDocument(auth, 'evidence:create', idempotencyKey) : null;
  if (idemRef) {
    const existing = await idemRef.get();
    if (existing.exists) {
      if (existing.data()?.payloadHash !== payloadHash) throw new ApiError('IDEMPOTENCY_CONFLICT', 409);
      const id = String(existing.data()?.id);
      const [storageUrl] = await getStorage().bucket().file(`users/${auth.userId}/documents/${id}`)
        .getSignedUrl({ action: 'read', expires: Date.now() + 3600000 });
      return { id, storageUrl, status: 'existing' as const };
    }
  }
  if (projectId) {
    const project = await getFirestore().collection('users').doc(auth.userId).collection('projects').doc(projectId).get();
    if (!project.exists || project.data()?.isDeleted) throw new ApiError('PROJECT_NOT_FOUND', 404);
  }
  const ref = col(auth.userId).doc();
  const fileName = `users/${auth.userId}/documents/${ref.id}`;
  const fileRef = getStorage().bucket().file(fileName);
  await fileRef.save(buffer, { contentType: file.type });
  const document = {
    id: ref.id, fileName, originalFileName: file.name.split(/[\\/]/).pop() ?? 'evidence',
    storageUrl: '', fileType: file.type, fileSizeBytes: file.size, documentType,
    ...(transactionDate ? { transactionDate } : {}),
    ...(amount !== undefined ? { amount } : {}),
    counterparty: String(form.get('counterparty') ?? '').trim(),
    invoiceRegistrationNumber: String(form.get('invoiceRegistrationNumber') ?? '').trim(),
    projectId, sourceReference: String(form.get('sourceReference') ?? '').trim(),
    linkedJournalIds: [], uploadedAt: FieldValue.serverTimestamp(), uploadedBy: auth.userId, isDeleted: false,
  };
  let id = ref.id;
  let status: 'created' | 'existing' = 'created';
  try {
    const log = auditRef(auth);
    const result = await getFirestore().runTransaction(async (tx) => {
      if (idemRef) {
        const existing = await tx.get(idemRef);
        if (existing.exists) {
          if (existing.data()?.payloadHash !== payloadHash) throw new ApiError('IDEMPOTENCY_CONFLICT', 409);
          return { id: String(existing.data()?.id), status: 'existing' as const };
        }
      }
      tx.create(ref, document);
      tx.create(log, { id: log.id, ...auditRecord(auth, 'documents', ref.id, 'CREATE', undefined, document) });
      if (idemRef) tx.create(idemRef, { id: ref.id, payloadHash, createdAt: FieldValue.serverTimestamp() });
      return { id: ref.id, status: 'created' as const };
    });
    id = result.id; status = result.status;
    if (status === 'existing') await fileRef.delete().catch(() => undefined);
  } catch (error) { await fileRef.delete().catch(() => undefined); throw error; }
  const [storageUrl] = await getStorage().bucket().file(`users/${auth.userId}/documents/${id}`)
    .getSignedUrl({ action: 'read', expires: Date.now() + 3600000 });
  return { id, storageUrl, status };
}

const EDITABLE_TEXT = ['counterparty', 'invoiceRegistrationNumber', 'sourceReference'] as const;

export async function updateEvidence(auth: AuthContext, id: string, body: Record<string, unknown>) {
  if (!id || !body || typeof body !== 'object') throw new ApiError('INVALID_UPDATE', 400);
  const allowed = new Set<string>(['documentType', 'transactionDate', 'amount', 'projectId', ...EDITABLE_TEXT]);
  if (Object.keys(body).some((key) => !allowed.has(key))) throw new ApiError('INVALID_EVIDENCE_FIELD', 400);
  const patch: Record<string, unknown> = {};
  if (body.documentType !== undefined) {
    if (!DOCUMENT_TYPES.includes(body.documentType as DocumentType)) throw new ApiError('INVALID_DOCUMENT_TYPE', 400);
    patch.documentType = body.documentType;
  }
  // null (or '') clears an optional value.
  if (body.transactionDate !== undefined) {
    const text = body.transactionDate === null ? '' : String(body.transactionDate);
    if (!text) patch.transactionDate = FieldValue.delete();
    else {
      const date = new Date(`${text}T00:00:00.000Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== text) throw new ApiError('INVALID_DATE', 400);
      patch.transactionDate = Timestamp.fromDate(date);
    }
  }
  if (body.amount !== undefined) {
    if (body.amount === null) patch.amount = FieldValue.delete();
    else if (typeof body.amount !== 'number' || !Number.isFinite(body.amount) || body.amount < 0) throw new ApiError('INVALID_AMOUNT', 400);
    else patch.amount = body.amount;
  }
  for (const key of EDITABLE_TEXT) {
    if (body[key] === undefined) continue;
    if (body[key] !== null && typeof body[key] !== 'string') throw new ApiError('INVALID_EVIDENCE_FIELD', 400);
    patch[key] = String(body[key] ?? '').trim();
  }
  const projectId = body.projectId === undefined ? undefined : String(body.projectId ?? '').trim();
  if (projectId !== undefined) patch.projectId = projectId;
  if (Object.keys(patch).length === 0) throw new ApiError('INVALID_UPDATE', 400);
  const ref = col(auth.userId).doc(id);
  const projectRef = projectId ? getFirestore().collection('users').doc(auth.userId).collection('projects').doc(projectId) : null;
  const log = auditRef(auth);
  await getFirestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data()?.isDeleted) throw new ApiError('EVIDENCE_NOT_FOUND', 404);
    if (projectRef) {
      const project = await tx.get(projectRef);
      if (!project.exists || project.data()?.isDeleted) throw new ApiError('PROJECT_NOT_FOUND', 404);
    }
    const update = { ...patch, updatedAt: FieldValue.serverTimestamp(), updatedBy: auth.actorId };
    tx.update(ref, update);
    tx.create(log, { id: log.id, ...auditRecord(auth, 'documents', id, 'UPDATE', snap.data(), update) });
  });
}

/** 証憑は論理削除のみ（ファイルは保存要件のため残す）。仕訳に紐づいている間は削除できない。 */
export async function deleteEvidence(auth: AuthContext, id: string, reason: string) {
  if (!id || typeof reason !== 'string' || !reason.trim()) throw new ApiError('REASON_REQUIRED', 400);
  const ref = col(auth.userId).doc(id);
  const log = auditRef(auth);
  await getFirestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data()?.isDeleted) throw new ApiError('EVIDENCE_NOT_FOUND', 404);
    if ((snap.data()?.linkedJournalIds ?? []).length > 0) throw new ApiError('EVIDENCE_LINKED', 409);
    const update = { isDeleted: true, updatedAt: FieldValue.serverTimestamp(), updatedBy: auth.actorId };
    tx.update(ref, update);
    tx.create(log, { id: log.id, ...auditRecord(auth, 'documents', id, 'DELETE', snap.data(), update, reason.trim()) });
  });
}
