'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from './useAuth';
import { DEFAULT_DEDUCTIONS, type IncomeDeductionInput } from '@/types';
import { TEST_DEDUCTIONS } from '@/lib/test/defaults';

function storageKey(year: number) {
  return `opentax.deductions.${year}`;
}

function loadLocal(year: number): IncomeDeductionInput {
  if (typeof window === 'undefined') return TEST_DEDUCTIONS;
  try {
    const raw = localStorage.getItem(storageKey(year));
    if (!raw) return { ...TEST_DEDUCTIONS };
    return { ...TEST_DEDUCTIONS, ...JSON.parse(raw) };
  } catch {
    return { ...TEST_DEDUCTIONS };
  }
}

export function useDeductions(fiscalYear: number) {
  const { user, getToken, isTestUser } = useAuth();
  const [deductions, setDeductions] = useState<IncomeDeductionInput>(DEFAULT_DEDUCTIONS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const refetch = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      if (isTestUser) {
        setDeductions(loadLocal(fiscalYear));
        return;
      }
      const token = await getToken();
      const res = await fetch(`/api/deductions?fiscalYear=${fiscalYear}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('所得控除の取得に失敗しました');
      const data = await res.json();
      setDeductions({ ...DEFAULT_DEDUCTIONS, ...data.deductions });
    } finally {
      setLoading(false);
    }
  }, [user, getToken, isTestUser, fiscalYear]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const save = useCallback(async (next: IncomeDeductionInput) => {
    setSaving(true);
    try {
      if (isTestUser) {
        localStorage.setItem(storageKey(fiscalYear), JSON.stringify(next));
        setDeductions(next);
        return;
      }
      const token = await getToken();
      const res = await fetch('/api/deductions', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fiscalYear, deductions: next }),
      });
      if (!res.ok) throw new Error('所得控除の保存に失敗しました');
      setDeductions(next);
    } finally {
      setSaving(false);
    }
  }, [fiscalYear, getToken, isTestUser]);

  return { deductions, setDeductions, loading, saving, save, refetch };
}
