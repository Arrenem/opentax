'use client';
export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { useReports } from '@/hooks/useReports';
import { useFiscalYears } from '@/hooks/useFiscalYears';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Select } from '@/components/ui/Input';
import { Page, PageHeader } from '@/components/ui/Page';
import { Spinner } from '@/components/ui/Feedback';
import { Stat, StatementHeading, StatementRow } from '@/components/ui/Stat';
import { getExpenseAccounts } from '@/lib/accounting/chartOfAccounts';
import type { AccountCode } from '@/types';

const CURRENT_YEAR = new Date().getFullYear();

export default function PLPage() {
  const [fiscalYear, setFiscalYear] = useState(CURRENT_YEAR);
  const yearOptions = useFiscalYears().map((y) => ({ value: String(y), label: `${y}年` }));
  const { pl, loading } = useReports(fiscalYear);
  const expenseAccounts = getExpenseAccounts();

  return (
    <Page width="narrow">
      <PageHeader
        title="損益計算書"
        subtitle={`${fiscalYear}年1月1日〜12月31日`}
        actions={<Select aria-label="年度" value={String(fiscalYear)} onChange={(e) => setFiscalYear(Number(e.target.value))} options={yearOptions} className="w-28" />}
      />

      {loading ? (
        <Spinner />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Stat label="売上" yen={pl?.totalRevenue ?? 0} />
            <Stat label="所得金額" yen={pl?.netIncome ?? 0} tone={(pl?.netIncome ?? 0) < 0 ? 'negative' : 'positive'} />
          </div>
          <Card>
            <CardHeader title="明細" />
            <CardContent>
              <StatementHeading>収益</StatementHeading>
              <StatementRow label="売上高" amount={pl?.sales ?? 0} />
              {(pl?.otherIncome ?? 0) > 0 && <StatementRow label="雑収入" amount={pl?.otherIncome ?? 0} />}
              {(pl?.costOfGoodsSold ?? 0) > 0 && <StatementRow label="売上原価" amount={pl?.costOfGoodsSold ?? 0} />}
              <StatementRow label="収益合計" amount={pl?.totalRevenue ?? 0} bold separator />

              <StatementHeading>経費</StatementHeading>
              {expenseAccounts.map(([key, def]) => {
                if (key === 'PURCHASES' || key === 'FAMILY_WAGES') return null;
                const amount = pl?.expenses?.[key as AccountCode] ?? 0;
                if (amount === 0) return null;
                return (
                  <StatementRow
                    key={key}
                    label={
                      <>
                        <span className="num mr-2 text-xs text-ink-3">{def.plLine}</span>
                        {def.name}
                      </>
                    }
                    amount={amount}
                  />
                );
              })}
              <StatementRow label="経費合計" amount={pl?.totalExpenses ?? 0} bold separator />

              <StatementHeading>所得</StatementHeading>
              {(pl?.familyWages ?? 0) > 0 && <StatementRow label="専従者給与" amount={pl?.familyWages ?? 0} />}
              <StatementRow label="青色申告特別控除前の所得金額" amount={pl?.grossProfit ?? 0} />
              <StatementRow label={pl?.blueFormDeductionLabel ?? '青色申告特別控除額'} amount={pl?.blueFormDeduction ?? 0} prefix="−" tone="positive" />
              <StatementRow label="所得金額" amount={pl?.netIncome ?? 0} bold separator />
            </CardContent>
          </Card>
        </>
      )}

      <p className="text-center text-xs text-ink-3">本レポートは参考値です。税務申告の正確性は税理士にご確認ください。</p>
    </Page>
  );
}
