export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { authenticateRequest, requireScope, requireUser, apiErrorResponse } from '@/lib/auth/authenticateRequest';
import { searchBillingDocuments, createBillingDocument, updateBillingDocument, deleteBillingDocument } from '@/lib/domain/billing/service';
import type { IssuedDocument, IssuedDocumentKind, UserSettings } from '@/types';
import { DEFAULT_USER_SETTINGS } from '@/types';
import { buildAccountingPostPlans, planToJournalPayload, defaultPostKindForDocument, generateDocumentNumber, nextSequence, type AccountingPostKind } from '@/lib/billing';
function issuedCol(userId: string) { return getFirestore().collection('users').doc(userId).collection('issuedDocuments'); }
function settingsDoc(userId: string) { return getFirestore().collection('users').doc(userId).collection('userSettings').doc('settings'); }
function journalsCol(userId: string) { return getFirestore().collection('users').doc(userId).collection('journals'); }
function auditCol(userId: string) { return getFirestore().collection('users').doc(userId).collection('auditLog'); }

export async function GET(req: NextRequest) {
  try { const auth = await authenticateRequest(req); requireScope(auth, 'read');
    const q = new URL(req.url).searchParams;
    return NextResponse.json(await searchBillingDocuments(auth, { id: q.get('id') ?? undefined,
      projectId: q.get('projectId') ?? undefined, kind: q.get('kind') ?? undefined, status: q.get('status') ?? undefined }));
  } catch (e) { return apiErrorResponse(e); }
}
export async function POST(req: NextRequest) {
  try { const auth = await authenticateRequest(req); requireScope(auth, 'billing:write');
    const body = await req.json();
    if (body.action) {
      requireUser(auth);
      if (body.action === 'postToAccounting') return postToAccounting(auth.userId, body);
      if (body.action === 'convert') return convertDocument(auth.userId, body);
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
    const result = await createBillingDocument(auth, body);
    return NextResponse.json({ id: result.id, documentNumber: result.documentNumber, status: result.status },
      { status: result.status === 'created' ? 201 : 200 });
  } catch (e) { return apiErrorResponse(e); }
}
export async function PATCH(req: NextRequest) {
  try { const auth = await authenticateRequest(req); requireScope(auth, 'billing:write');
    const { documentId, updates } = await req.json();
    await updateBillingDocument(auth, documentId, updates);
    return NextResponse.json({ success: true });
  } catch (e) { return apiErrorResponse(e); }
}
export async function DELETE(req: NextRequest) {
  try { const auth = await authenticateRequest(req); requireScope(auth, 'billing:write');
    const { documentId } = await req.json(); await deleteBillingDocument(auth, documentId);
    return NextResponse.json({ success: true });
  } catch (e) { return apiErrorResponse(e); }
}

async function postToAccounting(
  userId: string,
  body: { documentId: string; postKind?: AccountingPostKind }
) {
  const documentId = String(body.documentId ?? '');
  if (!documentId) {
    return NextResponse.json({ error: 'documentId is required' }, { status: 400 });
  }

  const docRef = issuedCol(userId).doc(documentId);
  const snap = await docRef.get();
  if (!snap.exists || snap.data()?.isDeleted) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }
  const issued = { id: snap.id, ...snap.data() } as IssuedDocument;

  const postKind = body.postKind ?? defaultPostKindForDocument(issued.kind);
  if (!postKind) {
    return NextResponse.json(
      { error: '見積書は会計連携できません。請求書または領収書を指定してください。' },
      { status: 400 }
    );
  }

  // 請求書の売上計上は二重防止。入金消込は別プランとして許可。
  if (postKind === 'invoice_issue' && issued.postedToAccounting) {
    return NextResponse.json({ error: 'すでに会計連携済みです' }, { status: 409 });
  }

  const plans = buildAccountingPostPlans(issued, postKind);
  if (plans.length === 0) {
    return NextResponse.json({ error: '会計連携プランを作成できません' }, { status: 400 });
  }

  const settingsSnap = await settingsDoc(userId).get();
  const settings = {
    ...DEFAULT_USER_SETTINGS,
    ...(settingsSnap.data() as Partial<UserSettings> | undefined),
  };

  const batch = getFirestore().batch();
  const now = FieldValue.serverTimestamp();
  const journalIds: string[] = [];

  plans.forEach((plan, index) => {
    const journalPayload = planToJournalPayload(plan, userId, documentId, settings);
    const journalRef = journalsCol(userId).doc();
    const auditRef = auditCol(userId).doc();
    journalIds.push(journalRef.id);

    const journal = {
      ...journalPayload,
      id: journalRef.id,
      entryNumber: Date.now() + index,
      version: 1,
      isCurrent: true,
      transactionDate: Timestamp.fromDate(plan.transactionDate),
      createdAt: now,
      updatedAt: now,
    };

    batch.set(journalRef, journal);
    batch.set(auditRef, {
      id: auditRef.id,
      journalId: journalRef.id,
      operationType: 'CREATE',
      operationDatetime: now,
      operatorId: userId,
      actorType: 'user', actorId: userId,
      newValues: journal,
      reason: `帳票会計連携: ${issued.documentNumber}`,
    });
  });

  const linkedJournalIds = [...(issued.linkedJournalIds ?? []), ...journalIds];
  const docUpdate: Record<string, unknown> = {
    linkedJournalIds,
    updatedAt: now,
    updatedBy: userId,
  };

  if (postKind === 'invoice_issue') {
    docUpdate.postedToAccounting = true;
    if (issued.status === 'draft') docUpdate.status = 'issued';
  }
  if (postKind === 'receipt_payment') {
    docUpdate.status = 'paid';
    if (issued.kind === 'receipt') docUpdate.postedToAccounting = true;
  }

  batch.update(docRef, docUpdate);
  await batch.commit();

  return NextResponse.json({
    success: true,
    journalId: journalIds[0],
    journalIds,
    postKind,
  });
}

