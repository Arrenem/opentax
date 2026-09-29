'use client';
export const dynamic = 'force-dynamic';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { signInWithEmail, signUpWithEmail, signInWithGoogle, onAuthChange } from '@/lib/firebase/auth';
import { setSessionCookie } from '@/lib/firebase/session';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Icon } from '@/components/ui/Icon';
import { Banner } from '@/components/ui/Feedback';
import { Segmented } from '@/components/ui/Segmented';
import { TEST_EMAIL, TEST_PASSWORD, setTestSession, isTestSession } from '@/lib/test/testAuth';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedRedirect = searchParams.get('redirect') ?? '/';
  const redirect = requestedRedirect.startsWith('/') && !requestedRedirect.startsWith('//') ? requestedRedirect : '/';
  const demoEnabled = process.env.NODE_ENV !== 'production';

  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 既にFirebaseの認証セッションが有効な状態でログイン画面を開いた場合
  // （例: __session クッキーだけ消えた等）、セッションクッキーを再設定してリダイレクトする
  useEffect(() => {
    if (demoEnabled && isTestSession()) return;
    const unsub = onAuthChange((user) => {
      if (user) {
        setSessionCookie('firebase');
        router.push(redirect);
      }
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleEmailAuth(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      // テストアカウントの場合は Firebase を使わずローカルセッションを設定
      if (demoEnabled && email === TEST_EMAIL && password === TEST_PASSWORD) {
        setTestSession();
        router.push(redirect);
        return;
      }

      if (mode === 'login') {
        await signInWithEmail(email, password);
      } else {
        await signUpWithEmail(email, password);
      }
      // ミドルウェアが __session クッキーを確認するので設定する
      setSessionCookie('firebase');
      router.push(redirect);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'エラーが発生しました';
      if (msg.includes('invalid-credential') || msg.includes('wrong-password')) {
        setError('メールアドレスまたはパスワードが正しくありません');
      } else if (msg.includes('email-already-in-use')) {
        setError('このメールアドレスはすでに使用されています');
      } else if (msg.includes('weak-password')) {
        setError('パスワードは6文字以上で設定してください');
      } else {
        setError('認証に失敗しました。しばらく後にお試しください');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setLoading(true);
    setError('');
    try {
      await signInWithGoogle();
      // ミドルウェアが __session クッキーを確認するので設定する
      setSessionCookie('firebase');
      router.push(redirect);
    } catch {
      setError('Googleログインに失敗しました');
    } finally {
      setLoading(false);
    }
  }

  function handleTestLogin() {
    setTestSession();
    router.push(redirect);
  }

  return (
    <div className="w-full max-w-[400px]">
      <div className="mb-8 text-center">
        <Image src="/opentax-logo.svg" alt="" width={64} height={64} className="mb-4 inline-block shadow-float" />
        <h1 className="text-[28px] font-bold tracking-tight text-ink">OpenTax</h1>
        <p className="mt-1 text-sm text-ink-2">個人事業主のための青色申告会計</p>
      </div>
      <div className="rounded-sheet border border-line/[0.06] bg-surface p-6 shadow-float sm:p-8">
        <Segmented
          block
          className="mb-6"
          label="ログインまたは新規登録"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'login', label: 'ログイン' },
            { value: 'signup', label: '新規登録' },
          ]}
        />

        <form onSubmit={handleEmailAuth} className="space-y-4">
          <Input
            label="メールアドレス"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
          <Input
            label="パスワード"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            required
            minLength={6}
          />
          {error && <Banner tone="danger">{error}</Banner>}
          <Button type="submit" size="lg" className="w-full" loading={loading}>
            {mode === 'login' ? 'ログイン' : 'アカウントを作成'}
          </Button>
        </form>

        <div className="relative my-5">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-line/[0.08]" />
          </div>
          <div className="relative flex justify-center text-xs text-ink-3">
            <span className="bg-surface px-3">または</span>
          </div>
        </div>

        <Button
          type="button"
          variant="secondary"
          size="lg"
          className="w-full"
          onClick={handleGoogle}
          loading={loading}
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          Googleでログイン
        </Button>

        {/* 開発環境のみのデモ */}
        {demoEnabled && (
          <div className="mt-5 border-t border-line/[0.06] pt-5">
            <button
              type="button"
              onClick={handleTestLogin}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-warning/10 text-sm font-medium text-warning transition-colors hover:bg-warning/15"
            >
              <Icon name="sparkles" size={18} />
              テストアカウントで試す（ネット不要）
            </button>
            <p className="mt-2 text-center text-xs text-ink-3">サンプルデータで全機能を試せます</p>
          </div>
        )}
      </div>
      <p className="mt-6 px-4 text-center text-xs leading-relaxed text-ink-3">
        本アプリは個人利用目的のツールです。税務申告の正確性は税理士にご確認ください。
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="h-96 w-full max-w-[400px] animate-pulse rounded-sheet bg-surface" />}>
      <LoginForm />
    </Suspense>
  );
}
