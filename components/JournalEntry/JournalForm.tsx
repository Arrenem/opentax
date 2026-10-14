'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Checkbox, Input, Select } from '@/components/ui/Input';
import { CHART_OF_ACCOUNTS } from '@/lib/accounting/chartOfAccounts';
import { TAX_TYPE_LABELS } from '@/lib/accounting/consumptionTax';
import type { AccountCode, TaxType, SourceType } from '@/types';

interface JournalFormProps {
  onSubmit: (data: JournalFormData) => Promise<void>;
  onCancel?: () => void;
}

export interface JournalFormData {
  transactionDate: string;
  debitAccount: AccountCode;
  creditAccount: AccountCode;
  amount: number;
  counterparty: string;
  description: string;
  taxType: TaxType;
  taxIncluded: boolean;
  sourceType: SourceType;
}

const ACCOUNT_OPTIONS = Object.entries(CHART_OF_ACCOUNTS).map(([key, def]) => ({ value: key, label: `${def.name} (${def.code})` }));
const TAX_TYPE_OPTIONS = Object.entries(TAX_TYPE_LABELS).map(([key, label]) => ({ value: key, label }));
const SOURCE_TYPE_OPTIONS = [
  { value: 'manual', label: '手動入力' },
  { value: 'credit_card', label: 'クレジットカード' },
  { value: 'bank', label: '銀行' },
  { value: 'invoice', label: '請求書（受領）' },
  { value: 'issued_document', label: '発行帳票' },
];

export function JournalForm({ onSubmit, onCancel }: JournalFormProps) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<JournalFormData>({
    transactionDate: new Date().toISOString().split('T')[0],
    debitAccount: 'SUPPLIES',
    creditAccount: 'BANK',
    amount: 0,
    counterparty: '',
    description: '',
    taxType: 'standard10',
    taxIncluded: true,
    sourceType: 'manual',
  });
  const [errors, setErrors] = useState<Partial<Record<keyof JournalFormData, string>>>({});

  function validate(): boolean {
    const next: Partial<Record<keyof JournalFormData, string>> = {};
    if (!form.transactionDate) next.transactionDate = '取引日を入力してください';
    if (form.amount <= 0) next.amount = '金額は1円以上で入力してください';
    if (!form.description.trim()) next.description = '摘要を入力してください';
    if (form.debitAccount === form.creditAccount) next.debitAccount = '借方と貸方に同じ科目は使用できません';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      await onSubmit(form);
    } finally {
      setSaving(false);
    }
  }

  function set<K extends keyof JournalFormData>(key: K, value: JournalFormData[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 pt-1">
      {/* よく使う項目を先に */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          label="金額（円）"
          type="number"
          inputMode="numeric"
          min={1}
          autoFocus
          value={form.amount || ''}
          onChange={(e) => set('amount', Number(e.target.value))}
          error={errors.amount}
          className="text-lg font-semibold sm:text-base"
        />
        <Input label="取引日" type="date" value={form.transactionDate} onChange={(e) => set('transactionDate', e.target.value)} error={errors.transactionDate} />
        <Input label="取引先" value={form.counterparty} onChange={(e) => set('counterparty', e.target.value)} placeholder="例: Amazon Japan" />
        <Input label="摘要" value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="例: 事務用品購入" error={errors.description} />
        <Select
          label="借方科目"
          value={form.debitAccount}
          onChange={(e) => set('debitAccount', e.target.value as AccountCode)}
          options={ACCOUNT_OPTIONS}
          error={errors.debitAccount}
        />
        <Select label="貸方科目" value={form.creditAccount} onChange={(e) => set('creditAccount', e.target.value as AccountCode)} options={ACCOUNT_OPTIONS} />
      </div>

      <details className="group rounded-2xl bg-fill/[0.06] px-4 py-1">
        <summary className="flex h-11 cursor-pointer list-none items-center justify-between text-sm font-medium text-ink-2">
          税区分・入力区分
          <span className="text-xs text-ink-3 group-open:hidden">{TAX_TYPE_LABELS[form.taxType]}・{form.taxIncluded ? '税込' : '税抜'}</span>
        </summary>
        <div className="grid grid-cols-1 gap-4 pb-4 sm:grid-cols-2">
          <Select label="消費税区分" value={form.taxType} onChange={(e) => set('taxType', e.target.value as TaxType)} options={TAX_TYPE_OPTIONS} />
          <Select label="入力区分" value={form.sourceType} onChange={(e) => set('sourceType', e.target.value as SourceType)} options={SOURCE_TYPE_OPTIONS} />
          <Checkbox label="金額は税込" checked={form.taxIncluded} onChange={(e) => set('taxIncluded', e.target.checked)} />
        </div>
      </details>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {onCancel && (
          <Button variant="secondary" onClick={onCancel}>
            キャンセル
          </Button>
        )}
        <Button type="submit" loading={saving}>
          仕訳を登録
        </Button>
      </div>
    </form>
  );
}
