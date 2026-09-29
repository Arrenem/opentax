import { NextRequest, NextResponse } from 'next/server';

// 認証が不要なパス
const PUBLIC_PATHS = [
  '/login',
  '/api/health',
  '/.well-known',
  '/_next',
  '/favicon.ico',
];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // パブリックパスはスキップ
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // APIルートは各ハンドラの共通認証層でBearerトークンを検証
  if (pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  // セッションクッキーの確認（Firebase セッション or テストセッション）
  const session = request.cookies.get('__session');

  // セッションなしでダッシュボードへのアクセス → ログインにリダイレクト
  if (!session && pathname !== '/login') {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
