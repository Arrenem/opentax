'use client';
export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { useReports } from '@/hooks/useReports';
import { useFiscalYears } from '@/hooks/useFiscalYears';
import { useJournals } from '@/hooks/useJournals';
import { validateFinancials } from '@/lib/export/xtxGenerator';
import { useAuth } from '@/hooks/useAuth';
import { getAccountName } from '@/lib/accounting/chartOfAccounts';
import { TAX_TYPE_LABELS } from '@/lib/accounting/consumptionTax';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Input';
import { Page, PageHeader } from '@/components/ui/Page';
import { Banner } from '@/components/ui/Feedback';

const CURRENT_YEAR = new Date().getFullYear();

function downloadBlob(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function ExportPage() {
  const [fiscalYear, setFiscalYear] = useState(CURRENT_YEAR);
  const yearOptions = useFiscalYears().map((y) => ({ value: String(y), label: `${y}年分` }));
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const { pl, bs } = useReports(fiscalYear);
  const { getToken } = useAuth();
  const { journals } = useJournals({ fiscalYear });

  async function handleXtxExport() {
    setLoading(true); setErrors([]);
    try {
      const token = await getToken();
      const response = await fetch(`/api/export/xtx?fiscalYear=${fiscalYear}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error?.code === 'REVIEW_REQUIRED' ? '確認待ちの仕訳があります。レビューしてから出力してください。'
          : body.error?.message ?? 'XTX出力に失敗しました');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `blue_form_${fiscalYear}.xtx`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { setErrors([e instanceof Error ? e.message : 'XTX出力に失敗しました']); }
    finally { setLoading(false); }
  }

  function handleCsvExport() {
    setLoading(true);
    try {
      const header = '取引日,借方科目,貸方科目,金額,取引先,摘要,消費税区分,ステータス\n';
      const rows = journals.map((j) => {
        let date = '';
        try {
          date = j.transactionDate.toDate ? j.transactionDate.toDate().toISOString().slice(0, 10) : String(j.transactionDate);
        } catch {
          date = '';
        }
        return [
          date,
          getAccountName(j.debitAccount),
          getAccountName(j.creditAccount),
          j.debitAmount,
          `"${String(j.counterparty ?? '').replace(/"/g, '""')}"`,
          `"${String(j.description ?? '').replace(/"/g, '""')}"`,
          TAX_TYPE_LABELS[j.taxType] ?? j.taxType,
          j.status,
        ].join(',');
      }).join('\n');
      downloadBlob('\uFEFF' + header + rows, `journals_${fiscalYear}.csv`, 'text/csv;charset=utf-8');
    } finally {
      setLoading(false);
    }
  }

  const validationErrors = pl && bs ? validateFinancials(pl, bs) : [];

  return (
    <Page width="narrow">
      <PageHeader
        title="エクスポート"
        subtitle="e-Tax用のファイルや仕訳データを書き出します"
        actions={<Select aria-label="年分" value={String(fiscalYear)} onChange={(e) => setFiscalYear(Number(e.target.value))} options={yearOptions} className="w-32" />}
      />

      {validationErrors.length > 0 && (
        <Banner tone="warning" title="整合性チェック">
          {validationErrors.map((e, i) => <p key={i}>{e}</p>)}
        </Banner>
      )}

      <Card>
        <CardHeader title="e-Tax XTXファイル" description="所得税青色申告決算書（一般用）" />
        <CardContent className="space-y-4">
          <p className="text-sm leading-relaxed text-ink-2">
            e-Taxソフト（WEB版）からインポートできます。確定申告書Bは
            <a href="/tax-return" className="mx-1 text-accent">確定申告</a>
            画面からも出力できます。
          </p>
          <ul className="space-y-1 rounded-2xl bg-fill/[0.06] p-4 text-[13px] text-ink-2">
            <li>所得税青色申告決算書（一般用）HOB13000</li>
            <li>確定申告書B（所得税及び復興特別所得税）</li>
            <li>青色申告特別控除: {pl?.blueFormDeductionLabel ?? '事業設定に応じて自動計算'}</li>
          </ul>
          <Button icon="download" onClick={handleXtxExport} loading={loading} className="w-full sm:w-auto">
            XTXファイルをダウンロード
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="仕訳帳CSV" description="Excel等での集計に" />
        <CardContent>
          <Button variant="secondary" icon="download" onClick={handleCsvExport} loading={loading} className="w-full sm:w-auto">
            CSVをダウンロード
          </Button>
        </CardContent>
      </Card>

      {errors.length > 0 && <Banner tone="danger">{errors.map((e, i) => <p key={i}>{e}</p>)}</Banner>}

      <div className="space-y-1 px-1 text-xs leading-relaxed text-ink-3">
        <p>本アプリは個人利用目的のツールです。税務申告の正確性は税理士にご確認ください。</p>
        <p>電子帳簿保存法の完全対応には、事務処理規程の策定が別途必要です。</p>
      </div>
    </Page>
  );
}
