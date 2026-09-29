'use client';

import { useEffect, useState } from 'react';
import { useAuth } from './useAuth';
import { MOCK_JOURNALS } from '@/lib/test/mockData';
import { yearRange } from '@/lib/utils/fiscalYears';

/** 仕訳が存在する最古の年から現在年までの年一覧（降順） */
export function useFiscalYears(): number[] {
  const { user, getToken, isTestUser } = useAuth();
  const [years, setYears] = useState<number[]>(() => yearRange([]));

  useEffect(() => {
    if (!user) return;
    if (isTestUser) {
      setYears(yearRange(MOCK_JOURNALS.map((j) => j.fiscalYear)));
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        const res = await fetch('/api/journals/years', { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error(`年一覧の取得に失敗しました (${res.status})`);
        const data = await res.json();
        if (!cancelled && Array.isArray(data.years)) setYears(yearRange(data.years));
      } catch (err) {
        // 取得失敗時は現在年のみ表示
        console.error(err);
      }
    })();
    return () => { cancelled = true; };
  }, [user, getToken, isTestUser]);

  return years;
}
