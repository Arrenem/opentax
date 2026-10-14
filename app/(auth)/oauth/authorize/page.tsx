'use client';
export const dynamic = 'force-dynamic';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { useAuth } from '@/hooks/useAuth';
import { AGENT_SCOPES, SCOPE_LABELS, type AgentScope } from '@/lib/auth/scopes';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Input';
import { Banner, Skeleton } from '@/components/ui/Feedback';

type ClientInfo = { clientName: string; redirectHost: string; requestedScopes: AgentScope[] };

// OAuth consent screen for remote MCP hosts (Claude, ChatGPT and others).
function AuthorizeForm() {
  const router = useRouter();
  const query = useSearchParams().toString();
  const { user, loading, getToken, isTestUser } = useAuth();
  const [info, setInfo] = useState<ClientInfo | null>(null);
  const [scopes, setScopes] = useState<AgentScope[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<'allow' | 'deny' | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace(`/login?redirect=${encodeURIComponent(`/oauth/authorize?${query}`)}`);
      return;
    }
    (async () => {
      const res = await fetch(`/api/oauth/authorize?${query}`);
      const data = await res.json();
      if (data.redirect) { window.location.href = data.redirect; return; }
      if (!res.ok) { setError(data.error?.message ?? '接続リクエストが正しくありません'); return; }
      setInfo(data);
      setScopes(data.requestedScopes.length > 0 ? data.requestedScopes : [...AGENT_SCOPES]);
    })().catch(() => setError('接続リクエストを確認できません'));
  }, [loading, user, query, router]);

  async function decide(decision: 'allow' | 'deny') {
    setBusy(decision);
    setError('');
    try {
      const token = await getToken();
      const res = await fetch('/api/oauth/authorize', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, decision, scopes }),
      });
      const data = await res.json();
      if (!data.redirect) throw new Error(data.error?.message ?? '接続に失敗しました');
      window.location.href = data.redirect;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラー');
      setBusy(null);
    }
  }

  return (
    <div className="w-full max-w-[440px]">
      <div className="mb-6 text-center">
        <Image src="/opentax-logo.svg" alt="" width={56} height={56} className="mb-3 inline-block shadow-float" />
        <h1 className="text-[22px] font-bold tracking-tight text-ink">外部エージェントの接続</h1>
      </div>
      <div className="rounded-sheet border border-line/[0.06] bg-surface p-6 shadow-float sm:p-8">
        {isTestUser ? (
          <Banner tone="warning">テストアカウントでは外部エージェントを接続できません。Firebaseアカウントでログインしてください。</Banner>
        ) : error ? (
          <Banner tone="danger">{error}</Banner>
        ) : !info ? (
          <div className="space-y-3">
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : (
          <div className="space-y-5">
            <div>
              <p className="text-[17px] font-semibold text-ink">{info.clientName}</p>
              <p className="mt-1 text-sm text-ink-2">
                が OpenTax へのアクセスを求めています。接続後の戻り先は <span className="num font-medium text-ink">{info.redirectHost}</span> です。
              </p>
            </div>
            <fieldset>
              <legend className="mb-1 text-[13px] font-medium text-ink-2">許可する権限</legend>
              {AGENT_SCOPES.map((scope) => (
                <Checkbox
                  key={scope}
                  label={SCOPE_LABELS[scope]}
                  checked={scopes.includes(scope)}
                  onChange={(e) => setScopes(e.target.checked ? [...scopes, scope] : scopes.filter((s) => s !== scope))}
                />
              ))}
            </fieldset>
            <p className="text-xs leading-relaxed text-ink-3">
              エージェントが作成した仕訳は保留として登録され、確定はレビュー画面であなたが行います。接続は「Agent接続」からいつでも失効できます。
            </p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={() => decide('deny')} loading={busy === 'deny'} disabled={busy !== null}>
                拒否
              </Button>
              <Button onClick={() => decide('allow')} loading={busy === 'allow'} disabled={busy !== null || scopes.length === 0}>
                許可して接続
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AuthorizePage() {
  return (
    <Suspense fallback={<div className="h-96 w-full max-w-[440px] animate-pulse rounded-sheet bg-surface" />}>
      <AuthorizeForm />
    </Suspense>
  );
}
