'use client';

import { useState } from 'react';
import type { JournalEntry, AccountCode } from '@/types';
import { JournalBadge } from './JournalBadge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input, Select } from '@/components/ui/Input';
import { EmptyState, Spinner } from '@/components/ui/Feedback';
import { getAccountName, CHART_OF_ACCOUNTS } from '@/lib/accounting/chartOfAccounts';
import { TAX_TYPE_LABELS } from '@/lib/accounting/consumptionTax';
import { formatYen } from '@/lib/utils/format';
import { formatDate } from '@/lib/utils/date';

interface JournalTableProps {
  journals: JournalEntry[];
  onConfirm: (id: string) => Promise<void>;
  onUpdate: (id: string, updates: Partial<JournalEntry>, reason: string) => Promise<void>;
  onDelete: (id: string, reason: string) => Promise<void>;
  loading?: boolean;
}

const ACCOUNT_OPTIONS = Object.entries(CHART_OF_ACCOUNTS).map(([key, def]) => ({ value: key, label: `${def.name} (${def.code})` }));
const TAX_TYPE_OPTIONS = Object.entries(TAX_TYPE_LABELS).map(([key, label]) => ({ value: key, label }));

const TH = 'px-4 py-3 text-left text-xs font-medium text-ink-3 first:pl-6 last:pr-6';
const TD = 'px-4 py-3.5 first:pl-6 last:pr-6';

