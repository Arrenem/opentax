'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './useAuth';
import type { JournalEntry } from '@/types';
import { MOCK_JOURNALS } from '@/lib/test/mockData';
import { restoreTimestamps } from '@/lib/firebase/deserialize';

interface JournalFilters {
  fiscalYear?: number;
  fiscalMonth?: number;
  status?: JournalEntry['status'];
}

export function useJournals(filters?: JournalFilters) {
  const { user, getToken, isTestUser } = useAuth();
  const [journals, setJournals] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // テストモード用: ローカルstate でモックデータを管理（CRUD操作が反映される）
  const [mockStore, setMockStore] = useState<JournalEntry[]>(MOCK_JOURNALS);

  const fetchJournals = useCallback(async () => {
    if (!user) return;

    if (isTestUser) {
      setLoading(true);
      // フィルタをクライアントサイドで適用
      let filtered = mockStore.filter((j) => !j.isDeleted);
      if (filters?.fiscalYear) {
        filtered = filtered.filter((j) => j.fiscalYear === filters.fiscalYear);
      }
      if (filters?.fiscalMonth) {
        filtered = filtered.filter((j) => j.fiscalMonth === filters.fiscalMonth);
      }
      if (filters?.status) {
        filtered = filtered.filter((j) => j.status === filters.status);
      }
      // 日付降順でソート
      filtered.sort((a, b) => {
        const aDate = a.transactionDate.toDate ? a.transactionDate.toDate().getTime() : 0;
        const bDate = b.transactionDate.toDate ? b.transactionDate.toDate().getTime() : 0;
        return bDate - aDate;
      });
      setJournals(filtered);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const params = new URLSearchParams();
      if (filters?.fiscalYear) params.set('fiscalYear', String(filters.fiscalYear));
      if (filters?.fiscalMonth) params.set('fiscalMonth', String(filters.fiscalMonth));
      if (filters?.status) params.set('status', filters.status);

      const res = await fetch(`/api/journals?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch journals');
      const data = await res.json();
      setJournals(restoreTimestamps(data.journals ?? []));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  }, [user, getToken, isTestUser, mockStore, filters?.fiscalYear, filters?.fiscalMonth, filters?.status]);

  useEffect(() => {
    fetchJournals();
  }, [fetchJournals]);

  const confirmJournal = useCallback(async (id: string) => {
    if (isTestUser) {
      setMockStore((prev) =>
        prev.map((j) => j.id === id ? { ...j, status: 'confirmed' } : j)
      );
      return;
    }
    const token = await getToken();
    const res = await fetch('/api/journals', {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ journalId: id, updates: { status: 'confirmed' }, reason: '仕訳を確認済みに更新' }),
    });
    if (!res.ok) throw new Error('仕訳の確認に失敗しました');
    await fetchJournals();
  }, [getToken, isTestUser, fetchJournals]);

  const updateJournal = useCallback(async (
    id: string,
    updates: Partial<JournalEntry>,
    reason: string
  ) => {
    if (isTestUser) {
      setMockStore((prev) =>
        prev.map((j) => j.id === id ? { ...j, ...updates } : j)
      );
      return;
    }
    const token = await getToken();
    const res = await fetch('/api/journals', {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ journalId: id, updates, reason }),
    });
    if (!res.ok) throw new Error('Update failed');
    await fetchJournals();
  }, [getToken, isTestUser, fetchJournals]);

  const deleteJournal = useCallback(async (id: string, reason: string) => {
    if (isTestUser) {
      setMockStore((prev) =>
        prev.map((j) => j.id === id ? { ...j, isDeleted: true } : j)
      );
      return;
    }
    const token = await getToken();
    const res = await fetch('/api/journals', {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ journalId: id, reason }),
    });
    if (!res.ok) throw new Error('Delete failed');
    await fetchJournals();
  }, [getToken, isTestUser, fetchJournals]);

  const createJournal = useCallback(async (data: Partial<JournalEntry>) => {
    if (isTestUser) {
      const { Timestamp } = await import('firebase/firestore');
      const newId = `j_test_${Date.now()}`;
      const now = Timestamp.now();
      const newJournal: JournalEntry = {
        id: newId,
        entryNumber: mockStore.length + 1,
        version: 1,
        isCurrent: true,
        isDeleted: false,
        transactionDate: now,
        fiscalYear: new Date().getFullYear(),
        fiscalMonth: new Date().getMonth() + 1,
        debitAccount: 'MISC_EXPENSE',
        debitAmount: 0,
        creditAccount: 'BANK',
        creditAmount: 0,
        counterparty: '',
        description: '',
        taxType: 'standard10',
        taxAmount: 0,
        taxIncluded: true,
        isQualifiedInvoice: false,
        sourceType: 'manual',
        entryOrigin: 'manual',
        status: 'confirmed',
        createdAt: now,
        createdBy: 'test-user-demo',
        updatedAt: now,
        updatedBy: 'test-user-demo',
        ...data,
      };
      setMockStore((prev) => [newJournal, ...prev]);
      return;
    }
    const token = await getToken();
    const res = await fetch('/api/journals', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Create failed');
    await fetchJournals();
  }, [getToken, isTestUser, mockStore.length, fetchJournals]);

  return { journals, loading, error, refetch: fetchJournals, confirmJournal, updateJournal, deleteJournal, createJournal };
}
