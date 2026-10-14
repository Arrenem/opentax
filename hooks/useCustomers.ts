'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './useAuth';
import type { Customer } from '@/types';
import { MOCK_CUSTOMERS } from '@/lib/test/mockBilling';
import { Timestamp } from 'firebase/firestore';
import { restoreTimestamps } from '@/lib/firebase/deserialize';

export function useCustomers() {
  const { user, getToken, isTestUser } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mockStore, setMockStore] = useState<Customer[]>(MOCK_CUSTOMERS);

  const fetchCustomers = useCallback(async () => {
    if (!user) return;

    if (isTestUser) {
      setCustomers(mockStore.filter((c) => !c.isDeleted).sort((a, b) => a.name.localeCompare(b.name, 'ja')));
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch('/api/customers', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch customers');
      const data = await res.json();
      setCustomers(restoreTimestamps(data.customers ?? []));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  }, [user, getToken, isTestUser, mockStore]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  const createCustomer = useCallback(
    async (input: Omit<Customer, 'id' | 'createdAt' | 'updatedAt' | 'isDeleted'>) => {
      if (isTestUser) {
        const now = Timestamp.now();
        const id = `cust-${Date.now()}`;
        const created: Customer = { ...input, id, isDeleted: false, createdAt: now, updatedAt: now };
        setMockStore((prev) => [...prev, created]);
        return id;
      }
      const token = await getToken();
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error('顧客の作成に失敗しました');
      const data = await res.json();
      await fetchCustomers();
      return data.id as string;
    },
    [getToken, isTestUser, fetchCustomers]
  );

  const updateCustomer = useCallback(
    async (customerId: string, updates: Partial<Customer>) => {
      if (isTestUser) {
        setMockStore((prev) =>
          prev.map((c) =>
            c.id === customerId ? { ...c, ...updates, updatedAt: Timestamp.now() } : c
          )
        );
        return;
      }
      const token = await getToken();
      const res = await fetch('/api/customers', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ customerId, updates }),
      });
      if (!res.ok) throw new Error('顧客の更新に失敗しました');
      await fetchCustomers();
    },
    [getToken, isTestUser, fetchCustomers]
  );

  const deleteCustomer = useCallback(
    async (customerId: string) => {
      if (isTestUser) {
        setMockStore((prev) =>
          prev.map((c) =>
            c.id === customerId ? { ...c, isDeleted: true, updatedAt: Timestamp.now() } : c
          )
        );
        return;
      }
      const token = await getToken();
      const res = await fetch('/api/customers', {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ customerId }),
      });
      if (!res.ok) throw new Error('顧客の削除に失敗しました');
      await fetchCustomers();
    },
    [getToken, isTestUser, fetchCustomers]
  );

  return {
    customers,
    loading,
    error,
    refresh: fetchCustomers,
    createCustomer,
    updateCustomer,
    deleteCustomer,
  };
}
