'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { logout } from '@/lib/firebase/auth';
import { clearSessionCookie } from '@/lib/firebase/session';
import { clearTestSession } from '@/lib/test/testAuth';

export function useLogout() {
  const router = useRouter();
  const { isTestUser } = useAuth();

  return useCallback(async () => {
    if (isTestUser) {
      clearTestSession();
    } else {
      await logout();
      clearSessionCookie();
    }
    router.push('/login');
  }, [isTestUser, router]);
}
