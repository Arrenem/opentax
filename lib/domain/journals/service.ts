import { createHash } from 'node:crypto';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { CHART_OF_ACCOUNTS } from '@/lib/accounting/chartOfAccounts';
import { extractTaxAmount, toTaxIncluded } from '@/lib/accounting/consumptionTax';
import { ApiError, type AuthContext } from '@/lib/auth/authenticateRequest';
import { yearRange } from '@/lib/utils/fiscalYears';
import type { AccountCode, JournalEntry, SourceType, TaxType } from '@/types';

const TAX_TYPES: TaxType[] = ['standard10', 'reduced8', 'exempt', 'non_taxable', 'export'];
const SOURCE_TYPES: SourceType[] = ['credit_card', 'bank', 'invoice', 'manual', 'issued_document'];

export interface JournalInput {
  transactionDate: string;
  debitAccount: AccountCode;
  debitAmount: number;
  creditAccount: AccountCode;
  creditAmount: number;
  counterparty: string;
  description: string;
  taxType: TaxType;
  taxIncluded: boolean;
  invoiceRegistrationNumber?: string;
  sourceType?: SourceType;
  sourceReference?: string;
  evidenceIds?: string[];
  reviewNote?: string;
  idempotencyKey?: string;
}

export function normalizeJournal<T extends JournalEntry>(journal: T): T {
  return journal.status === 'auto' ? { ...journal, status: 'pending' } : journal;
}

