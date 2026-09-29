'use client';
export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { useSettings } from '@/hooks/useSettings';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Page, PageHeader } from '@/components/ui/Page';
import { Banner, Spinner } from '@/components/ui/Feedback';
import { IconButton } from '@/components/ui/Button';
import type { BankAccount, UserSettings } from '@/types';
import { BANK_ACCOUNT_TYPE_LABELS } from '@/types';
import { getMaxBlueFormDeduction, isSpecial20PctYear, isSpecial30PctYear } from '@/lib/tax/taxYearRules';

export default function SettingsPage() {
  const { settings, loading, saving, save, error } = useSettings();
  const [form, setForm] = useState<UserSettings | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const current = form ?? settings;
  const year = new Date().getFullYear();
  const blue = getMaxBlueFormDeduction(year, current);

  function set<K extends keyof UserSettings>(key: K, value: UserSettings[K]) {
    setForm({ ...current, [key]: value });
  }

  const bankAccounts = current.bankAccounts ?? [];

  function setBankAccounts(next: BankAccount[]) {
    set('bankAccounts', next);
  }

  function addBankAccount() {
    setBankAccounts([
      ...bankAccounts,
      {
        id: `bank-${Date.now()}`,
        bankName: '',
        branchName: '',
        accountType: 'ordinary',
        accountNumber: '',
        accountHolder: '',
        isDefault: bankAccounts.length === 0,
      },
    ]);
  }

  function updateBankAccount(id: string, patch: Partial<BankAccount>) {
    setBankAccounts(bankAccounts.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  }

  function removeBankAccount(id: string) {
    const rest = bankAccounts.filter((a) => a.id !== id);
    if (rest.length > 0 && !rest.some((a) => a.isDefault)) rest[0] = { ...rest[0], isDefault: true };
    setBankAccounts(rest);
  }

  function setDefaultBankAccount(id: string) {
    setBankAccounts(bankAccounts.map((a) => ({ ...a, isDefault: a.id === id })));
  }

  async function handleSave() {
    setMessage(null);
    await save(current);
    setForm(null);
    setMessage('保存しました');
  }

  if (loading) {
    return <Spinner className="py-32" />;
  }

  return (
    <Page width="narrow" className="pb-32">
      <PageHeader title="事業設定" subtitle="帳票と確定申告の計算に使う情報です" />
      {message && !form && <Banner tone="success">{message}</Banner>}

      <Card>
        <CardHeader title="事業者情報" description="請求書の発行元として表示されます" />
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="屋号" value={current.businessName} onChange={(e) => set('businessName', e.target.value)} />
          <Input label="氏名" value={current.ownerName} onChange={(e) => set('ownerName', e.target.value)} />
          <Input label="住所" value={current.address ?? ''} onChange={(e) => set('address', e.target.value)} wrapperClassName="sm:col-span-2" />
          <Input label="所轄税務署" value={current.taxOffice ?? ''} onChange={(e) => set('taxOffice', e.target.value)} />
          <Input
            label="インボイス登録番号"
            value={current.invoiceRegistrationNumber}
            onChange={(e) => set('invoiceRegistrationNumber', e.target.value)}
            placeholder="T + 13桁"
          />
          <Select
            label="適格請求書発行事業者"
            value={current.isInvoiceIssuer ? 'yes' : 'no'}
            onChange={(e) => set('isInvoiceIssuer', e.target.value === 'yes')}
            options={[{ value: 'yes', label: '登録済み' }, { value: 'no', label: '未登録' }]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="振込先口座" action={<Button variant="secondary" size="sm" icon="plus" onClick={addBankAccount}>口座を追加</Button>} />
        <CardContent className="space-y-4">
          {bankAccounts.length === 0 ? (
            <p className="text-sm text-ink-2">口座を追加すると、請求書に「お振込先」として毎回記載されます。</p>
          ) : (
            <p className="text-xs text-ink-3">「請求書に記載」を選んだ口座が請求書（画面・PDF）に表示されます。</p>
          )}
          {bankAccounts.map((account) => (
            <div key={account.id} className="space-y-3 rounded-2xl bg-fill/[0.05] p-4">
              <div className="flex items-center justify-between">
                <label className="flex min-h-[36px] items-center gap-2 text-sm text-ink">
                  <input
                    className="h-4 w-4 accent-accent"
                    type="radio"
                    name="defaultBankAccount"
                    checked={Boolean(account.isDefault)}
                    onChange={() => setDefaultBankAccount(account.id)}
                  />
                  請求書に記載
                </label>
                <IconButton icon="trash" label="口座を削除" className="!bg-transparent hover:!text-negative" onClick={() => removeBankAccount(account.id)} />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input label="銀行名" value={account.bankName} onChange={(e) => updateBankAccount(account.id, { bankName: e.target.value })} placeholder="〇〇銀行" />
                <Input label="支店名" value={account.branchName} onChange={(e) => updateBankAccount(account.id, { branchName: e.target.value })} placeholder="〇〇支店" />
                <Select
                  label="預金種目"
                  value={account.accountType}
                  onChange={(e) => updateBankAccount(account.id, { accountType: e.target.value as BankAccount['accountType'] })}
                  options={Object.entries(BANK_ACCOUNT_TYPE_LABELS).map(([value, label]) => ({ value, label }))}
                />
                <Input label="口座番号" inputMode="numeric" value={account.accountNumber} onChange={(e) => updateBankAccount(account.id, { accountNumber: e.target.value })} />
                <div className="sm:col-span-2">
                  <Input label="口座名義（カナ）" value={account.accountHolder} onChange={(e) => updateBankAccount(account.id, { accountHolder: e.target.value })} />
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="所得税・青色申告" />
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            label="申告の種類"
            value={current.filingType}
            onChange={(e) => set('filingType', e.target.value as UserSettings['filingType'])}
            options={[{ value: 'blue', label: '青色申告' }, { value: 'white', label: '白色申告' }]}
          />
          <Select
            label="e-Taxで申告する"
            value={current.eTaxFiling ? 'yes' : 'no'}
            onChange={(e) => set('eTaxFiling', e.target.value === 'yes')}
            options={[{ value: 'yes', label: 'はい（電子申告）' }, { value: 'no', label: 'いいえ（書面）' }]}
          />
          <Select
            label="優良な電子帳簿"
            value={current.excellentElectronicBooks ? 'yes' : 'no'}
            onChange={(e) => set('excellentElectronicBooks', e.target.value === 'yes')}
            options={[{ value: 'yes', label: '備えている' }, { value: 'no', label: '備えていない' }]}
          />
          <div className="rounded-2xl bg-accent/[0.07] p-4 text-sm text-ink sm:col-span-2">
            今年分の青色申告特別控除: <span className="font-semibold">{blue.label}</span>
            {year < 2027 && (
              <p className="mt-1 text-xs text-ink-2">令和9年分から、優良な電子帳簿＋e-Taxで最大75万円になります。書面提出は10万円に縮小されます。</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="消費税" />
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            label="課税区分"
            value={current.consumptionTaxStatus}
            onChange={(e) => set('consumptionTaxStatus', e.target.value as UserSettings['consumptionTaxStatus'])}
            options={[{ value: 'taxable', label: '課税事業者' }, { value: 'exempt', label: '免税事業者' }]}
          />
          <Select
            label="申告方法"
            value={current.consumptionTaxMethod}
            onChange={(e) => set('consumptionTaxMethod', e.target.value as UserSettings['consumptionTaxMethod'])}
            options={[
              { value: 'standard', label: '本則課税' },
              { value: 'simplified', label: '簡易課税' },
              ...(isSpecial20PctYear(year) ? [{ value: 'special20pct', label: '2割特例' }] : []),
              ...(isSpecial30PctYear(year) ? [{ value: 'special30pct', label: '3割特例' }] : []),
            ]}
          />
          <Select
            label="簡易課税の事業区分"
            value={String(current.simplifiedBusinessType ?? 5)}
            onChange={(e) => set('simplifiedBusinessType', Number(e.target.value) as 1 | 2 | 3 | 4 | 5 | 6)}
            options={[
              { value: '1', label: '第1種 卸売業（90%）' },
              { value: '2', label: '第2種 小売業（80%）' },
              { value: '3', label: '第3種 製造業等（70%）' },
              { value: '4', label: '第4種 飲食店業等（60%）' },
              { value: '5', label: '第5種 サービス業（50%）' },
              { value: '6', label: '第6種 不動産業（40%）' },
            ]}
          />
          <Input
            label="基準期間の課税売上高（円）"
            type="number"
            value={current.baselineRevenue ?? 0}
            onChange={(e) => set('baselineRevenue', Number(e.target.value))}
          />
          <p className="text-xs leading-relaxed text-ink-3 sm:col-span-2">
            2割特例は個人事業者の令和8年分（2026年分）まで。令和9・10年分は3割特例（個人のみ）が使えます。基準期間（前々年）の課税売上高が1,000万円を超えると課税事業者です。
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="家事按分・事業税" description="事業に使っている割合" />
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Input label="地代家賃 %" type="number" min={0} max={100} value={current.homeOfficeRatio ?? 0} onChange={(e) => set('homeOfficeRatio', Number(e.target.value))} />
          <Input label="水道光熱費 %" type="number" min={0} max={100} value={current.utilitiesRatio ?? 0} onChange={(e) => set('utilitiesRatio', Number(e.target.value))} />
          <Input label="通信費 %" type="number" min={0} max={100} value={current.communicationRatio ?? 0} onChange={(e) => set('communicationRatio', Number(e.target.value))} />
          <Select
            label="個人事業税の事業区分"
            value={String(current.businessTaxCategory)}
            onChange={(e) => set('businessTaxCategory', Number(e.target.value) as 1 | 2 | 3)}
            options={[
              { value: '1', label: '第1種（5%）' },
              { value: '2', label: '第2種（4%）' },
              { value: '3', label: '第3種（5%）' },
            ]}
          />
        </CardContent>
      </Card>

      {error && <Banner tone="danger">{error}</Banner>}

      {/* 変更があるときだけ保存バーを出す */}
      {form && (
        <div className="no-print fixed inset-x-0 bottom-[calc(60px+env(safe-area-inset-bottom))] z-30 border-t border-line/[0.08] glass animate-fade-in lg:bottom-0 lg:left-[264px]">
          <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-3 sm:px-6 lg:px-10">
            <p className="flex-1 text-sm text-ink-2">未保存の変更があります</p>
            <Button variant="ghost" onClick={() => setForm(null)}>
              元に戻す
            </Button>
            <Button onClick={handleSave} loading={saving}>
              保存
            </Button>
          </div>
        </div>
      )}
    </Page>
  );
}
