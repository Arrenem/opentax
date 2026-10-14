'use client';
export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { useAssets } from '@/hooks/useAssets';
import { useSettings } from '@/hooks/useSettings';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Checkbox, Input, Select } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Page, PageHeader, Section } from '@/components/ui/Page';
import { EmptyState, Spinner } from '@/components/ui/Feedback';
import { Stat } from '@/components/ui/Stat';
import { calcDepreciationForYear, USEFUL_LIFE_PRESETS } from '@/lib/tax/depreciation';
import { formatYen } from '@/lib/utils/format';
import type { DepreciationMethod, FixedAsset } from '@/types';

const EMPTY: Omit<FixedAsset, 'id'> = {
  name: '',
  acquiredOn: new Date().toISOString().slice(0, 10),
  acquisitionCost: 0,
  usefulLifeYears: 4,
  method: 'straight_line',
  businessUseRatio: 100,
  accumulatedDepreciation: 0,
  isDisposed: false,
  note: '',
};

const METHOD_OPTIONS = [
  { value: 'straight_line', label: '定額法' },
  { value: 'immediate', label: '少額減価償却資産（即時）' },
  { value: 'lump_sum', label: '一括償却（3年）' },
  { value: 'none', label: '消耗品（10万円未満）' },
];

function methodLabel(method: DepreciationMethod): string {
  switch (method) {
    case 'immediate':
      return '少額特例';
    case 'lump_sum':
      return '一括償却';
    case 'none':
      return '消耗品';
    default:
      return '定額法';
  }
}

export default function AssetsPage() {
  const { assets, save, loading, saving } = useAssets();
  const { settings } = useSettings();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<FixedAsset | null>(null);
  const [form, setForm] = useState(EMPTY);
  const year = new Date().getFullYear();
  const summary = calcDepreciationForYear(year, assets, settings.filingType === 'blue');

  function openNew() {
    setEditing(null);
    setForm(EMPTY);
    setOpen(true);
  }

  function openEdit(asset: FixedAsset) {
    setEditing(asset);
    const { id, ...rest } = asset;
    void id;
    setForm(rest);
    setOpen(true);
  }

  async function handleSave() {
    const next: FixedAsset = { id: editing?.id ?? `asset_${Date.now()}`, ...form };
    await save(editing ? assets.map((a) => (a.id === editing.id ? next : a)) : [...assets, next]);
    setOpen(false);
  }

  async function handleDelete() {
    if (!editing) return;
    await save(assets.filter((a) => a.id !== editing.id));
    setOpen(false);
  }

  return (
    <Page>
      <PageHeader
        title="固定資産"
        subtitle="個人事業主は原則定額法。10万円未満は消耗品、30万円未満は青色の少額特例（年300万円まで）"
        actions={
          <Button icon="plus" onClick={openNew}>
            資産を追加
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label={`${year}年の減価償却費`} yen={summary.totalDeductible} tone="accent" />
        <Stat label="少額特例の使用額" yen={summary.immediateUsed} />
        <Stat label="少額特例の残枠" yen={summary.immediateRemaining} />
      </div>

      <Section title="資産台帳">
        <Card className="overflow-hidden">
          {loading ? (
            <Spinner />
          ) : assets.length === 0 ? (
            <EmptyState icon="asset" title="資産がありません" description="10万円以上のPCや機材を購入したら登録します。" />
          ) : (
            <ul className="divide-y divide-line/[0.06]">
              {assets.map((a) => {
                const row = summary.items.find((i) => i.assetId === a.id);
                return (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => openEdit(a)}
                      className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-fill/[0.05] sm:px-6 ${a.isDisposed ? 'opacity-50' : ''}`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-medium text-ink sm:text-sm">{a.name}</span>
                        <span className="num mt-0.5 block truncate text-[13px] text-ink-3">
                          {a.acquiredOn} · {methodLabel(a.method)} · 取得 {formatYen(a.acquisitionCost)}
                          {row?.note ? ` · ${row.note}` : ''}
                        </span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end">
                        <span className="num text-[15px] font-medium text-ink sm:text-sm">{formatYen(row?.deductibleAmount ?? 0)}</span>
                        <span className="text-xs text-ink-3">今年の償却</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </Section>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? '資産を編集' : '資産を追加'}
        size="lg"
        footer={
          <>
            {editing && (
              <Button variant="danger-tinted" icon="trash" onClick={handleDelete} className="sm:mr-auto">
                削除
              </Button>
            )}
            <Button variant="secondary" onClick={() => setOpen(false)}>
              キャンセル
            </Button>
            <Button onClick={handleSave} loading={saving} disabled={!form.name || form.acquisitionCost <= 0}>
              保存
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-4 pt-1 sm:grid-cols-2">
          <Input label="名称" wrapperClassName="sm:col-span-2" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input label="取得日" type="date" value={form.acquiredOn} onChange={(e) => setForm({ ...form, acquiredOn: e.target.value })} />
          <Input
            label="取得価額（税込・円）"
            type="number"
            inputMode="numeric"
            value={form.acquisitionCost || ''}
            onChange={(e) => setForm({ ...form, acquisitionCost: Number(e.target.value) })}
          />
          <Select label="償却方法" value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value as DepreciationMethod })} options={METHOD_OPTIONS} />
          <Select
            label="耐用年数"
            value={String(form.usefulLifeYears)}
            onChange={(e) => setForm({ ...form, usefulLifeYears: Number(e.target.value) })}
            options={USEFUL_LIFE_PRESETS.map((p) => ({ value: String(p.years), label: p.label }))}
          />
          <Input
            label="事業供用割合（%）"
            type="number"
            inputMode="numeric"
            min={0}
            max={100}
            value={form.businessUseRatio}
            onChange={(e) => setForm({ ...form, businessUseRatio: Number(e.target.value) })}
          />
          <Input
            label="期首減価償却累計額（円）"
            type="number"
            inputMode="numeric"
            value={form.accumulatedDepreciation || ''}
            onChange={(e) => setForm({ ...form, accumulatedDepreciation: Number(e.target.value) })}
          />
          <Checkbox label="除却済み" checked={form.isDisposed} onChange={(e) => setForm({ ...form, isDisposed: e.target.checked })} />
        </div>
      </Modal>
    </Page>
  );
}
