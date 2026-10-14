'use client';

import { useCallback, useEffect, useState } from 'react';
import { Timestamp } from 'firebase/firestore';
import { useAuth } from '@/hooks/useAuth';
import { useJournals } from '@/hooks/useJournals';
import { useDocuments } from '@/hooks/useDocuments';
import { getAccountName, CHART_OF_ACCOUNTS } from '@/lib/accounting/chartOfAccounts';
import { TAX_TYPE_LABELS } from '@/lib/accounting/consumptionTax';
import { formatYen } from '@/lib/utils/format';
import { formatDate, toDateInputValue } from '@/lib/utils/date';
import { Page, PageHeader } from '@/components/ui/Page';
import { Card } from '@/components/ui/Card';
import { Button, IconButton } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Banner, EmptyState, Skeleton } from '@/components/ui/Feedback';
import { Icon } from '@/components/ui/Icon';
import type { JournalEntry, AccountCode, TaxType } from '@/types';

const ACCOUNT_OPTIONS = Object.keys(CHART_OF_ACCOUNTS).map((code) => ({ value: code, label: getAccountName(code as AccountCode) }));
const TAX_OPTIONS = Object.entries(TAX_TYPE_LABELS).map(([value, label]) => ({ value, label }));

type Draft = {
  description: string;
  counterparty: string;
  reviewNote: string;
  transactionDate: string;
  debitAccount: AccountCode;
  creditAccount: AccountCode;
  amount: string;
  taxType: TaxType;
};

