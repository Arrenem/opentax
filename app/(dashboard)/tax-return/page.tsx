'use client';
export const dynamic = 'force-dynamic';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useJournals } from '@/hooks/useJournals';
import { useFiscalYears } from '@/hooks/useFiscalYears';
import { useSettings } from '@/hooks/useSettings';
import { useDeductions } from '@/hooks/useDeductions';
import { useAssets } from '@/hooks/useAssets';
import { buildTaxReturnBundle } from '@/lib/accounting/reports';
import { validateFinancials } from '@/lib/export/xtxGenerator';
import { useAuth } from '@/hooks/useAuth';
import { DEDUCTION_LABELS } from '@/lib/tax/deductions';
import { filingDeadline, getBasicDeduction } from '@/lib/tax/taxYearRules';
import { fiscalYearLabel, formatYen } from '@/lib/utils/format';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Button, IconButton } from '@/components/ui/Button';
import { Checkbox, Input, Select } from '@/components/ui/Input';
import { Page, PageHeader } from '@/components/ui/Page';
import { Segmented } from '@/components/ui/Segmented';
import { Banner, Spinner } from '@/components/ui/Feedback';
import { Stat as StatTile, StatementHeading, StatementRow } from '@/components/ui/Stat';
import type { DependentInput, DependentType, DisabilityType, IncomeDeductionInput } from '@/types';

const CURRENT_YEAR = new Date().getFullYear();

type Tab = 'overview' | 'deductions' | 'income' | 'consumption' | 'local';

export default function TaxReturnPage() {
  const [fiscalYear, setFiscalYear] = useState(CURRENT_YEAR);
  const yearOptions = useFiscalYears().map((y) => ({ value: String(y), label: fiscalYearLabel(y) }));
  const [tab, setTab] = useState<Tab>('overview');
  const [exportError, setExportError] = useState('');
  const { getToken } = useAuth();
  const { journals, loading: jLoading } = useJournals({ fiscalYear });
  const { settings, loading: sLoading } = useSettings();
  const { deductions, setDeductions, save, saving } = useDeductions(fiscalYear);
  const { assets, loading: aLoading } = useAssets();

  const bundle = useMemo(
    () =>
      buildTaxReturnBundle({
        fiscalYear,
        journals,
        settings,
        deductions,
        assets,
        beginningInventory: deductions.beginningInventory,
        endingInventory: deductions.endingInventory,
      }),
    [fiscalYear, journals, settings, deductions, assets]
  );

  const loading = jLoading || sLoading || aLoading;
  const deadline = filingDeadline(fiscalYear);
  const warnings = validateFinancials(bundle.pl, bundle.bs);

  async function download(kind: 'blue' | 'formb') {
    setExportError('');
    try {
      const token = await getToken();
      const res = await fetch('/api/tax-return', { method: 'POST', headers: {
        Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fiscalYear, kind }) });
      if (!res.ok) { const body = await res.json(); throw new Error(body.error?.code === 'REVIEW_REQUIRED'
        ? '確認待ちの仕訳があります。レビューしてから出力してください。' : body.error?.message ?? '出力に失敗しました'); }
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a'); a.href = url;
      a.download = kind === 'formb' ? `form_b_${fiscalYear}.xtx` : `blue_form_${fiscalYear}.xtx`;
      a.click(); URL.revokeObjectURL(url);
    } catch (e) { setExportError(e instanceof Error ? e.message : '出力に失敗しました'); }
  }

  return (
    <Page>
      <PageHeader
        title="確定申告"
        subtitle={`提出期限 所得税 ${deadline.incomeTax} ／ 消費税 ${deadline.consumptionTax}`}
        actions={<Select aria-label="年分" value={String(fiscalYear)} onChange={(e) => setFiscalYear(Number(e.target.value))} options={yearOptions} className="w-60" />}
      />

      <Segmented
        label="確定申告の項目"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'overview', label: '概要' },
          { value: 'deductions', label: '所得控除' },
          { value: 'income', label: '所得税' },
          { value: 'consumption', label: '消費税' },
          { value: 'local', label: '住民税・事業税' },
        ]}
      />

      {loading ? (
        <Spinner />
      ) : (
        <>
          {tab === 'overview' && <OverviewTab bundle={bundle} settingsName={settings.ownerName} warnings={warnings} />}
          {tab === 'deductions' && (
            <DeductionsTab
              fiscalYear={fiscalYear}
              deductions={deductions}
              setDeductions={setDeductions}
              save={save}
              saving={saving}
              totalIncome={bundle.incomeTax.totalIncome}
            />
          )}
          {tab === 'income' && <IncomeTab bundle={bundle} />}
          {tab === 'consumption' && <ConsumptionTab bundle={bundle} />}
          {tab === 'local' && <LocalTab bundle={bundle} />}

          <Card>
            <CardHeader title="e-Tax向けエクスポート" description="確認待ちの仕訳がない状態で出力できます" action={<Link href="/settings" className="text-sm text-accent">事業設定</Link>} />
            <CardContent className="flex flex-col gap-2 sm:flex-row">
              <Button icon="download" onClick={() => download('blue')}>青色申告決算書（XTX）</Button>
              <Button variant="secondary" icon="download" onClick={() => download('formb')}>確定申告書B（XTX）</Button>
            </CardContent>
          </Card>
          {exportError && <Banner tone="danger">{exportError}</Banner>}
        </>
      )}

      <p className="text-xs leading-relaxed text-ink-3">
        本計算は令和7〜8年度税制改正（基礎控除、青色申告特別控除、2割/3割特例）を反映した参考値です。税務申告の正確性は税理士または税務署にご確認ください。
      </p>
    </Page>
  );
}

