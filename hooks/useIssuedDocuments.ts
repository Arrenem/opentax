'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './useAuth';
import type {
  BillingLineItem,
  IssuedDocument,
  IssuedDocumentKind,
  IssuedDocumentStatus,
} from '@/types';
import { MOCK_ISSUED_DOCUMENTS } from '@/lib/test/mockBilling';
import { restoreTimestamps } from '@/lib/firebase/deserialize';
import { Timestamp } from 'firebase/firestore';
import {
  calculateDocumentTotals,
  generateDocumentNumber,
  nextSequence,
  syncLineItemAmount,
  totalsFields,
  buildAccountingPostPlans,
  planToJournalPayload,
  defaultPostKindForDocument,
  type AccountingPostKind,
} from '@/lib/billing';

interface IssuedDocumentFilters {
  projectId?: string;
  kind?: IssuedDocumentKind;
  status?: IssuedDocumentStatus;
}

export type CreateIssuedDocumentInput = {
  kind: IssuedDocumentKind;
  projectId: string;
  projectName: string;
  customerId: string;
  customerName: string;
  customerAddress?: string;
  issueDate: string;
  dueDate?: string;
  title?: string;
  lineItems: BillingLineItem[];
  notes?: string;
  status?: IssuedDocumentStatus;
  sourceDocumentId?: string;
};

