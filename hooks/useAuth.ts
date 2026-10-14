'use client';

import { useState, useEffect, useCallback } from 'react';
import { User } from 'firebase/auth';
import { onAuthChange, getIdToken } from '@/lib/firebase/auth';
import { isTestSession } from '@/lib/test/testAuth';

// テストモード用のモックユーザー
const MOCK_TEST_USER = {
  uid: 'test-user-demo',
  email: 'test@example.com',
  displayName: 'テストユーザー',
  emailVerified: true,
  phoneNumber: null,
  photoURL: null,
  isAnonymous: false,
  metadata: {},
  providerData: [],
  providerId: 'password',
  tenantId: null,
  delete: async () => {},
  getIdToken: async () => 'test-token',
  getIdTokenResult: async () => ({} as never),
  reload: async () => {},
  toJSON: () => ({}),
} as unknown as User;

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isTestUser, setIsTestUser] = useState(false);

  useEffect(() => {
    // テストセッションを優先確認
    if (isTestSession()) {
      setUser(MOCK_TEST_USER);
      setIsTestUser(true);
      setLoading(false);
      return;
    }

    const unsub = onAuthChange((u) => {
      setUser(u);
      setLoading(false);
    });
    return unsub;
  }, []);

  const getToken = useCallback(async (): Promise<string> => {
    if (isTestUser) return 'test-token';
    const token = await getIdToken();
    if (!token) throw new Error('Not authenticated');
    return token;
  }, [isTestUser]);

  return { user, loading, getToken, isTestUser };
}
