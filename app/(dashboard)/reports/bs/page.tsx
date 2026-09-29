'use client';
export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { useReports } from '@/hooks/useReports';
import { useFiscalYears } from '@/hooks/useFiscalYears';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Select } from '@/components/ui/Input';
import { Page, PageHeader } from '@/components/ui/Page';
import { Banner, Spinner } from '@/components/ui/Feedback';
import { StatementHeading, StatementRow } from '@/components/ui/Stat';
import { CHART_OF_ACCOUNTS } from '@/lib/accounting/chartOfAccounts';
import { formatYen } from '@/lib/utils/format';
import type { AccountCode } from '@/types';

const CURRENT_YEAR = new Date().getFullYear();
const accountName = (code: string) => CHART_OF_ACCOUNTS[code as AccountCode]?.name ?? code;

function Rows({ items }: { items: Record<string, number> | undefined }) {
  return (
    <>
      {Object.entries(items ?? {}).map(([code, amount]) => (amount > 0 ? <StatementRow key={code} label={accountName(code)} amount={amount} /> : null))}
    </>
  );
}

export default function BSPage() {
  const [fiscalYear, setFiscalYear] = useState(CURRENT_YEAR);
  const yearOptions = useFiscalYears().map((y) => ({ value: String(y), label: `${y}年` }));
  const { bs, loading } = useReports(fiscalYear);
  const unbalanced = bs && Math.abs(bs.assets.totalAssets - bs.totalLiabilitiesAndEquity) > 1;

  return (
    <Page>
      <PageHeader
        title="貸借対照表"
        subtitle={`${fiscalYear}年12月31日時点`}
        actions={<Select aria-label="年度" value={String(fiscalYear)} onChange={(e) => setFiscalYear(Number(e.target.value))} options={yearOptions} className="w-28" />}
      />

      {unbalanced && bs && (
        <Banner tone="danger" title="貸借が一致していません">
          資産合計 {formatYen(bs.assets.totalAssets)} ≠ 負債・資本合計 {formatYen(bs.totalLiabilitiesAndEquity)}
        </Banner>
      )}

      {loading ? (
        <Spinner />
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader title="資産の部" action={<span className="num text-sm font-semibold">{formatYen(bs?.assets.totalAssets ?? 0)}</span>} />
            <CardContent>
              <StatementHeading>流動資産</StatementHeading>
              <Rows items={bs?.assets.current as Record<string, number>} />
              <StatementHeading>固定資産</StatementHeading>
              <Rows items={bs?.assets.fixed as Record<string, number>} />
              <StatementHeading>事業主貸</StatementHeading>
              <Rows items={bs?.assets.owner as Record<string, number>} />
              <StatementRow label="資産合計" amount={bs?.assets.totalAssets ?? 0} bold separator />
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="負債・資本の部" action={<span className="num text-sm font-semibold">{formatYen(bs?.totalLiabilitiesAndEquity ?? 0)}</span>} />
            <CardContent>
              <StatementHeading>負債</StatementHeading>
              <Rows items={bs?.liabilities.items as Record<string, number>} />
              <StatementRow label="負債合計" amount={bs?.liabilities.totalLiabilities ?? 0} bold separator />
              <StatementHeading>資本</StatementHeading>
              <Rows items={bs?.equity.items as Record<string, number>} />
              <StatementRow label="資本合計" amount={bs?.equity.totalEquity ?? 0} bold separator />
              <StatementRow label="負債・資本合計" amount={bs?.totalLiabilitiesAndEquity ?? 0} bold separator />
            </CardContent>
          </Card>
        </div>
      )}

      <p className="text-center text-xs text-ink-3">本レポートは参考値です。税務申告の正確性は税理士にご確認ください。</p>
    </Page>
  );
}
