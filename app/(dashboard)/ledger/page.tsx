'use client';
export const dynamic = 'force-dynamic';

import { useState, useMemo } from 'react';
import { useJournals } from '@/hooks/useJournals';
import { useFiscalYears } from '@/hooks/useFiscalYears';
import { CHART_OF_ACCOUNTS, getAccountsByType } from '@/lib/accounting/chartOfAccounts';
import { Select } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { Page, PageHeader, Toolbar } from '@/components/ui/Page';
import { EmptyState, Spinner } from '@/components/ui/Feedback';
import { formatYen } from '@/lib/utils/format';
import { formatDate, toDate } from '@/lib/utils/date';
import type { AccountCode } from '@/types';

const CURRENT_YEAR = new Date().getFullYear();
const TYPE_LABELS = { asset: '資産', liability: '負債', equity: '資本', revenue: '収益', expense: '費用' } as const;

const ACCOUNT_OPTIONS = (['asset', 'liability', 'equity', 'revenue', 'expense'] as const).flatMap((type) =>
  getAccountsByType(type).map(([key, def]) => ({ value: key, label: `${TYPE_LABELS[type]} · ${def.name}` }))
);

const TH = 'px-4 py-3 text-left text-xs font-medium text-ink-3 first:pl-6 last:pr-6';
const TD = 'px-4 py-3 first:pl-6 last:pr-6';

export default function LedgerPage() {
  const [fiscalYear, setFiscalYear] = useState(CURRENT_YEAR);
  const yearOptions = useFiscalYears().map((y) => ({ value: String(y), label: `${y}年` }));
  const [account, setAccount] = useState<AccountCode>('BANK');
  const { journals, loading } = useJournals({ fiscalYear });
  const accountDef = CHART_OF_ACCOUNTS[account];

  const entries = useMemo(() => {
    const related = journals
      .filter((j) => j.debitAccount === account || j.creditAccount === account)
      .sort((a, b) => (toDate(a.transactionDate)?.getTime() ?? 0) - (toDate(b.transactionDate)?.getTime() ?? 0));
    // 資産・費用は借方残、負債・資本・収益は貸方残
    const debitNormal = accountDef?.type === 'asset' || accountDef?.type === 'expense';
    let balance = 0;
    return related.map((j) => {
      const isDebit = j.debitAccount === account;
      const debit = isDebit ? j.debitAmount : 0;
      const credit = isDebit ? 0 : j.creditAmount;
      balance += debitNormal ? debit - credit : credit - debit;
      return { ...j, debit, credit, balance, counter: isDebit ? j.creditAccount : j.debitAccount };
    });
  }, [journals, account, accountDef]);

  const totalDebit = entries.reduce((s, e) => s + e.debit, 0);
  const totalCredit = entries.reduce((s, e) => s + e.credit, 0);
  const closing = entries.at(-1)?.balance ?? 0;

  return (
    <Page width="wide">
      <PageHeader title="総勘定元帳" subtitle="勘定科目ごとの取引と残高の推移です" />

      <Toolbar>
        <Select aria-label="勘定科目" value={account} onChange={(e) => setAccount(e.target.value as AccountCode)} options={ACCOUNT_OPTIONS} className="w-64" />
        <Select aria-label="年度" value={String(fiscalYear)} onChange={(e) => setFiscalYear(Number(e.target.value))} options={yearOptions} className="w-28" />
        <p className="num ml-auto text-sm text-ink-3">
          期末残高 <span className="text-base font-semibold text-ink">{formatYen(Math.abs(closing))}</span>
        </p>
      </Toolbar>

      <Card className="overflow-hidden">
        {loading ? (
          <Spinner />
        ) : entries.length === 0 ? (
          <EmptyState icon="ledger" title="この科目の取引はありません" />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-full text-sm">
                <thead className="border-b border-line/[0.06]">
                  <tr>
                    <th className={TH}>日付</th>
                    <th className={TH}>摘要</th>
                    <th className={TH}>相手科目</th>
                    <th className={`${TH} text-right`}>借方</th>
                    <th className={`${TH} text-right`}>貸方</th>
                    <th className={`${TH} text-right`}>残高</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/[0.05]">
                  {entries.map((e) => (
                    <tr key={e.id} className="hover:bg-fill/[0.04]">
                      <td className={`${TD} num whitespace-nowrap text-ink-2`}>{formatDate(e.transactionDate)}</td>
                      <td className={`${TD} max-w-[300px] truncate text-ink`}>{e.description}</td>
                      <td className={`${TD} whitespace-nowrap text-ink-2`}>{CHART_OF_ACCOUNTS[e.counter]?.name}</td>
                      <td className={`${TD} num text-right text-ink`}>{e.debit > 0 ? formatYen(e.debit) : ''}</td>
                      <td className={`${TD} num text-right text-ink`}>{e.credit > 0 ? formatYen(e.credit) : ''}</td>
                      <td className={`${TD} num whitespace-nowrap text-right font-medium ${e.balance < 0 ? 'text-negative' : 'text-ink'}`}>
                        {formatYen(Math.abs(e.balance))}
                        {e.balance < 0 ? '（貸）' : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-line/[0.08] font-semibold">
                  <tr>
                    <td colSpan={3} className={`${TD} text-ink`}>合計</td>
                    <td className={`${TD} num text-right`}>{formatYen(totalDebit)}</td>
                    <td className={`${TD} num text-right`}>{formatYen(totalCredit)}</td>
                    <td className={`${TD} num text-right`}>{formatYen(Math.abs(totalDebit - totalCredit))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <ul className="divide-y divide-line/[0.06] md:hidden">
              {entries.map((e) => (
                <li key={e.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="num w-10 shrink-0 text-center text-[13px] text-ink-3">{formatDate(e.transactionDate, 'M/d')}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] text-ink">{e.description}</span>
                    <span className="mt-0.5 block truncate text-[13px] text-ink-3">{CHART_OF_ACCOUNTS[e.counter]?.name}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end">
                    <span className="num text-[15px] font-medium text-ink">
                      <span className="mr-1 text-xs font-normal text-ink-3">{e.debit > 0 ? '借' : '貸'}</span>
                      {formatYen(e.debit > 0 ? e.debit : e.credit)}
                    </span>
                    <span className="num text-xs text-ink-3">残高 {formatYen(Math.abs(e.balance))}</span>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </Page>
  );
}
