'use client';
export const dynamic = 'force-dynamic';

import { useState } from 'react';
import Link from 'next/link';
import { useIssuedDocuments } from '@/hooks/useIssuedDocuments';
import { ButtonLink } from '@/components/ui/Button';
import { Select } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Page, PageHeader, Toolbar } from '@/components/ui/Page';
import { Segmented } from '@/components/ui/Segmented';
import { EmptyState, Spinner } from '@/components/ui/Feedback';
import { ISSUED_DOCUMENT_KIND_LABELS, ISSUED_DOCUMENT_STATUS_LABELS, type IssuedDocument, type IssuedDocumentKind, type IssuedDocumentStatus } from '@/types';
import { statusBadgeVariant } from '@/lib/billing/labels';
import { formatYen } from '@/lib/utils/format';

const STATUS_FILTER = [
  { value: '', label: 'すべての状態' },
  ...Object.entries(ISSUED_DOCUMENT_STATUS_LABELS).map(([value, label]) => ({ value, label })),
];

const TH = 'px-4 py-3 text-left text-xs font-medium text-ink-3 first:pl-6 last:pr-6';
const TD = 'px-4 py-3.5 first:pl-6 last:pr-6';

function AccountingState({ doc }: { doc: IssuedDocument }) {
  if (doc.postedToAccounting) return <span className="text-xs text-positive">会計連携済</span>;
  if (doc.kind === 'estimate') return <span className="text-xs text-ink-3">—</span>;
  return <span className="text-xs text-warning">未連携</span>;
}

export default function BillingListPage() {
  const [kind, setKind] = useState<IssuedDocumentKind | 'all'>('all');
  const [status, setStatus] = useState<IssuedDocumentStatus | undefined>();
  const { documents, loading } = useIssuedDocuments({ kind: kind === 'all' ? undefined : kind, status });

  return (
    <Page width="wide">
      <PageHeader
        title="帳票"
        subtitle="見積書・請求書・領収書を案件ごとに発行し、会計へ連携します"
        actions={
          <ButtonLink href={`/billing/new${kind !== 'all' ? `?kind=${kind}` : ''}`} icon="plus">
            帳票を作成
          </ButtonLink>
        }
      />

      <Toolbar>
        <Segmented
          label="種類"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'all', label: 'すべて' },
            { value: 'estimate', label: '見積書' },
            { value: 'invoice', label: '請求書' },
            { value: 'receipt', label: '領収書' },
          ]}
        />
        <Select
          aria-label="状態"
          options={STATUS_FILTER}
          value={status ?? ''}
          onChange={(e) => setStatus(e.target.value ? (e.target.value as IssuedDocumentStatus) : undefined)}
          className="w-40"
        />
      </Toolbar>

      <Card className="overflow-hidden">
        {loading ? (
          <Spinner />
        ) : documents.length === 0 ? (
          <EmptyState
            icon="billing"
            title="帳票がありません"
            description="案件を選んで見積書や請求書を作成できます。"
            action={<ButtonLink href="/billing/new" icon="plus">帳票を作成</ButtonLink>}
          />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-full text-sm">
                <thead className="border-b border-line/[0.06]">
                  <tr>
                    <th className={TH}>番号 / 件名</th>
                    <th className={TH}>種類</th>
                    <th className={TH}>案件 / 顧客</th>
                    <th className={TH}>発行日</th>
                    <th className={`${TH} text-right`}>金額</th>
                    <th className={TH}>状態</th>
                    <th className={TH}>会計</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/[0.05]">
                  {documents.map((d) => (
                    <tr key={d.id} className="group relative transition-colors hover:bg-fill/[0.05]">
                      <td className={`${TD} max-w-[260px]`}>
                        <Link href={`/billing/${d.id}`} className="font-medium text-ink after:absolute after:inset-0">
                          {d.documentNumber}
                        </Link>
                        {d.title && <div className="truncate text-xs text-ink-3">{d.title}</div>}
                      </td>
                      <td className={`${TD} whitespace-nowrap text-ink-2`}>{ISSUED_DOCUMENT_KIND_LABELS[d.kind]}</td>
                      <td className={`${TD} max-w-[240px]`}>
                        <div className="truncate text-ink">{d.projectName}</div>
                        <div className="truncate text-xs text-ink-3">{d.customerName}</div>
                      </td>
                      <td className={`${TD} num whitespace-nowrap text-ink-2`}>{d.issueDate}</td>
                      <td className={`${TD} num whitespace-nowrap text-right font-medium text-ink`}>{formatYen(d.totalAmount)}</td>
                      <td className={TD}>
                        <Badge variant={statusBadgeVariant(d.status)} dot>
                          {ISSUED_DOCUMENT_STATUS_LABELS[d.status]}
                        </Badge>
                      </td>
                      <td className={`${TD} whitespace-nowrap`}>
                        <AccountingState doc={d} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="divide-y divide-line/[0.06] md:hidden">
              {documents.map((d) => (
                <li key={d.id}>
                  <Link href={`/billing/${d.id}`} className="flex items-center gap-3 px-4 py-3 active:bg-fill/[0.08]">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] text-ink">{d.customerName}</span>
                      <span className="mt-0.5 block truncate text-[13px] text-ink-3">
                        {ISSUED_DOCUMENT_KIND_LABELS[d.kind]} · {d.documentNumber} · {d.issueDate}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <span className="num text-[15px] font-medium text-ink">{formatYen(d.totalAmount)}</span>
                      <Badge variant={statusBadgeVariant(d.status)} dot>
                        {ISSUED_DOCUMENT_STATUS_LABELS[d.status]}
                      </Badge>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </Page>
  );
}