async function convertDocument(
  userId: string,
  body: { sourceDocumentId: string; targetKind: IssuedDocumentKind; issueDate?: string }
) {
  const sourceDocumentId = String(body.sourceDocumentId ?? '');
  const targetKind = body.targetKind;
  if (!sourceDocumentId || !targetKind) {
    return NextResponse.json(
      { error: 'sourceDocumentId and targetKind are required' },
      { status: 400 }
    );
  }

  const sourceSnap = await issuedCol(userId).doc(sourceDocumentId).get();
  if (!sourceSnap.exists || sourceSnap.data()?.isDeleted) {
    return NextResponse.json({ error: 'Source document not found' }, { status: 404 });
  }
  const source = { id: sourceSnap.id, ...sourceSnap.data() } as IssuedDocument;

  const allowed =
    (source.kind === 'estimate' && targetKind === 'invoice') ||
    (source.kind === 'invoice' && targetKind === 'receipt');
  if (!allowed) {
    return NextResponse.json(
      { error: '許可されていない変換です（見積→請求、請求→領収のみ）' },
      { status: 400 }
    );
  }

  const issueDate = body.issueDate || new Date().toISOString().slice(0, 10);
  const existingSnap = await issuedCol(userId)
    .where('kind', '==', targetKind)
    .where('isDeleted', '==', false)
    .limit(500)
    .get();
  const existingNumbers = existingSnap.docs.map((d) => String(d.data().documentNumber ?? ''));
  const seq = nextSequence(targetKind, issueDate, existingNumbers);
  const documentNumber = generateDocumentNumber(targetKind, issueDate, seq);

  const ref = issuedCol(userId).doc();
  const now = FieldValue.serverTimestamp();
  await ref.set({
    id: ref.id,
    kind: targetKind,
    documentNumber,
    projectId: source.projectId,
    projectName: source.projectName,
    customerId: source.customerId,
    customerName: source.customerName,
    customerAddress: source.customerAddress ?? '',
    issueDate,
    dueDate: targetKind === 'invoice' ? source.dueDate ?? '' : '',
    title: source.title ?? '',
    lineItems: source.lineItems,
    subtotal: source.subtotal,
    taxAmount: source.taxAmount,
    totalAmount: source.totalAmount,
    withholdingBase: source.withholdingBase ?? 0,
    withholdingAmount: source.withholdingAmount ?? 0,
    amountDue: source.amountDue ?? source.totalAmount,
    notes: source.notes ?? '',
    status: 'draft',
    linkedJournalIds: [],
    postedToAccounting: false,
    sourceDocumentId: source.id,
    isDeleted: false,
    createdAt: now,
    updatedAt: now,
    createdBy: userId,
    updatedBy: userId,
  });

  return NextResponse.json({ id: ref.id, documentNumber }, { status: 201 });
}
