'use client';
export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { useReports } from '@/hooks/useReports';
import { useJournals } from '@/hooks/useJournals';
import { useIssuedDocuments } from '@/hooks/useIssuedDocuments';
import { MonthlySummaryChart } from '@/components/Charts/MonthlySummary';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Page, PageHeader, Section } from '@/components/ui/Page';
import { ListGroup, ListRow } from '@/components/ui/List';
import { Skeleton, EmptyState } from '@/components/ui/Feedback';
import { StatementRow } from '@/components/ui/Stat';
import { Icon, type IconName } from '@/components/ui/Icon';
import { JournalBadge } from '@/components/JournalEntry/JournalBadge';
import { QUICK_ACTIONS } from '@/components/layout/navigation';
import { getAccountName } from '@/lib/accounting/chartOfAccounts';
import { formatYen } from '@/lib/utils/format';
import { formatDate, toDate } from '@/lib/utils/date';

export default function HomePage() {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const { pl, monthly, loading: reportLoading } = useReports(currentYear);
  const { journals, loading: journalLoading } = useJournals({ fiscalYear: currentYear });
  // 確認待ちは年度をまたいで数える（タブバーのバッジと一致させる）
  const { journals: pendingJournals, loading: pendingLoading } = useJournals({ status: 'pending' });
  const { documents: billingDocs, loading: billingLoading } = useIssuedDocuments();

  const recentJournals = [...journals]
    .sort((a, b) => (toDate(b.transactionDate)?.getTime() ?? 0) - (toDate(a.transactionDate)?.getTime() ?? 0))
    .slice(0, 6);
  const unpaidInvoices = billingDocs.filter((d) => d.kind === 'invoice' && (d.status === 'issued' || d.status === 'sent'));
  const unpostedInvoices = billingDocs.filter((d) => d.kind === 'invoice' && d.status !== 'draft' && d.status !== 'cancelled' && !d.postedToAccounting);
  const drafts = billingDocs.filter((d) => d.status === 'draft');
  const monthData = monthly.find((m) => m.month === currentMonth);

  const tasks: Array<{ key: string; href: string; icon: IconName; tone: string; title: string; subtitle: string; count: number }> = [
    {
      key: 'review',
      href: '/review',
      icon: 'review',
      tone: 'bg-accent text-white',
      title: '確認待ちの仕訳',
      subtitle: 'Agentが作成した仕訳を確定します',
      count: pendingJournals.length,
    },
    {
      key: 'unposted',
      href: '/billing',
      icon: 'billing',
      tone: 'bg-[#af52de] text-white',
      title: '会計に未連携の請求書',
      subtitle: '売上として計上していません',
      count: unpostedInvoices.length,
    },
    {
      key: 'unpaid',
      href: '/billing',
      icon: 'payment',
      tone: 'bg-warning text-white',
      title: '入金待ちの請求書',
      subtitle: `合計 ${formatYen(unpaidInvoices.reduce((s, d) => s + d.totalAmount, 0))}`,
      count: unpaidInvoices.length,
    },
    {
      key: 'drafts',
      href: '/billing',
      icon: 'pencil',
      tone: 'bg-ink-3 text-white',
      title: '下書きの帳票',
      subtitle: '発行前の見積書・請求書',
      count: drafts.length,
    },
  ];
  const openTasks = tasks.filter((t) => t.count > 0);
  const tasksLoading = pendingLoading || billingLoading;

  return (
    <Page width="wide">
      <PageHeader
        eyebrow={format(now, 'M月d日（E）', { locale: ja })}
        title="ホーム"
        subtitle={`${currentYear}年分の帳簿`}
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3 lg:gap-6">
        {/* 今日やること */}
        <Section title="やること" className="lg:col-span-2">
          {tasksLoading ? (
            <Skeleton className="h-[136px] rounded-card" />
          ) : openTasks.length === 0 ? (
            <Card>
              <EmptyState icon="check" title="すべて片付いています" description="確認待ちの仕訳や未処理の請求書はありません。" className="py-10" />
            </Card>
          ) : (
            <ListGroup>
              {openTasks.map((task) => (
                <ListRow
                  key={task.key}
                  href={task.href}
                  leading={
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] ${task.tone}`}>
                      <Icon name={task.icon} size={19} strokeWidth={1.9} />
                    </span>
                  }
                  title={<span className="font-medium">{task.title}</span>}
                  subtitle={task.subtitle}
                  value={<span className="text-[17px] font-semibold">{task.count}<span className="ml-0.5 text-xs font-normal text-ink-3">件</span></span>}
                />
              ))}
            </ListGroup>
          )}
        </Section>

        {/* 新規作成（モバイルはタブバーの＋から） */}
        <Section title="新規作成" className="hidden lg:block">
          <div className="grid grid-cols-2 gap-2.5">
            {QUICK_ACTIONS.map((a) => (
              <Link
                key={a.href}
                href={a.href}
                className="flex flex-col gap-2.5 rounded-card border border-line/[0.06] bg-surface p-4 shadow-card transition hover:-translate-y-px hover:shadow-float"
              >
                <span className={`flex h-9 w-9 items-center justify-center rounded-[10px] ${a.tone}`}>
                  <Icon name={a.icon} size={19} />
                </span>
                <span className="text-sm font-semibold text-ink">{a.label}</span>
              </Link>
            ))}
          </div>
        </Section>
      </div>

      {/* 今月の収支 */}
      <Section title={`${currentMonth}月の収支`} action={<Link href="/reports/pl" className="text-sm text-accent">損益計算書</Link>}>
        <Card className="grid grid-cols-3 divide-x divide-line/[0.06]">
          {[
            { label: '収入', value: monthData?.revenue ?? 0, tone: 'text-ink' },
            { label: '支出', value: monthData?.expenses ?? 0, tone: 'text-ink' },
            { label: '利益', value: monthData?.profit ?? 0, tone: (monthData?.profit ?? 0) < 0 ? 'text-negative' : 'text-positive' },
          ].map((item) => (
            <div key={item.label} className="min-w-0 px-3 py-4 sm:px-6 sm:py-5">
              <p className="text-[13px] font-medium text-ink-2">{item.label}</p>
              {reportLoading ? (
                <Skeleton className="mt-2 h-7 w-4/5" />
              ) : (
                <p className={`num mt-1 truncate text-[17px] font-semibold tracking-tight sm:text-[26px] ${item.tone}`}>
                  {formatYen(item.value)}
                </p>
              )}
            </div>
          ))}
        </Card>
      </Section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3 lg:gap-6">
        <Card className="lg:col-span-2">
          <CardHeader title="月次推移" description={`${currentYear}年`} />
          <CardContent>{reportLoading ? <Skeleton className="h-[260px]" /> : <MonthlySummaryChart data={monthly} />}</CardContent>
        </Card>

        <Card>
          <CardHeader title="年間の見込み" action={<Link href="/tax-return" className="text-sm text-accent">確定申告</Link>} />
          <CardContent className="py-3">
            {reportLoading ? (
              <div className="space-y-3 py-2">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-6" />
                ))}
              </div>
            ) : (
              <>
                <StatementRow label="売上高" amount={pl?.sales ?? 0} />
                <StatementRow label="経費合計" amount={pl?.totalExpenses ?? 0} />
                <StatementRow label="青色控除前の所得" amount={pl?.grossProfit ?? 0} separator />
                <StatementRow label="青色申告特別控除" amount={pl?.blueFormDeduction ?? 0} prefix="−" tone="positive" />
                <StatementRow label="所得金額" amount={pl?.netIncome ?? 0} bold separator />
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Section title="最近の取引" action={<Link href="/journals" className="text-sm text-accent">すべて見る</Link>}>
        {journalLoading ? (
          <Skeleton className="h-64 rounded-card" />
        ) : recentJournals.length === 0 ? (
          <Card>
            <EmptyState
              icon="journal"
              title="まだ仕訳がありません"
              description="証憑を追加するか、仕訳を手入力して始めましょう。"
            />
          </Card>
        ) : (
          <ListGroup>
            {recentJournals.map((j) => (
              <ListRow
                key={j.id}
                href="/journals"
                chevron={false}
                leading={
                  <span className="num w-10 shrink-0 text-center text-[13px] leading-tight text-ink-3">
                    {formatDate(j.transactionDate, 'M/d')}
                  </span>
                }
                title={j.counterparty || j.description}
                subtitle={`${getAccountName(j.debitAccount)} · ${j.counterparty ? j.description : getAccountName(j.creditAccount)}`}
                value={formatYen(j.debitAmount)}
                meta={j.status === 'pending' ? <JournalBadge status={j.status} /> : undefined}
              />
            ))}
          </ListGroup>
        )}
      </Section>
    </Page>
  );
}
