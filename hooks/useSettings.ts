'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from './useAuth';
import { DEFAULT_USER_SETTINGS, type UserSettings } from '@/types';
import { TEST_USER_SETTINGS } from '@/lib/test/defaults';

const STORAGE_KEY = 'opentax.settings';

function loadLocal(): UserSettings {
  if (typeof window === 'undefined') return TEST_USER_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return TEST_USER_SETTINGS;
    return { ...TEST_USER_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return TEST_USER_SETTINGS;
  }
}

export function useSettings() {
  const { user, getToken, isTestUser } = useAuth();
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_USER_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      if (isTestUser) {
        setSettings(loadLocal());
        return;
      }
      const token = await getToken();
      const res = await fetch('/api/settings', { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('設定の取得に失敗しました');
      const data = await res.json();
      setSettings({ ...DEFAULT_USER_SETTINGS, ...data.settings });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  }, [user, getToken, isTestUser]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const save = useCallback(async (next: UserSettings) => {
    setSaving(true);
    setError(null);
    try {
      if (isTestUser) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        setSettings(next);
        return;
      }
      const token = await getToken();
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      if (!res.ok) throw new Error('設定の保存に失敗しました');
      const data = await res.json();
      setSettings({ ...DEFAULT_USER_SETTINGS, ...data.settings });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
      throw err;
    } finally {
      setSaving(false);
    }
  }, [getToken, isTestUser]);

  return { settings, loading, saving, error, save, refetch };
}