export function useIssuedDocuments(filters?: IssuedDocumentFilters) {
  const { user, getToken, isTestUser } = useAuth();
  const [documents, setDocuments] = useState<IssuedDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mockStore, setMockStore] = useState<IssuedDocument[]>(MOCK_ISSUED_DOCUMENTS);

  const fetchDocuments = useCallback(async () => {
    if (!user) return;

    if (isTestUser) {
      let list = mockStore.filter((d) => !d.isDeleted);
      if (filters?.projectId) list = list.filter((d) => d.projectId === filters.projectId);
      if (filters?.kind) list = list.filter((d) => d.kind === filters.kind);
      if (filters?.status) list = list.filter((d) => d.status === filters.status);
      list.sort((a, b) => b.issueDate.localeCompare(a.issueDate));
      setDocuments(list);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const params = new URLSearchParams();
      if (filters?.projectId) params.set('projectId', filters.projectId);
      if (filters?.kind) params.set('kind', filters.kind);
      if (filters?.status) params.set('status', filters.status);
      const res = await fetch(`/api/issued-documents?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch issued documents');
      const data = await res.json();
      setDocuments(restoreTimestamps(data.documents ?? []));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  }, [user, getToken, isTestUser, mockStore, filters?.projectId, filters?.kind, filters?.status]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const createDocument = useCallback(
    async (input: CreateIssuedDocumentInput) => {
      if (isTestUser) {
        const lineItems = input.lineItems.map(syncLineItemAmount);
        const totals = calculateDocumentTotals(lineItems);
        const existing = mockStore
          .filter((d) => !d.isDeleted && d.kind === input.kind)
          .map((d) => d.documentNumber);
        const seq = nextSequence(input.kind, input.issueDate, existing);
        const now = Timestamp.now();
        const id = `iss-${Date.now()}`;
        const created: IssuedDocument = {
          id,
          kind: input.kind,
          documentNumber: generateDocumentNumber(input.kind, input.issueDate, seq),
          projectId: input.projectId,
          projectName: input.projectName,
          customerId: input.customerId,
          customerName: input.customerName,
          customerAddress: input.customerAddress ?? '',
          issueDate: input.issueDate,
          dueDate: input.dueDate ?? '',
          title: input.title ?? '',
          lineItems,
          ...totalsFields(totals),
          notes: input.notes ?? '',
          status: input.status ?? 'draft',
          linkedJournalIds: [],
          postedToAccounting: false,
          sourceDocumentId: input.sourceDocumentId,
          isDeleted: false,
          createdAt: now,
          updatedAt: now,
          createdBy: 'test-user-demo',
          updatedBy: 'test-user-demo',
        };
        setMockStore((prev) => [...prev, created]);
        return { id, documentNumber: created.documentNumber };
      }

      const token = await getToken();
      const res = await fetch('/api/issued-documents', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || '帳票の作成に失敗しました');
      }
      const data = await res.json();
      await fetchDocuments();
      return { id: data.id as string, documentNumber: data.documentNumber as string };
    },
    [getToken, isTestUser, mockStore, fetchDocuments]
  );

  const updateDocument = useCallback(
    async (documentId: string, updates: Partial<IssuedDocument>) => {
      if (isTestUser) {
        setMockStore((prev) =>
          prev.map((d) => {
            if (d.id !== documentId) return d;
            const next = { ...d, ...updates, updatedAt: Timestamp.now() };
            if (updates.lineItems) {
              const lineItems = updates.lineItems.map(syncLineItemAmount);
              const totals = calculateDocumentTotals(lineItems);
              next.lineItems = lineItems;
              Object.assign(next, totalsFields(totals));
            }
            return next;
          })
        );
        return;
      }
      const token = await getToken();
      const res = await fetch('/api/issued-documents', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ documentId, updates }),
      });
      if (!res.ok) throw new Error('帳票の更新に失敗しました');
      await fetchDocuments();
    },
    [getToken, isTestUser, fetchDocuments]
  );

  const deleteDocument = useCallback(
    async (documentId: string) => {
      if (isTestUser) {
        setMockStore((prev) =>
          prev.map((d) =>
            d.id === documentId ? { ...d, isDeleted: true, updatedAt: Timestamp.now() } : d
          )
        );
        return;
      }
      const token = await getToken();
      const res = await fetch('/api/issued-documents', {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ documentId }),
      });
      if (!res.ok) throw new Error('帳票の削除に失敗しました');
      await fetchDocuments();
    },
    [getToken, isTestUser, fetchDocuments]
  );

  const convertDocument = useCallback(
    async (sourceDocumentId: string, targetKind: IssuedDocumentKind, issueDate?: string) => {
      if (isTestUser) {
        const source = mockStore.find((d) => d.id === sourceDocumentId && !d.isDeleted);
        if (!source) throw new Error('変換元帳票が見つかりません');
        const allowed =
          (source.kind === 'estimate' && targetKind === 'invoice') ||
          (source.kind === 'invoice' && targetKind === 'receipt');
        if (!allowed) throw new Error('許可されていない変換です');
        return createDocument({
          kind: targetKind,
          projectId: source.projectId,
          projectName: source.projectName,
          customerId: source.customerId,
          customerName: source.customerName,
          customerAddress: source.customerAddress,
          issueDate: issueDate || new Date().toISOString().slice(0, 10),
          dueDate: targetKind === 'invoice' ? source.dueDate : undefined,
          title: source.title,
          lineItems: source.lineItems,
          notes: source.notes,
          status: 'draft',
          sourceDocumentId: source.id,
        });
      }

      const token = await getToken();
      const res = await fetch('/api/issued-documents', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'convert',
          sourceDocumentId,
          targetKind,
          issueDate,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || '帳票の変換に失敗しました');
      }
      const data = await res.json();
      await fetchDocuments();
      return { id: data.id as string, documentNumber: data.documentNumber as string };
    },
    [getToken, isTestUser, mockStore, createDocument, fetchDocuments]
  );

  const postToAccounting = useCallback(
    async (documentId: string, postKind?: AccountingPostKind) => {
      if (isTestUser) {
        const doc = mockStore.find((d) => d.id === documentId && !d.isDeleted);
        if (!doc) throw new Error('帳票が見つかりません');
        const kind = postKind ?? defaultPostKindForDocument(doc.kind);
        if (!kind) throw new Error('見積書は会計連携できません');
        if (kind === 'invoice_issue' && doc.postedToAccounting) {
          throw new Error('すでに会計連携済みです');
        }
        const plans = buildAccountingPostPlans(doc, kind);
        if (plans.length === 0) throw new Error('会計連携プランを作成できません');
        const journalIds = plans.map((_, i) => `j-iss-${Date.now()}-${i}`);
        plans.forEach((plan) => {
          planToJournalPayload(plan, 'test-user-demo', documentId);
        });
        setMockStore((prev) =>
          prev.map((d) => {
            if (d.id !== documentId) return d;
            const next: IssuedDocument = {
              ...d,
              linkedJournalIds: [...d.linkedJournalIds, ...journalIds],
              updatedAt: Timestamp.now(),
            };
            if (kind === 'invoice_issue') {
              next.postedToAccounting = true;
              if (d.status === 'draft') next.status = 'issued';
            }
            if (kind === 'receipt_payment') {
              next.status = 'paid';
              if (d.kind === 'receipt') next.postedToAccounting = true;
            }
            return next;
          })
        );
        return { journalId: journalIds[0], postKind: kind };
      }

      const token = await getToken();
      const res = await fetch('/api/issued-documents', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'postToAccounting',
          documentId,
          postKind,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || '会計連携に失敗しました');
      }
      const data = await res.json();
      await fetchDocuments();
      return { journalId: data.journalId as string, postKind: data.postKind as AccountingPostKind };
    },
    [getToken, isTestUser, mockStore, fetchDocuments]
  );

  return {
    documents,
    loading,
    error,
    refresh: fetchDocuments,
    createDocument,
    updateDocument,
    deleteDocument,
    convertDocument,
    postToAccounting,
    mockStore,
  };
}

export function useIssuedDocument(documentId: string | undefined) {
  const { documents, loading, error, refresh, ...actions } = useIssuedDocuments();
  const document = documents.find((d) => d.id === documentId);
  return { document, loading, error, refresh, ...actions };
}