function OverviewTab({ bundle, settingsName, warnings }: { bundle: ReturnType<typeof buildTaxReturnBundle>; settingsName: string; warnings: string[] }) {
  const { pl, incomeTax, consumptionTax } = bundle;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="事業所得" value={pl.netIncome} sub={pl.blueFormDeductionLabel} />
        <Stat label="課税所得" value={incomeTax.taxableIncome} sub={`税率 ${(incomeTax.bracketRate * 100).toFixed(0)}%`} />
        <Stat label="所得税・復興税" value={incomeTax.incomeAndReconstructionTax} sub={incomeTax.taxDue > 0 ? `納付 ${formatYen(incomeTax.taxDue)}` : `還付 ${formatYen(incomeTax.refund)}`} />
        <Stat label="消費税" value={consumptionTax.totalPayable} sub={consumptionTax.methodLabel} />
      </div>
      {warnings.length > 0 && (
        <Banner tone="warning" title="整合性チェック">
          {warnings.map((w) => <p key={w}>{w}</p>)}
        </Banner>
      )}
      <Card>
        <CardHeader title="青色申告決算書の要約" description={settingsName || undefined} />
        <CardContent className="py-3">
          <Row label="売上高" amount={pl.sales} />
          {pl.costOfGoodsSold > 0 && <Row label="売上原価" amount={pl.costOfGoodsSold} />}
          <Row label="経費合計" amount={pl.totalExpenses} />
          <Row label="青色申告特別控除前の所得" amount={pl.grossProfit} />
          <Row label={`青色申告特別控除（${pl.blueFormDeductionLabel}）`} amount={pl.blueFormDeduction} />
          <Row label="事業所得" amount={pl.netIncome} bold />
        </CardContent>
      </Card>
    </div>
  );
}

