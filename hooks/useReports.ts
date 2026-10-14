'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './useAuth';
import type { ProfitAndLoss, BalanceSheet, MonthlySummary, UserSettings } from '@/types';
import { MOCK_JOURNALS } from '@/lib/test/mockData';
import { TEST_ASSETS, TEST_DEDUCTIONS, TEST_USER_SETTINGS } from '@/lib/test/defaults';
import { buildBS, buildMonthlySummaries, buildPL } from '@/lib/accounting/reports';
import { calcDepreciationForYear } from '@/lib/tax/depreciation';

function testSettings(): UserSettings {
  if (typeof window === 'undefined') return TEST_USER_SETTINGS;
  try {
    const raw = localStorage.getItem('opentax.settings');
    return raw ? { ...TEST_USER_SETTINGS, ...JSON.parse(raw) } : TEST_USER_SETTINGS;
  } catch {
    return TEST_USER_SETTINGS;
  }
}

function computeMock(fiscalYear: number) {
  const settings = testSettings();
  const journals = MOCK_JOURNALS.filter((j) => j.fiscalYear === fiscalYear && !j.isDeleted);
  const depreciation = calcDepreciationForYear(fiscalYear, TEST_ASSETS, settings.filingType === 'blue');
  return {
    pl: buildPL(journals, fiscalYear, settings, {
      beginningInventory: TEST_DEDUCTIONS.beginningInventory,
      endingInventory: TEST_DEDUCTIONS.endingInventory,
      depreciationAmount: depreciation.totalDeductible,
    }),
    bs: buildBS(journals, fiscalYear),
    monthly: buildMonthlySummaries(journals, fiscalYear, settings),
  };
}

export function useReports(fiscalYear: number) {
  const { user, getToken, isTestUser } = useAuth();
  const [pl, setPl] = useState<ProfitAndLoss | null>(null);
  const [bs, setBs] = useState<BalanceSheet | null>(null);
  const [monthly, setMonthly] = useState<MonthlySummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    if (!user) return;

    if (isTestUser) {
      setLoading(true);
      const mock = computeMock(fiscalYear);
      setPl(mock.pl);
      setBs(mock.bs);
      setMonthly(mock.monthly);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const token = await getToken();

      const [plRes, bsRes, monthlyRes] = await Promise.all([
        fetch(`/api/reports?type=pl&fiscalYear=${fiscalYear}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`/api/reports?type=bs&fiscalYear=${fiscalYear}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`/api/reports?type=monthly&fiscalYear=${fiscalYear}`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      if (!plRes.ok || !bsRes.ok || !monthlyRes.ok) throw new Error('Failed to fetch reports');

      const [plData, bsData, monthlyData] = await Promise.all([
        plRes.json(),
        bsRes.json(),
        monthlyRes.json(),
      ]);

      setPl(plData.pl ?? null);
      setBs(bsData.bs ?? null);
      setMonthly(monthlyData.monthly ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  }, [user, getToken, isTestUser, fiscalYear]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  return { pl, bs, monthly, loading, error, refetch: fetchAll };
}