export default function ReviewPage() {
  const { getToken } = useAuth();
  const { journals, loading, updateJournal, deleteJournal, refetch } = useJournals({ status: 'pending' });
  const { documents } = useDocuments();
  const [names, setNames] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [busyIds, setBusyIds] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<JournalEntry | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editReason, setEditReason] = useState('');
  const [deleting, setDeleting] = useState<JournalEntry | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [saving, setSaving] = useState(false);

  const loadNames = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await fetch('/api/agent-connections', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setNames(Object.fromEntries(data.connections.map((c: { id: string; name: string }) => [c.id, c.name])));
      }
    } catch {
      /* 接続名が取れなくてもレビューは続けられる */
    }
  }, [getToken]);
  useEffect(() => {
    void loadNames();
  }, [loadNames]);

  async function confirm(ids: string[]) {
    if (!ids.length) return;
    setError('');
    setBusyIds((b) => [...b, ...ids]);
    try {
      const token = await getToken();
      const res = await fetch('/api/journals/review', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ journalIds: ids, reason: 'Webレビューで確認' }),
      });
      if (!res.ok) throw new Error((await res.json()).error?.message ?? '確認に失敗しました');
      setSelected((s) => s.filter((id) => !ids.includes(id)));
      await refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : '確認に失敗しました');
    } finally {
      setBusyIds((b) => b.filter((id) => !ids.includes(id)));
    }
  }

  function openEdit(j: JournalEntry) {
    setEditing(j);
    setEditReason('');
    setDraft({
      counterparty: j.counterparty,
      description: j.description,
      reviewNote: j.reviewNote ?? '',
      transactionDate: toDateInputValue(j.transactionDate),
      debitAccount: j.debitAccount,
      creditAccount: j.creditAccount,
      amount: String(j.debitAmount),
      taxType: j.taxType,
    });
  }

  async function saveEdit() {
    if (!editing || !draft || !editReason.trim()) return;
    const amount = Number(draft.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('金額を確認してください');
      return;
    }
    setSaving(true);
    try {
      await updateJournal(
        editing.id,
        {
          description: draft.description,
          counterparty: draft.counterparty,
          reviewNote: draft.reviewNote,
          transactionDate: Timestamp.fromDate(new Date(`${draft.transactionDate}T00:00:00.000Z`)),
          debitAccount: draft.debitAccount,
          creditAccount: draft.creditAccount,
          debitAmount: amount,
          creditAmount: amount,
          taxType: draft.taxType,
        },
        editReason
      );
      setEditing(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '修正に失敗しました');
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleting || !deleteReason.trim()) return;
    setSaving(true);
    try {
      await deleteJournal(deleting.id, deleteReason);
      setSelected((x) => x.filter((v) => v !== deleting.id));
      setDeleting(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '削除に失敗しました');
    } finally {
      setSaving(false);
    }
  }

  const allSelected = journals.length > 0 && selected.length === journals.length;
  const selectedTotal = journals.filter((j) => selected.includes(j.id)).reduce((s, j) => s + j.debitAmount, 0);

  return (
    <Page width="narrow">
      <PageHeader
        title="レビュー"
        subtitle={loading ? '読み込み中…' : journals.length > 0 ? `確認待ち ${journals.length}件 · Agentや手入力の仕訳を確定します` : 'Agentや手入力の仕訳を確定します'}
        actions={
          journals.length > 1 && (
            <Button variant="secondary" size="sm" onClick={() => setSelected(allSelected ? [] : journals.map((j) => j.id))}>
              {allSelected ? '選択を解除' : 'すべて選択'}
            </Button>
          )
        }
      />

      {error && <Banner tone="danger">{error}</Banner>}

      {loading && journals.length === 0 ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-44 rounded-card" />
          ))}
        </div>
      ) : journals.length === 0 ? (
        <Card>
          <EmptyState icon="check" title="確認待ちの仕訳はありません" description="Agentが新しい仕訳を作成すると、ここに表示されます。" />
        </Card>
      ) : (
        <div className="space-y-3">
          {journals.map((j) => {
            const isSelected = selected.includes(j.id);
            const busy = busyIds.includes(j.id);
            const evidence = (j.evidenceIds ?? []).map((id) => documents.find((d) => d.id === id) ?? { id, originalFileName: id, storageUrl: '' });
            return (
              <Card key={j.id} className={`transition-shadow ${isSelected ? 'ring-2 ring-accent/60' : ''}`}>
                <div className="flex gap-3 p-4 sm:gap-4 sm:p-5">
                  <label className="-m-2 flex h-11 w-11 shrink-0 cursor-pointer items-start justify-center pt-2.5">
                    <input
                      type="checkbox"
                      aria-label={`${j.description}を選択`}
                      checked={isSelected}
                      onChange={(e) => setSelected((old) => (e.target.checked ? [...old, j.id] : old.filter((x) => x !== j.id)))}
                      className="h-5 w-5 rounded-md accent-accent"
                    />
                  </label>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-[17px] font-semibold text-ink">{j.counterparty || '取引先未設定'}</p>
                        <p className="mt-0.5 text-[15px] leading-snug text-ink-2 sm:text-sm">{j.description}</p>
                      </div>
                      <p className="num shrink-0 text-[20px] font-semibold tracking-tight text-ink">{formatYen(j.debitAmount)}</p>
                    </div>

                    {/* 借方 → 貸方 */}
                    <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[13px]">
                      <span className="rounded-lg bg-fill/[0.1] px-2 py-1 text-ink">
                        <span className="mr-1 text-ink-3">借</span>
                        {getAccountName(j.debitAccount)}
                      </span>
                      <Icon name="chevronRight" size={14} strokeWidth={2} className="text-ink-3" />
                      <span className="rounded-lg bg-fill/[0.1] px-2 py-1 text-ink">
                        <span className="mr-1 text-ink-3">貸</span>
                        {getAccountName(j.creditAccount)}
                      </span>
                      <span className="ml-1 text-ink-3">{TAX_TYPE_LABELS[j.taxType]}</span>
                    </div>

                    <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-3">
                      <div>
                        <dt className="sr-only">取引日</dt>
                        <dd className="num">{formatDate(j.transactionDate)}</dd>
                      </div>
                      <div className="flex items-center gap-1">
                        <dt className="sr-only">作成元</dt>
                        {j.agentConnectionId && <Icon name="sparkles" size={13} />}
                        <dd>{j.agentConnectionId ? names[j.agentConnectionId] ?? 'Agent' : '手入力'}</dd>
                      </div>
                      {j.sourceReference && (
                        <div className="min-w-0 max-w-full truncate">
                          <dt className="sr-only">参照</dt>
                          <dd className="truncate">参照 {j.sourceReference}</dd>
                        </div>
                      )}
                    </dl>

                    {j.reviewNote && (
                      <p className="mt-3 rounded-xl bg-warning/[0.08] px-3 py-2 text-[13px] leading-relaxed text-ink">{j.reviewNote}</p>
                    )}

                    {evidence.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {evidence.map((doc) =>
                          doc.storageUrl ? (
                            <a
                              key={doc.id}
                              href={doc.storageUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex max-w-full items-center gap-1 rounded-full bg-accent/[0.08] px-2.5 py-1 text-xs text-accent hover:bg-accent/[0.14]"
                            >
                              <Icon name="evidence" size={13} />
                              <span className="truncate">{doc.originalFileName}</span>
                            </a>
                          ) : (
                            <span key={doc.id} className="inline-flex items-center gap-1 rounded-full bg-fill/[0.1] px-2.5 py-1 text-xs text-ink-2">
                              <Icon name="evidence" size={13} />
                              {doc.id}
                            </span>
                          )
                        )}
                      </div>
                    )}

                    <div className="mt-4 flex items-center gap-2">
                      <Button variant="positive" icon="check" loading={busy} onClick={() => confirm([j.id])} className="flex-1 sm:flex-none">
                        確定
                      </Button>
                      <Button variant="secondary" icon="pencil" onClick={() => openEdit(j)} className="flex-1 sm:flex-none">
                        修正
                      </Button>
                      <IconButton
                        icon="trash"
                        label="削除"
                        size={40}
                        className="ml-auto !bg-transparent hover:!bg-negative/10 hover:!text-negative"
                        onClick={() => {
                          setDeleting(j);
                          setDeleteReason('');
                        }}
                      />
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* 一括確定バー（選択時のみ） */}
      {selected.length > 0 && (
        <div className="no-print fixed inset-x-0 bottom-[calc(72px+env(safe-area-inset-bottom))] z-30 flex justify-center px-4 lg:bottom-6 lg:left-[264px]">
          <div className="flex w-full max-w-md animate-sheet-up items-center gap-3 rounded-full bg-surface/95 backdrop-blur-xl border border-line/[0.08] py-2 pl-5 pr-2 shadow-float">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">{selected.length}件を選択</p>
              <p className="num text-xs text-ink-3">{formatYen(selectedTotal)}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setSelected([])}>
              解除
            </Button>
            <Button variant="positive" icon="check" loading={busyIds.length > 0} onClick={() => confirm(selected)}>
              まとめて確定
            </Button>
          </div>
        </div>
      )}

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title="仕訳を修正"
        description="修正履歴は監査ログに残ります"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              キャンセル
            </Button>
            <Button onClick={saveEdit} loading={saving} disabled={!editReason.trim()}>
              修正を保存
            </Button>
          </>
        }
      >
        {draft && (
          <div className="grid grid-cols-1 gap-4 pt-1 sm:grid-cols-2">
            <Input label="取引先" value={draft.counterparty} onChange={(e) => setDraft({ ...draft, counterparty: e.target.value })} />
            <Input label="取引日" type="date" value={draft.transactionDate} onChange={(e) => setDraft({ ...draft, transactionDate: e.target.value })} />
            <Input label="摘要" wrapperClassName="sm:col-span-2" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            <Select label="借方科目" options={ACCOUNT_OPTIONS} value={draft.debitAccount} onChange={(e) => setDraft({ ...draft, debitAccount: e.target.value as AccountCode })} />
            <Select label="貸方科目" options={ACCOUNT_OPTIONS} value={draft.creditAccount} onChange={(e) => setDraft({ ...draft, creditAccount: e.target.value as AccountCode })} />
            <Input label="金額（円）" type="number" inputMode="numeric" min="1" value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} />
            <Select label="税区分" options={TAX_OPTIONS} value={draft.taxType} onChange={(e) => setDraft({ ...draft, taxType: e.target.value as TaxType })} />
            <Input label="レビュー注記" wrapperClassName="sm:col-span-2" value={draft.reviewNote} onChange={(e) => setDraft({ ...draft, reviewNote: e.target.value })} />
            <Input
              label="修正理由（必須）"
              wrapperClassName="sm:col-span-2"
              value={editReason}
              onChange={(e) => setEditReason(e.target.value)}
              placeholder="例: 勘定科目の誤りを修正"
            />
          </div>
        )}
      </Modal>

      <Modal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="仕訳を削除"
        description={deleting ? `${deleting.counterparty || deleting.description} · ${formatYen(deleting.debitAmount)}` : undefined}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleting(null)}>
              キャンセル
            </Button>
            <Button variant="danger" onClick={confirmDelete} loading={saving} disabled={!deleteReason.trim()}>
              削除する
            </Button>
          </>
        }
      >
        <div className="space-y-4 pt-1">
          <p className="text-sm text-ink-2">削除後も監査ログには記録が残ります。</p>
          <Input label="削除理由（必須）" value={deleteReason} onChange={(e) => setDeleteReason(e.target.value)} placeholder="例: 重複登録のため" />
        </div>
      </Modal>
    </Page>
  );
}