export function validateJournalInput(raw: unknown): JournalInput & { date: Date; fiscalYear: number; fiscalMonth: number; taxAmount: number } {
  if (!raw || typeof raw !== 'object') throw new ApiError('INVALID_JOURNAL', 400);
  const x = raw as Record<string, unknown>;
  // Accept the existing Web form's serialized Firestore Timestamp as well as YYYY-MM-DD.
  const dateString = typeof x.transactionDate === 'string' ? x.transactionDate :
    typeof (x.transactionDate as Record<string, unknown> | undefined)?.seconds === 'number'
      ? new Date(Number((x.transactionDate as Record<string, unknown>).seconds) * 1000).toISOString().slice(0, 10)
      : typeof (x.transactionDate as Record<string, unknown> | undefined)?._seconds === 'number'
        ? new Date(Number((x.transactionDate as Record<string, unknown>)._seconds) * 1000).toISOString().slice(0, 10) : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) throw new ApiError('INVALID_DATE', 400);
  const date = new Date(`${dateString}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== dateString) throw new ApiError('INVALID_DATE', 400);
  if (typeof x.debitAmount !== 'number' || !Number.isFinite(x.debitAmount) || x.debitAmount <= 0 ||
      typeof x.creditAmount !== 'number' || !Number.isFinite(x.creditAmount) || x.creditAmount <= 0 ||
      x.debitAmount !== x.creditAmount) throw new ApiError('UNBALANCED_JOURNAL', 400);
  if (!Object.prototype.hasOwnProperty.call(CHART_OF_ACCOUNTS, String(x.debitAccount)) ||
      !Object.prototype.hasOwnProperty.call(CHART_OF_ACCOUNTS, String(x.creditAccount))) throw new ApiError('INVALID_ACCOUNT', 400);
  if (!TAX_TYPES.includes(x.taxType as TaxType)) throw new ApiError('INVALID_TAX_TYPE', 400);
  if (x.sourceType !== undefined && !SOURCE_TYPES.includes(x.sourceType as SourceType)) throw new ApiError('INVALID_SOURCE_TYPE', 400);
  if (typeof x.taxIncluded !== 'boolean') throw new ApiError('INVALID_TAX_INCLUDED', 400);
  if (typeof x.counterparty !== 'string' || typeof x.description !== 'string') throw new ApiError('INVALID_DESCRIPTION', 400);
  if (x.evidenceIds !== undefined && (!Array.isArray(x.evidenceIds) || x.evidenceIds.length > 20 || x.evidenceIds.some((id) => typeof id !== 'string' || !id))) throw new ApiError('INVALID_EVIDENCE', 400);
  if (x.idempotencyKey !== undefined && (typeof x.idempotencyKey !== 'string' || x.idempotencyKey.length < 1 || x.idempotencyKey.length > 200)) throw new ApiError('INVALID_IDEMPOTENCY_KEY', 400);
  const taxAmount = x.taxType === 'standard10' || x.taxType === 'reduced8'
    ? x.taxIncluded ? extractTaxAmount(x.debitAmount, x.taxType)
      : toTaxIncluded(x.debitAmount, x.taxType) - x.debitAmount : 0;
  return {
    transactionDate: dateString, date, fiscalYear: date.getUTCFullYear(), fiscalMonth: date.getUTCMonth() + 1,
    debitAccount: x.debitAccount as AccountCode, debitAmount: x.debitAmount,
    creditAccount: x.creditAccount as AccountCode, creditAmount: x.creditAmount,
    counterparty: x.counterparty.trim(), description: x.description.trim(), taxType: x.taxType as TaxType,
    taxIncluded: x.taxIncluded, taxAmount, sourceType: (x.sourceType as SourceType | undefined) ?? 'manual',
    invoiceRegistrationNumber: typeof x.invoiceRegistrationNumber === 'string' ? x.invoiceRegistrationNumber : undefined,
    sourceReference: typeof x.sourceReference === 'string' ? x.sourceReference : undefined,
    evidenceIds: x.evidenceIds as string[] | undefined,
    reviewNote: typeof x.reviewNote === 'string' ? x.reviewNote : undefined,
    idempotencyKey: x.idempotencyKey as string | undefined,
  };
}

function userCol(userId: string, name: string) {
  return getFirestore().collection('users').doc(userId).collection(name);
}

export async function searchJournals(auth: AuthContext, filters: { fiscalYear?: number; fiscalMonth?: number; status?: string } = {}) {
  let query: FirebaseFirestore.Query = userCol(auth.userId, 'journals').where('isDeleted', '==', false).where('isCurrent', '==', true);
  // 年・月はクエリ側で絞る（取得後に絞ると直近500件より古い年が空になる）
  if (filters.fiscalYear) query = query.where('fiscalYear', '==', filters.fiscalYear);
  if (filters.fiscalMonth) query = query.where('fiscalMonth', '==', filters.fiscalMonth);
  if (filters.status === 'pending') query = query.where('status', 'in', ['pending', 'auto']);
  else if (filters.status === 'confirmed') query = query.where('status', '==', 'confirmed');
  const snap = await query.orderBy('transactionDate', 'desc').limit(500).get();
  return snap.docs.map((d) => normalizeJournal({ id: d.id, ...d.data() } as JournalEntry)).filter((j) =>
    (!filters.fiscalYear || j.fiscalYear === filters.fiscalYear) &&
    (!filters.fiscalMonth || j.fiscalMonth === filters.fiscalMonth) &&
    (!filters.status || j.status === filters.status));
}

/** 仕訳が存在する最古の年から現在年（または最新の仕訳年）までを降順で返す */
export async function listJournalYears(auth: AuthContext): Promise<number[]> {
  // isDeleted/isCurrent で絞ると複合インデックスが要るため、自動作成される fiscalYear の単一フィールドインデックスで端を取り、
  // 削除済み・旧版は取得後に除く
  const col = userCol(auth.userId, 'journals');
  const edge = async (dir: 'asc' | 'desc') => {
    const snap = await col.orderBy('fiscalYear', dir).limit(20).get();
    return snap.docs.find((d) => d.get('isDeleted') === false && d.get('isCurrent') === true)?.get('fiscalYear');
  };
  return yearRange(await Promise.all([edge('asc'), edge('desc')]));
}

export async function createJournal(auth: AuthContext, raw: unknown): Promise<{ status: 'created' | 'existing'; journalId: string }> {
  if (auth.actorType === 'agent' && raw && typeof raw === 'object' && 'status' in raw)
    throw new ApiError('STATUS_DENIED', 403);
  const input = validateJournalInput(raw);
  const db = getFirestore();
  const journalRef = userCol(auth.userId, 'journals').doc();
  const auditRef = userCol(auth.userId, 'auditLog').doc();
  const evidenceRefs = Array.from(new Set(input.evidenceIds ?? [])).map((id) => userCol(auth.userId, 'documents').doc(id));
  const keyHash = input.idempotencyKey ? createHash('sha256').update(`${auth.userId}\0journals:create\0${input.idempotencyKey}`).digest('hex') : null;
  const idempotencyRef = keyHash ? userCol(auth.userId, 'idempotency').doc(keyHash) : null;
  const payloadHash = createHash('sha256').update(JSON.stringify({ ...input, date: undefined, idempotencyKey: undefined })).digest('hex');
  return db.runTransaction(async (tx) => {
    if (idempotencyRef) {
      const previous = await tx.get(idempotencyRef);
      if (previous.exists) {
        if (previous.data()?.payloadHash !== payloadHash) throw new ApiError('IDEMPOTENCY_CONFLICT', 409);
        return { status: 'existing' as const, journalId: String(previous.data()?.journalId) };
      }
    }
    const evidenceSnaps = await Promise.all(evidenceRefs.map((ref) => tx.get(ref)));
    if (evidenceSnaps.some((snap) => !snap.exists || snap.data()?.isDeleted || snap.data()?.uploadedBy !== auth.userId)) throw new ApiError('EVIDENCE_NOT_FOUND', 400);
    const now = FieldValue.serverTimestamp();
    const journal = {
      id: journalRef.id, entryNumber: Date.now(), version: 1, isCurrent: true, isDeleted: false,
      transactionDate: Timestamp.fromDate(input.date), fiscalYear: input.fiscalYear, fiscalMonth: input.fiscalMonth,
      debitAccount: input.debitAccount, debitAmount: input.debitAmount,
      creditAccount: input.creditAccount, creditAmount: input.creditAmount,
      counterparty: input.counterparty, description: input.description, taxType: input.taxType,
      taxAmount: input.taxAmount, taxIncluded: input.taxIncluded,
      invoiceRegistrationNumber: input.invoiceRegistrationNumber ?? '', isQualifiedInvoice: false,
      sourceType: input.sourceType, sourceReference: input.sourceReference ?? '', evidenceIds: input.evidenceIds ?? [],
      reviewNote: input.reviewNote ?? '', status: auth.actorType === 'agent' ? 'pending' : 'confirmed',
      entryOrigin: auth.actorType === 'agent' ? 'agent' : 'manual',
      agentConnectionId: auth.actorType === 'agent' ? auth.actorId : null,
      createdAt: now, updatedAt: now, createdBy: auth.actorId, updatedBy: auth.actorId,
    };
    tx.set(journalRef, journal);
    tx.set(auditRef, { id: auditRef.id, journalId: journalRef.id, operationType: 'CREATE', operationDatetime: now,
      operatorId: auth.actorId, actorType: auth.actorType, actorId: auth.actorId,
      agentConnectionId: auth.actorType === 'agent' ? auth.actorId : null, newValues: journal });
    evidenceRefs.forEach((ref) => tx.update(ref, { linkedJournalIds: FieldValue.arrayUnion(journalRef.id) }));
    if (idempotencyRef) tx.create(idempotencyRef, { payloadHash, journalId: journalRef.id, createdAt: now });
    return { status: 'created' as const, journalId: journalRef.id };
  });
}

export async function createJournalBatch(auth: AuthContext, journals: unknown[]) {
  if (!Array.isArray(journals) || journals.length < 1 || journals.length > 200) throw new ApiError('INVALID_BATCH_SIZE', 400);
  const results: Array<{ index: number; status: 'created' | 'existing' | 'failed'; journalId?: string; error?: { code: string; message: string } }> = new Array(journals.length);
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < journals.length) {
      const index = nextIndex++;
      try { results[index] = { index, ...(await createJournal(auth, journals[index])) }; }
      catch (error) { results[index] = { index, status: 'failed', error: {
        code: error instanceof ApiError ? error.code : 'WRITE_FAILED',
        message: error instanceof Error ? error.message : 'Write failed' } }; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(10, journals.length) }, worker));
  return results;
}

export async function updateJournal(auth: AuthContext, journalId: string, raw: Record<string, unknown>, reason: string) {
  if (!journalId || !reason?.trim() || !raw || typeof raw !== 'object') throw new ApiError('INVALID_UPDATE', 400);
  const ref = userCol(auth.userId, 'journals').doc(journalId);
  const auditRef = userCol(auth.userId, 'auditLog').doc();
  const db = getFirestore();
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data()?.isDeleted) throw new ApiError('JOURNAL_NOT_FOUND', 404);
    const previous = snap.data() as JournalEntry;
    if (auth.actorType === 'agent' && previous.status !== 'pending' && previous.status !== 'auto') throw new ApiError('CONFIRMED_JOURNAL', 409);
    if (auth.actorType === 'agent' && raw.status !== undefined) throw new ApiError('STATUS_DENIED', 403);
    const allowed = ['transactionDate', 'debitAccount', 'debitAmount', 'creditAccount', 'creditAmount', 'counterparty', 'description', 'taxType', 'taxIncluded', 'invoiceRegistrationNumber', 'sourceType', 'sourceReference', 'evidenceIds', 'reviewNote'];
    const merged: Record<string, unknown> = { ...previous };
    for (const key of allowed) if (raw[key] !== undefined) merged[key] = raw[key];
    if (raw.status === 'confirmed' && auth.actorType === 'user') merged.status = 'confirmed';
    const input = validateJournalInput({ ...merged, transactionDate: merged.transactionDate === previous.transactionDate ? previous.transactionDate.toDate().toISOString().slice(0, 10) : merged.transactionDate });
    const previousEvidence = previous.evidenceIds ?? [];
    const nextEvidence = input.evidenceIds ?? [];
    const evidenceRefs = Array.from(new Set([...previousEvidence, ...nextEvidence])).map((id) => userCol(auth.userId, 'documents').doc(id));
    const evidenceSnaps = await Promise.all(evidenceRefs.map((evidenceRef) => tx.get(evidenceRef)));
    if (evidenceSnaps.some((evidenceSnap, index) => nextEvidence.includes(evidenceRefs[index].id) &&
      (!evidenceSnap.exists || evidenceSnap.data()?.isDeleted || evidenceSnap.data()?.uploadedBy !== auth.userId))) {
      throw new ApiError('EVIDENCE_NOT_FOUND', 400);
    }
    const updates = { transactionDate: Timestamp.fromDate(input.date), fiscalYear: input.fiscalYear, fiscalMonth: input.fiscalMonth,
      debitAccount: input.debitAccount, debitAmount: input.debitAmount, creditAccount: input.creditAccount, creditAmount: input.creditAmount,
      counterparty: input.counterparty, description: input.description, taxType: input.taxType, taxAmount: input.taxAmount,
      taxIncluded: input.taxIncluded, sourceType: input.sourceType, sourceReference: input.sourceReference ?? '',
      reviewNote: input.reviewNote ?? '', evidenceIds: nextEvidence,
      invoiceRegistrationNumber: input.invoiceRegistrationNumber ?? '',
      status: merged.status === 'auto' ? 'pending' : merged.status, version: previous.version + 1,
      updatedAt: FieldValue.serverTimestamp(), updatedBy: auth.actorId };
    const now = FieldValue.serverTimestamp();
    tx.update(ref, updates);
    evidenceRefs.forEach((evidenceRef, index) => {
      if (!previousEvidence.includes(evidenceRef.id) && nextEvidence.includes(evidenceRef.id))
        tx.update(evidenceRef, { linkedJournalIds: FieldValue.arrayUnion(journalId) });
      if (evidenceSnaps[index].exists && previousEvidence.includes(evidenceRef.id) && !nextEvidence.includes(evidenceRef.id))
        tx.update(evidenceRef, { linkedJournalIds: FieldValue.arrayRemove(journalId) });
    });
    tx.set(auditRef, { id: auditRef.id, journalId, operationType: 'UPDATE', operationDatetime: now,
      operatorId: auth.actorId, actorType: auth.actorType, actorId: auth.actorId,
      agentConnectionId: auth.actorType === 'agent' ? auth.actorId : null, previousValues: previous, newValues: updates, reason });
  });
}

export async function deleteJournal(auth: AuthContext, journalId: string, reason: string) {
  if (!journalId || !reason?.trim()) throw new ApiError('REASON_REQUIRED', 400);
  const ref = userCol(auth.userId, 'journals').doc(journalId);
  const auditRef = userCol(auth.userId, 'auditLog').doc();
  await getFirestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data()?.isDeleted) throw new ApiError('JOURNAL_NOT_FOUND', 404);
    const previous = snap.data() as JournalEntry;
    if (auth.actorType === 'agent' && previous.status !== 'pending' && previous.status !== 'auto') throw new ApiError('CONFIRMED_JOURNAL', 409);
    const evidenceRefs = (previous.evidenceIds ?? []).map((id) => userCol(auth.userId, 'documents').doc(id));
    const evidenceSnaps = await Promise.all(evidenceRefs.map((evidenceRef) => tx.get(evidenceRef)));
    const issuedRef = previous.sourceDocumentId ? userCol(auth.userId, 'issuedDocuments').doc(previous.sourceDocumentId) : null;
    const issuedSnap = issuedRef ? await tx.get(issuedRef) : null;
    const now = FieldValue.serverTimestamp();
    tx.update(ref, { isDeleted: true, updatedAt: now, updatedBy: auth.actorId, version: previous.version + 1 });
    evidenceRefs.forEach((evidenceRef, index) => {
      if (evidenceSnaps[index].exists) tx.update(evidenceRef, { linkedJournalIds: FieldValue.arrayRemove(journalId) });
    });
    if (issuedRef && issuedSnap?.exists) tx.update(issuedRef, unlinkIssuedDocument(issuedSnap.data(), journalId, auth));
    tx.set(auditRef, { id: auditRef.id, journalId, operationType: 'DELETE', operationDatetime: now,
      operatorId: auth.actorId, actorType: auth.actorType, actorId: auth.actorId,
      agentConnectionId: auth.actorType === 'agent' ? auth.actorId : null, previousValues: previous, reason });
  });
}

export async function confirmJournals(auth: AuthContext, ids: string[], reason: string) {
  if (auth.actorType !== 'user') throw new ApiError('USER_REQUIRED', 403);
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 200 || new Set(ids).size !== ids.length ||
      ids.some((id) => typeof id !== 'string' || !id) || !reason?.trim()) throw new ApiError('INVALID_REVIEW', 400);
  const refs = ids.map((id) => userCol(auth.userId, 'journals').doc(id));
  await getFirestore().runTransaction(async (tx) => {
    const snaps = await tx.getAll(...refs);
    if (snaps.some((snap) => !snap.exists || snap.data()?.isDeleted || !['pending', 'auto'].includes(snap.data()?.status))) {
      throw new ApiError('REVIEW_CONFLICT', 409);
    }
    const now = FieldValue.serverTimestamp();
    snaps.forEach((snap, index) => {
      const auditRef = userCol(auth.userId, 'auditLog').doc();
      const previous = snap.data() as JournalEntry;
      const updates = { status: 'confirmed', version: previous.version + 1, updatedAt: now, updatedBy: auth.userId };
      tx.update(refs[index], updates);
      tx.set(auditRef, { id: auditRef.id, journalId: ids[index], operationType: 'UPDATE', operationDatetime: now,
        operatorId: auth.userId, actorType: 'user', actorId: auth.userId, previousValues: previous, newValues: updates, reason });
    });
  });
}

export interface JournalLinksInput {
  /** 紐づける証憑IDの全集合。省略時は変更しない */
  evidenceIds?: string[];
  /** 紐づける帳票ID。null で解除、省略時は変更しない */
  issuedDocumentId?: string | null;
}

/**
 * 仕訳と証憑・帳票の紐づけを双方向で更新する。
 * エージェントは確定済み仕訳に対しては紐づけの追加のみ行える（解除・付け替えはユーザーのみ）。
 */
export async function updateJournalLinks(auth: AuthContext, journalId: string, links: JournalLinksInput, reason: string) {
  if (!journalId || !links || typeof links !== 'object' || typeof reason !== 'string' || !reason.trim()) throw new ApiError('INVALID_UPDATE', 400);
  const { evidenceIds, issuedDocumentId } = links;
  if (evidenceIds === undefined && issuedDocumentId === undefined) throw new ApiError('INVALID_UPDATE', 400);
  if (evidenceIds !== undefined && (!Array.isArray(evidenceIds) || evidenceIds.length > 20 ||
      evidenceIds.some((id) => typeof id !== 'string' || !id))) throw new ApiError('INVALID_EVIDENCE', 400);
  if (issuedDocumentId !== undefined && issuedDocumentId !== null && (typeof issuedDocumentId !== 'string' || !issuedDocumentId))
    throw new ApiError('INVALID_ISSUED_DOCUMENT', 400);
  const ref = userCol(auth.userId, 'journals').doc(journalId);
  const auditRef = userCol(auth.userId, 'auditLog').doc();
  await getFirestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data()?.isDeleted) throw new ApiError('JOURNAL_NOT_FOUND', 404);
    const previous = snap.data() as JournalEntry;
    const previousEvidence = previous.evidenceIds ?? [];
    const nextEvidence = evidenceIds === undefined ? previousEvidence : Array.from(new Set(evidenceIds));
    const previousIssued = previous.sourceDocumentId ?? null;
    const nextIssued = issuedDocumentId === undefined ? previousIssued : issuedDocumentId;
    if (auth.actorType === 'agent' && previous.status === 'confirmed' &&
        (previousEvidence.some((id) => !nextEvidence.includes(id)) || (previousIssued !== null && previousIssued !== nextIssued)))
      throw new ApiError('CONFIRMED_JOURNAL', 409);

    const evidenceRefs = Array.from(new Set([...previousEvidence, ...nextEvidence])).map((id) => userCol(auth.userId, 'documents').doc(id));
    const evidenceSnaps = await Promise.all(evidenceRefs.map((evidenceRef) => tx.get(evidenceRef)));
    if (evidenceSnaps.some((evidenceSnap, index) => nextEvidence.includes(evidenceRefs[index].id) && !previousEvidence.includes(evidenceRefs[index].id) &&
      (!evidenceSnap.exists || evidenceSnap.data()?.isDeleted || evidenceSnap.data()?.uploadedBy !== auth.userId))) {
      throw new ApiError('EVIDENCE_NOT_FOUND', 400);
    }
    const issuedChanged = previousIssued !== nextIssued;
    const previousIssuedRef = issuedChanged && previousIssued ? userCol(auth.userId, 'issuedDocuments').doc(previousIssued) : null;
    const nextIssuedRef = issuedChanged && nextIssued ? userCol(auth.userId, 'issuedDocuments').doc(nextIssued) : null;
    const [previousIssuedSnap, nextIssuedSnap] = await Promise.all([
      previousIssuedRef ? tx.get(previousIssuedRef) : null, nextIssuedRef ? tx.get(nextIssuedRef) : null]);
    if (nextIssuedSnap && (!nextIssuedSnap.exists || nextIssuedSnap.data()?.isDeleted)) throw new ApiError('ISSUED_DOCUMENT_NOT_FOUND', 400);

    const now = FieldValue.serverTimestamp();
    const updates = { evidenceIds: nextEvidence, sourceDocumentId: nextIssued ?? FieldValue.delete(),
      version: previous.version + 1, updatedAt: now, updatedBy: auth.actorId };
    tx.update(ref, updates);
    evidenceRefs.forEach((evidenceRef, index) => {
      if (!previousEvidence.includes(evidenceRef.id) && nextEvidence.includes(evidenceRef.id))
        tx.update(evidenceRef, { linkedJournalIds: FieldValue.arrayUnion(journalId) });
      if (evidenceSnaps[index].exists && previousEvidence.includes(evidenceRef.id) && !nextEvidence.includes(evidenceRef.id))
        tx.update(evidenceRef, { linkedJournalIds: FieldValue.arrayRemove(journalId) });
    });
    if (previousIssuedRef && previousIssuedSnap?.exists) tx.update(previousIssuedRef, unlinkIssuedDocument(previousIssuedSnap.data(), journalId, auth));
    if (nextIssuedRef) tx.update(nextIssuedRef, { linkedJournalIds: FieldValue.arrayUnion(journalId), updatedAt: now, updatedBy: auth.actorId });
    tx.set(auditRef, { id: auditRef.id, journalId, operationType: 'UPDATE', operationDatetime: now,
      operatorId: auth.actorId, actorType: auth.actorType, actorId: auth.actorId,
      agentConnectionId: auth.actorType === 'agent' ? auth.actorId : null,
      previousValues: { evidenceIds: previousEvidence, sourceDocumentId: previousIssued },
      newValues: { evidenceIds: nextEvidence, sourceDocumentId: nextIssued }, reason: reason.trim() });
  });
}

/** 帳票から仕訳の紐づけを外す。最後の仕訳が外れたら会計連携済みフラグも戻して再連携できるようにする。 */
function unlinkIssuedDocument(data: FirebaseFirestore.DocumentData | undefined, journalId: string, auth: AuthContext) {
  const remaining = ((data?.linkedJournalIds ?? []) as string[]).filter((id) => id !== journalId);
  return { linkedJournalIds: FieldValue.arrayRemove(journalId), updatedAt: FieldValue.serverTimestamp(), updatedBy: auth.actorId,
    ...(remaining.length === 0 ? { postedToAccounting: false } : {}) };
}