function DeductionsTab({
  fiscalYear,
  deductions,
  setDeductions,
  save,
  saving,
  totalIncome,
}: {
  fiscalYear: number;
  deductions: IncomeDeductionInput;
  setDeductions: (d: IncomeDeductionInput) => void;
  save: (d: IncomeDeductionInput) => Promise<void>;
  saving: boolean;
  totalIncome: number;
}) {
  function set<K extends keyof IncomeDeductionInput>(key: K, value: IncomeDeductionInput[K]) {
    setDeductions({ ...deductions, [key]: value });
  }

  function addDependent() {
    const dep: DependentInput = {
      id: `dep_${Date.now()}`,
      name: '',
      type: 'general',
      income: 0,
    };
    set('dependents', [...deductions.dependents, dep]);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title={`保険料・掛金`} />
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="社会保険料（国年・国保等）" type="number" value={deductions.socialInsurance || ''} onChange={(e) => set('socialInsurance', Number(e.target.value))} />
          <Input label="小規模企業共済・iDeCo" type="number" value={deductions.smallEnterpriseMutual || ''} onChange={(e) => set('smallEnterpriseMutual', Number(e.target.value))} />
          <Input label="一般生命保険料（支払額）" type="number" value={deductions.lifeInsuranceGeneralPaid || ''} onChange={(e) => set('lifeInsuranceGeneralPaid', Number(e.target.value))} />
          <Input label="介護医療保険料（支払額）" type="number" value={deductions.lifeInsuranceMedicalPaid || ''} onChange={(e) => set('lifeInsuranceMedicalPaid', Number(e.target.value))} />
          <Input label="個人年金保険料（支払額）" type="number" value={deductions.lifeInsurancePensionPaid || ''} onChange={(e) => set('lifeInsurancePensionPaid', Number(e.target.value))} />
          <Input label="地震保険料（支払額）" type="number" value={deductions.earthquakeInsurancePaid || ''} onChange={(e) => set('earthquakeInsurancePaid', Number(e.target.value))} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader title={`配偶者・扶養`} />
        <CardContent className="space-y-4">
          <Checkbox label="配偶者控除・配偶者特別控除を適用する" checked={deductions.hasSpouse} onChange={(e) => set('hasSpouse', e.target.checked)} />
          {deductions.hasSpouse && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input label="配偶者の合計所得金額" type="number" value={deductions.spouseIncome || ''} onChange={(e) => set('spouseIncome', Number(e.target.value))} />
              <Checkbox className="sm:pt-7" label="配偶者が70歳以上" checked={deductions.spouseIsElderly} onChange={(e) => set('spouseIsElderly', e.target.checked)} />
            </div>
          )}
          <div className="flex items-center justify-between border-t border-line/[0.06] pt-4">
            <p className="text-sm font-semibold text-ink">扶養親族</p>
            <Button size="sm" variant="secondary" icon="plus" onClick={addDependent}>追加</Button>
          </div>
          {deductions.dependents.map((d, i) => (
            <div key={d.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 rounded-2xl bg-fill/[0.05] p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
              <Input label="氏名" value={d.name} onChange={(e) => {
                const next = [...deductions.dependents];
                next[i] = { ...d, name: e.target.value };
                set('dependents', next);
              }} />
              <Select
                label="区分"
                value={d.type}
                onChange={(e) => {
                  const next = [...deductions.dependents];
                  next[i] = { ...d, type: e.target.value as DependentType };
                  set('dependents', next);
                }}
                options={[
                  { value: 'general', label: '一般（38万）' },
                  { value: 'specific', label: '特定扶養（63万）' },
                  { value: 'elderly', label: '老人扶養（48万）' },
                  { value: 'elderly_livein', label: '同居老親（58万）' },
                  { value: 'specific_special', label: '特定親族特別控除' },
                ]}
              />
              <Input label="合計所得" type="number" value={d.income || ''} onChange={(e) => {
                const next = [...deductions.dependents];
                next[i] = { ...d, income: Number(e.target.value) };
                set('dependents', next);
              }} />
              <IconButton icon="close" label="扶養親族を削除" className="mb-1.5 sm:order-last" onClick={() => set('dependents', deductions.dependents.filter((x) => x.id !== d.id))} />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader title={`その他の控除・税額`} />
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            label="障害者控除"
            value={deductions.disability}
            onChange={(e) => set('disability', e.target.value as DisabilityType)}
            options={[
              { value: 'none', label: 'なし' },
              { value: 'ordinary', label: '普通障害（27万）' },
              { value: 'special', label: '特別障害（40万）' },
              { value: 'special_livein', label: '同居特別障害（75万）' },
            ]}
          />
          <div className="flex flex-wrap gap-x-5 sm:pt-6">
            <Checkbox label="ひとり親" checked={deductions.isSingleParent} onChange={(e) => set('isSingleParent', e.target.checked)} />
            <Checkbox label="寡婦" checked={deductions.isWidow} onChange={(e) => set('isWidow', e.target.checked)} />
            <Checkbox label="勤労学生" checked={deductions.isWorkingStudent} onChange={(e) => set('isWorkingStudent', e.target.checked)} />
          </div>
          <Input label="支払医療費" type="number" value={deductions.medicalExpenses || ''} onChange={(e) => set('medicalExpenses', Number(e.target.value))} />
          <Input label="保険金等で補填される金額" type="number" value={deductions.medicalInsuranceReimburse || ''} onChange={(e) => set('medicalInsuranceReimburse', Number(e.target.value))} />
          <Input label="寄附金（ふるさと納税等）" type="number" value={deductions.donations || ''} onChange={(e) => set('donations', Number(e.target.value))} />
          <Input label="源泉徴収税額" type="number" value={deductions.withholdingTax || ''} onChange={(e) => set('withholdingTax', Number(e.target.value))} />
          <Input label="予定納税額" type="number" value={deductions.prepaidIncomeTax || ''} onChange={(e) => set('prepaidIncomeTax', Number(e.target.value))} />
          <Input label="期首棚卸高" type="number" value={deductions.beginningInventory || ''} onChange={(e) => set('beginningInventory', Number(e.target.value))} />
          <Input label="期末棚卸高" type="number" value={deductions.endingInventory || ''} onChange={(e) => set('endingInventory', Number(e.target.value))} />
        </CardContent>
      </Card>

      <Banner tone="info">
        基礎控除（{fiscalYearLabel(fiscalYear)}）: <span className="num font-semibold">{formatYen(getBasicDeduction(fiscalYear, totalIncome))}</span>
        <span className="num ml-2 text-xs text-ink-3">合計所得 {formatYen(totalIncome)} で判定</span>
      </Banner>

      <div className="flex justify-end">
        <Button onClick={() => save(deductions)} loading={saving} className="w-full sm:w-auto">所得控除を保存</Button>
      </div>
    </div>
  );
}

function IncomeTab({ bundle }: { bundle: ReturnType<typeof buildTaxReturnBundle> }) {
  const t = bundle.incomeTax;
  return (
    <Card>
      <CardHeader title={`確定申告書B 第一表（抜粋）`} />
      <CardContent>
        <Row label="事業所得" amount={t.businessIncome} />
        <Row label="所得金額合計" amount={t.totalIncome} />
        <StatementHeading>所得控除</StatementHeading>
        {(Object.keys(DEDUCTION_LABELS) as Array<keyof typeof DEDUCTION_LABELS>)
          .filter((k) => k !== 'total')
          .map((k) => t.deductions[k] > 0 ? <Row key={k} label={DEDUCTION_LABELS[k]} amount={t.deductions[k]} /> : null)}
        <Row label="所得控除合計" amount={t.deductions.total} bold />
        <Row label="課税される所得金額（千円未満切捨て）" amount={t.taxableIncome} />
        <Row label={`所得税（${(t.bracketRate * 100).toFixed(0)}%）`} amount={t.incomeTax} />
        <Row label="復興特別所得税（2.1%）" amount={t.reconstructionTax} />
        <Row label="所得税及び復興特別所得税" amount={t.incomeAndReconstructionTax} bold />
        <Row label="源泉徴収税額" amount={t.withholdingTax} />
        <Row label="予定納税額" amount={t.prepaidIncomeTax} />
        {t.taxDue > 0
          ? <Row label="申告納税額" amount={t.taxDue} bold />
          : <Row label="還付される税金" amount={t.refund} bold />}
      </CardContent>
    </Card>
  );
}

function ConsumptionTab({ bundle }: { bundle: ReturnType<typeof buildTaxReturnBundle> }) {
  const c = bundle.consumptionTax;
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title={c.methodLabel} />
        <CardContent>
          <Row label="課税売上（10%）" amount={c.taxableSalesIncl} />
          <Row label="軽減売上（8%）" amount={c.reducedSalesIncl} />
          <Row label="輸出免税売上" amount={c.exportSales} />
          <Row label="非課税・不課税売上" amount={c.exemptSales} />
          <Row label="売上に係る国税" amount={c.salesNationalTax} />
          <Row label="控除税額（国税）" amount={c.deductibleNationalTax} />
          <Row label="納付消費税（国税）" amount={c.nationalTax} />
          <Row label="地方消費税" amount={c.localTax} />
          <Row label="納付税額合計" amount={c.totalPayable} bold />
        </CardContent>
      </Card>
      {c.eligibleMethods.length > 0 && (
        <Card>
          <CardHeader title={`有利判定（参考）`} />
          <CardContent className="py-3">
            {c.eligibleMethods
              .slice()
              .sort((a, b) => a.payable - b.payable)
              .map((m) => (
                <Row key={m.method} label={m.label} amount={m.payable} bold={m.method === c.method} />
              ))}
          </CardContent>
        </Card>
      )}
      {c.notes.length > 0 && (
        <div className="space-y-1 rounded-2xl bg-fill/[0.06] p-4 text-xs leading-relaxed text-ink-2">
          {c.notes.map((n) => <p key={n}>{n}</p>)}
        </div>
      )}
    </div>
  );
}

function LocalTab({ bundle }: { bundle: ReturnType<typeof buildTaxReturnBundle> }) {
  const l = bundle.localTax;
  return (
    <Card>
      <CardHeader title={`住民税・個人事業税（概算）`} />
      <CardContent>
        <Row label="事業税の課税標準" amount={l.businessTaxBase} />
        <Row label="個人事業税" amount={l.businessTax} />
        <Row label="住民税課税所得" amount={l.residentTaxableIncome} />
        <Row label="住民税所得割" amount={l.residentIncomeTax} />
        <Row label="住民税均等割" amount={l.residentPerCapita} />
        <Row label="住民税合計" amount={l.residentTax} bold />
        <div className="mt-4 space-y-1 text-xs leading-relaxed text-ink-3">
          {l.notes.map((n) => <p key={n}>{n}</p>)}
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, sub, color = 'blue' }: { label: string; value: number; sub?: string; color?: 'blue' | 'green' | 'red' }) {
  const tone = color === 'green' ? 'positive' : color === 'red' ? 'negative' : 'default';
  return <StatTile label={label} yen={value} sub={sub} tone={tone} />;
}

function Row({ label, amount, bold = false }: { label: string; amount: number; bold?: boolean }) {
  return <StatementRow label={label} amount={amount} bold={bold} separator={bold} />;
}
