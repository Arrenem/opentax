// テストアカウント用の認証ユーティリティ
// test@example.com / test1234 でログインするとテストモードになる

import { setSessionCookie, clearSessionCookie } from '@/lib/firebase/session';

export const TEST_EMAIL = 'test@example.com';
export const TEST_PASSWORD = 'test1234';
const TEST_SESSION_KEY = '__test_session';

export function isTestSession(): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(TEST_SESSION_KEY) === 'true';
}

export function setTestSession(): void {
  if (process.env.NODE_ENV === 'production') throw new Error('Demo mode is disabled');
  localStorage.setItem(TEST_SESSION_KEY, 'true');
  // ミドルウェアが __session クッキーを確認するので設定する
  setSessionCookie('test');
}

export function clearTestSession(): void {
  localStorage.removeItem(TEST_SESSION_KEY);
  clearSessionCookie();
}