export function JournalTable({ journals, onConfirm, onUpdate, onDelete, loading = false }: JournalTableProps) {
  const [editing, setEditing] = useState<JournalEntry | null>(null);
  const [editForm, setEditForm] = useState<Partial<JournalEntry>>({});
  const [editReason, setEditReason] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteReason, setDeleteReason] = useState('');
  const [saving, setSaving] = useState(false);

  function open(journal: JournalEntry) {
    setEditing(journal);
    setDeleting(false);
    setEditReason('');
    setDeleteReason('');
    setEditForm({
      debitAccount: journal.debitAccount,
      creditAccount: journal.creditAccount,
      debitAmount: journal.debitAmount,
      creditAmount: journal.creditAmount,
      description: journal.description,
      counterparty: journal.counterparty,
      taxType: journal.taxType,
    });
  }

  async function run(action: () => Promise<void>) {
    setSaving(true);
    try {
      await action();
      setEditing(null);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Spinner />;
  if (journals.length === 0) {
    return <EmptyState icon="journal" title="該当する仕訳はありません" description="期間や状態の条件を変えてみてください。" />;
  }

  return (
    <>
      {/* デスクトップ: 表 */}
      <div className="hidden overflow-x-auto md:block">
        <table className="min-w-full text-sm">
          <thead className="border-b border-line/[0.06]">
            <tr>
              <th className={TH}>取引日</th>
              <th className={TH}>取引先 / 摘要</th>
              <th className={TH}>借方</th>
              <th className={TH}>貸方</th>
              <th className={`${TH} text-right`}>金額</th>
              <th className={TH}>税区分</th>
              <th className={TH}>状態</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/[0.05]">
            {journals.map((j) => (
              <tr
                key={j.id}
                onClick={() => open(j)}
                className="cursor-pointer transition-colors hover:bg-fill/[0.05]"
              >
                <td className={`${TD} num whitespace-nowrap text-ink-2`}>{formatDate(j.transactionDate)}</td>
                <td className={`${TD} max-w-[320px]`}>
                  <div className="truncate font-medium text-ink">{j.counterparty || '—'}</div>
                  <div className="truncate text-xs text-ink-3">{j.description}</div>
                </td>
                <td className={`${TD} whitespace-nowrap text-ink`}>{getAccountName(j.debitAccount)}</td>
                <td className={`${TD} whitespace-nowrap text-ink-2`}>{getAccountName(j.creditAccount)}</td>
                <td className={`${TD} num whitespace-nowrap text-right font-medium text-ink`}>{formatYen(j.debitAmount)}</td>
                <td className={`${TD} whitespace-nowrap text-xs text-ink-3`}>{TAX_TYPE_LABELS[j.taxType]}</td>
                <td className={TD}>
                  <JournalBadge status={j.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* モバイル: 行リスト */}
      <ul className="divide-y divide-line/[0.06] md:hidden">
        {journals.map((j) => (
          <li key={j.id}>
            <button type="button" onClick={() => open(j)} className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-fill/[0.08]">
              <span className="num w-10 shrink-0 text-center text-[13px] text-ink-3">{formatDate(j.transactionDate, 'M/d')}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] text-ink">{j.counterparty || j.description}</span>
                <span className="mt-0.5 block truncate text-[13px] text-ink-3">
                  {getAccountName(j.debitAccount)} / {getAccountName(j.creditAccount)}
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                <span className="num text-[15px] font-medium text-ink">{formatYen(j.debitAmount)}</span>
                {j.status === 'pending' && <JournalBadge status={j.status} />}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <Modal
        open={editing !== null && !deleting}
        onClose={() => setEditing(null)}
        title="仕訳の詳細"
        description={editing ? `${formatDate(editing.transactionDate)} · 修正履歴は監査ログに残ります` : undefined}
        size="lg"
        footer={
          editing && (
            <>
              <Button variant="danger-tinted" icon="trash" onClick={() => setDeleting(true)} className="sm:mr-auto">
                削除
              </Button>
              {editing.status !== 'confirmed' && (
                <Button variant="positive" icon="check" loading={saving} onClick={() => run(() => onConfirm(editing.id))}>
                  確定
                </Button>
              )}
              <Button
                onClick={() => run(() => onUpdate(editing.id, editForm, editReason))}
                loading={saving}
                disabled={!editReason.trim()}
              >
                修正を保存
              </Button>
            </>
          )
        }
      >
        <div className="grid grid-cols-1 gap-4 pt-1 sm:grid-cols-2">
          <Input label="取引先" value={editForm.counterparty ?? ''} onChange={(e) => setEditForm((f) => ({ ...f, counterparty: e.target.value }))} />
          <Input
            label="金額（円）"
            type="number"
            inputMode="numeric"
            value={editForm.debitAmount ?? ''}
            onChange={(e) => setEditForm((f) => ({ ...f, debitAmount: Number(e.target.value), creditAmount: Number(e.target.value) }))}
          />
          <Input
            label="摘要"
            wrapperClassName="sm:col-span-2"
            value={editForm.description ?? ''}
            onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
          />
          <Select
            label="借方科目"
            value={editForm.debitAccount ?? ''}
            onChange={(e) => setEditForm((f) => ({ ...f, debitAccount: e.target.value as AccountCode }))}
            options={ACCOUNT_OPTIONS}
          />
          <Select
            label="貸方科目"
            value={editForm.creditAccount ?? ''}
            onChange={(e) => setEditForm((f) => ({ ...f, creditAccount: e.target.value as AccountCode }))}
            options={ACCOUNT_OPTIONS}
          />
          <Select
            label="消費税区分"
            value={editForm.taxType ?? ''}
            onChange={(e) => setEditForm((f) => ({ ...f, taxType: e.target.value as JournalEntry['taxType'] }))}
            options={TAX_TYPE_OPTIONS}
          />
          <Input
            label="修正理由（修正時は必須）"
            value={editReason}
            onChange={(e) => setEditReason(e.target.value)}
            placeholder="例: 勘定科目の誤りを修正"
          />
        </div>
      </Modal>

      <Modal
        open={editing !== null && deleting}
        onClose={() => setDeleting(false)}
        title="仕訳を削除"
        description={editing ? `${editing.counterparty || editing.description} · ${formatYen(editing.debitAmount)}` : undefined}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleting(false)}>
              戻る
            </Button>
            <Button
              variant="danger"
              onClick={() => editing && run(() => onDelete(editing.id, deleteReason))}
              loading={saving}
              disabled={!deleteReason.trim()}
            >
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
    </>
  );
}
