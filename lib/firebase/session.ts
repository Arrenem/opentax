// ミドルウェアのルートガード用セッションクッキー。
// 実際の認証情報の検証はしない（各APIルートがBearerトークンをverifyIdTokenする）。
// このクッキーは「ログイン済みかどうか」をミドルウェアに伝えるだけの軽量なフラグ。

export const SESSION_COOKIE = '__session';

export function setSessionCookie(value: string): void {
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${SESSION_COOKIE}=${value}; path=/; SameSite=Lax${secure}`;
}

export function clearSessionCookie(): void {
  document.cookie = `${SESSION_COOKIE}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;
}
