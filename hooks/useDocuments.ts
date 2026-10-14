'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './useAuth';
import type { Document } from '@/types';
import { MOCK_DOCUMENTS } from '@/lib/test/mockData';
import { restoreTimestamps } from '@/lib/firebase/deserialize';

interface DocumentFilters {
  counterparty?: string;
  minAmount?: number;
  maxAmount?: number;
}

export function useDocuments(filters?: DocumentFilters) {
  const { user, getToken, isTestUser } = useAuth();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // テストモード用: ローカルstateでモックデータを管理
  const [mockStore, setMockStore] = useState<Document[]>(MOCK_DOCUMENTS);

  const fetchDocuments = useCallback(async () => {
    if (!user) return;

    if (isTestUser) {
      setLoading(true);
      let filtered = mockStore.filter((d) => !d.isDeleted);
      if (filters?.counterparty) {
        filtered = filtered.filter((d) =>
          d.counterparty?.includes(filters.counterparty!)
        );
      }
      if (filters?.minAmount !== undefined) {
        filtered = filtered.filter((d) => (d.amount ?? 0) >= filters.minAmount!);
      }
      if (filters?.maxAmount !== undefined) {
        filtered = filtered.filter((d) => (d.amount ?? 0) <= filters.maxAmount!);
      }
      setDocuments(filtered);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const params = new URLSearchParams();
      if (filters?.counterparty) params.set('counterparty', filters.counterparty);
      if (filters?.minAmount) params.set('minAmount', String(filters.minAmount));
      if (filters?.maxAmount) params.set('maxAmount', String(filters.maxAmount));

      const res = await fetch(`/api/documents?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch documents');
      const data = await res.json();
      setDocuments(restoreTimestamps(data.documents ?? []));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  }, [user, getToken, isTestUser, mockStore, filters?.counterparty, filters?.minAmount, filters?.maxAmount]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const uploadDocument = useCallback(async (file: File, documentType: string, metadata: Record<string, string> = {}) => {
    if (isTestUser) {
      const { Timestamp } = await import('firebase/firestore');
      const newDoc: Document = {
        id: `d_test_${Date.now()}`,
        fileName: file.name,
        originalFileName: file.name,
        storageUrl: '',
        fileType: file.type as Document['fileType'],
        fileSizeBytes: file.size,
        documentType: documentType as Document['documentType'],
        linkedJournalIds: [],
        uploadedAt: Timestamp.now(),
        uploadedBy: 'test-user-demo',
        isDeleted: false,
      };
      setMockStore((prev) => [newDoc, ...prev]);
      return { id: newDoc.id };
    }

    const token = await getToken();
    const formData = new FormData();
    formData.append('file', file);
    formData.append('documentType', documentType);
    for (const [key, value] of Object.entries(metadata)) if (value) formData.append(key, value);

    const res = await fetch('/api/documents', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    if (!res.ok) throw new Error('Upload failed');
    const data = await res.json();
    await fetchDocuments();
    return data;
  }, [getToken, isTestUser, fetchDocuments]);

  return { documents, loading, error, refetch: fetchDocuments, uploadDocument };
}
