'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { AGENT_SCOPES, SCOPE_LABELS as LABELS, type AgentScope } from '@/lib/auth/scopes';
import { Page, PageHeader, Section } from '@/components/ui/Page';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Checkbox, Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Banner, EmptyState } from '@/components/ui/Feedback';
import { Icon } from '@/components/ui/Icon';

type Connection = {
  id: string;
  name: string;
  tokenPrefix: string;
  scopes: AgentScope[];
  createdAt: { _seconds: number };
  lastUsedAt?: { _seconds: number };
  revokedAt?: { _seconds: number };
  authType?: 'token' | 'oauth';
};

function date(ts?: { _seconds: number }) {
  return ts ? new Date(ts._seconds * 1000).toLocaleString('ja-JP', { dateStyle: 'medium', timeStyle: 'short' }) : '未使用';
}

export default function AgentConnectionsPage() {
  const { getToken } = useAuth();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<AgentScope[]>(['read']);
  const [oneTimeToken, setOneTimeToken] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [revoking, setRevoking] = useState<Connection | null>(null);
  const [mcpUrl, setMcpUrl] = useState('');
  const [urlCopied, setUrlCopied] = useState(false);
  useEffect(() => setMcpUrl(`${window.location.origin}/api/mcp`), []);

  const refresh = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await fetch('/api/agent-connections', { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('接続一覧を取得できません');
      setConnections((await res.json()).connections);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラー');
    }
  }, [getToken]);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setOneTimeToken('');
    setCopied(false);
    try {
      const token = await getToken();
      const res = await fetch('/api/agent-connections', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, scopes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message ?? '作成に失敗しました');
      setOneTimeToken(data.token);
      setName('');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラー');
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    try {
      const token = await getToken();
      const res = await fetch('/api/agent-connections', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error('失効に失敗しました');
      setRevoking(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラー');
    }
  }

  return (
    <Page width="narrow">
      <PageHeader title="Agent接続" subtitle="Claude・ChatGPT・Claude Code・Codex などのMCPエージェントを、権限を絞って接続します" />

      {error && <Banner tone="danger">{error}</Banner>}

      {oneTimeToken && (
        <Card className="ring-2 ring-warning/40">
          <CardContent className="space-y-3">
            <p className="flex items-center gap-2 font-semibold text-ink">
              <Icon name="warning" size={18} className="text-warning" />
              今すぐトークンを保存してください
            </p>
            <p className="text-sm text-ink-2">このトークンは再表示できません。</p>
            <code className="num block select-all break-all rounded-xl bg-fill/[0.08] p-3 text-[13px] text-ink">{oneTimeToken}</code>
            <div className="flex gap-2">
              <Button
                icon={copied ? 'check' : 'copy'}
                onClick={async () => {
                  await navigator.clipboard.writeText(oneTimeToken);
                  setCopied(true);
                }}
              >
                {copied ? 'コピーしました' : 'コピー'}
              </Button>
              <Button variant="ghost" onClick={() => setOneTimeToken('')}>
                閉じる
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader title="リモートMCP" description="ClaudeやChatGPTのチャットに、このURLをカスタムコネクタとして追加します" />
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <code className="num min-w-0 flex-1 select-all truncate rounded-xl bg-fill/[0.08] px-3 py-2.5 text-[13px] text-ink">{mcpUrl}</code>
            <Button
              variant="secondary"
              icon={urlCopied ? 'check' : 'copy'}
              onClick={async () => {
                await navigator.clipboard.writeText(mcpUrl);
                setUrlCopied(true);
              }}
            >
              {urlCopied ? 'コピー済み' : 'コピー'}
            </Button>
          </div>
          <p className="text-xs leading-relaxed text-ink-3">
            追加するとOpenTaxの許可画面が開き、そこで権限を選んで接続します。接続はこの一覧に「OAuth」として表示され、ここから失効できます。
            トークンを直接設定できるエージェントは、下で発行したトークンを <span className="num">Authorization: Bearer</span> ヘッダーに設定しても接続できます。
          </p>
        </CardContent>
      </Card>

      <Section title="接続中のエージェント">
        <Card className="overflow-hidden">
          {connections.length === 0 ? (
            <EmptyState icon="agent" title="接続はありません" description="下のフォームから最初の接続を作成します。" />
          ) : (
            <ul className="divide-y divide-line/[0.06]">
              {connections.map((c) => (
                <li key={c.id} className={`flex items-start gap-3 px-4 py-4 sm:px-6 ${c.revokedAt ? 'opacity-55' : ''}`}>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-accent/10 text-accent">
                    <Icon name="sparkles" size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-[15px] font-medium text-ink sm:text-sm">
                      {c.name}
                      {c.authType === 'oauth' && <Badge>OAuth</Badge>}
                      {c.revokedAt && <Badge variant="red">失効済み</Badge>}
                    </p>
                    <p className="num mt-0.5 text-xs text-ink-3">
                      {c.authType === 'oauth' ? 'リモートMCP' : `${c.tokenPrefix}…`} · 最終利用 {date(c.lastUsedAt)}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {c.scopes.map((s) => (
                        <Badge key={s}>{LABELS[s]}</Badge>
                      ))}
                    </div>
                  </div>
                  {!c.revokedAt && (
                    <Button variant="danger-tinted" size="sm" onClick={() => setRevoking(c)}>
                      失効
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </Section>

      <Card>
        <CardHeader title="新しい接続" description="必要最小限の権限を選んでください" />
        <CardContent>
          <form onSubmit={create} className="space-y-4">
            <Input label="接続名" value={name} onChange={(e) => setName(e.target.value)} placeholder="例: 自分のCodex" required maxLength={100} />
            <fieldset>
              <legend className="mb-1 text-[13px] font-medium text-ink-2">権限</legend>
              <div className="grid grid-cols-1 sm:grid-cols-2 sm:gap-x-4">
                {AGENT_SCOPES.map((scope) => (
                  <Checkbox
                    key={scope}
                    label={LABELS[scope]}
                    checked={scopes.includes(scope)}
                    onChange={(e) => setScopes(e.target.checked ? [...scopes, scope] : scopes.filter((s) => s !== scope))}
                  />
                ))}
              </div>
            </fieldset>
            <Button type="submit" icon="plus" loading={busy} disabled={scopes.length === 0} className="w-full sm:w-auto">
              接続を作成
            </Button>
          </form>
        </CardContent>
      </Card>

      <Modal
        open={revoking !== null}
        onClose={() => setRevoking(null)}
        title="接続を失効"
        description={revoking?.name}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRevoking(null)}>
              キャンセル
            </Button>
            <Button variant="danger" onClick={() => revoking && revoke(revoking.id)}>
              失効させる
            </Button>
          </>
        }
      >
        <p className="pt-1 text-sm text-ink-2">この接続を使うエージェントは、以後OpenTaxにアクセスできなくなります。</p>
      </Modal>
    </Page>
  );
}
