'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from './useAuth';
import type { FixedAsset } from '@/types';
import { restoreTimestamps } from '@/lib/firebase/deserialize';
import { TEST_ASSETS } from '@/lib/test/defaults';

const STORAGE_KEY = 'opentax.assets';

function loadLocal(): FixedAsset[] {
  if (typeof window === 'undefined') return TEST_ASSETS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return TEST_ASSETS;
    return JSON.parse(raw) as FixedAsset[];
  } catch {
    return TEST_ASSETS;
  }
}

export function useAssets() {
  const { user, getToken, isTestUser } = useAuth();
  const [assets, setAssets] = useState<FixedAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const refetch = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      if (isTestUser) {
        setAssets(loadLocal());
        return;
      }
      const token = await getToken();
      const res = await fetch('/api/assets', { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('固定資産の取得に失敗しました');
      const data = await res.json();
      setAssets(restoreTimestamps(data.assets ?? []));
    } finally {
      setLoading(false);
    }
  }, [user, getToken, isTestUser]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const save = useCallback(async (next: FixedAsset[]) => {
    setSaving(true);
    try {
      if (isTestUser) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        setAssets(next);
        return;
      }
      const token = await getToken();
      const res = await fetch('/api/assets', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ assets: next }),
      });
      if (!res.ok) throw new Error('固定資産の保存に失敗しました');
      setAssets(next);
    } finally {
      setSaving(false);
    }
  }, [getToken, isTestUser]);

  return { assets, setAssets, loading, saving, save, refetch };
}
