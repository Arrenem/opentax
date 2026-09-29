'use client';

import { useState } from 'react';
import type { Document } from '@/types';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/Feedback';
import { formatYen } from '@/lib/utils/format';
import { formatDate } from '@/lib/utils/date';

const DOC_TYPE_LABELS: Record<Document['documentType'], string> = {
  credit_card_statement: 'クレジットカード明細',
  invoice: '請求書',
  bank_statement: '銀行通帳・明細',
  receipt: '領収書',
  other: 'その他',
};

export function DocumentViewer({ document }: { document: Document | null }) {
  const [imgError, setImgError] = useState(false);

  if (!document) {
    return <EmptyState icon="evidence" title="証憑を選択してください" description="一覧から選ぶと、ここにプレビューと詳細が表示されます。" />;
  }

  const isPdf = document.fileType === 'application/pdf';
  const rows: Array<[string, React.ReactNode]> = [
    ['種別', DOC_TYPE_LABELS[document.documentType]],
    ...(document.transactionDate ? [['取引日', formatDate(document.transactionDate)] as [string, React.ReactNode]] : []),
    ...(document.counterparty ? [['取引先', document.counterparty] as [string, React.ReactNode]] : []),
    ...(document.amount !== undefined ? [['金額', <span key="a" className="num">{formatYen(document.amount)}</span>] as [string, React.ReactNode]] : []),
    ...(document.invoiceRegistrationNumber
      ? [
          [
            '登録番号',
            <span key="r" className="flex items-center justify-end gap-1.5">
              <span className="num text-xs">{document.invoiceRegistrationNumber}</span>
              {document.isVerifiedInvoice !== undefined && (
                <Badge variant={document.isVerifiedInvoice ? 'green' : 'red'}>{document.isVerifiedInvoice ? '照合済' : '未照合'}</Badge>
              )}
            </span>,
          ] as [string, React.ReactNode],
        ]
      : []),
    ['登録日時', formatDate(document.uploadedAt, 'yyyy/MM/dd HH:mm')],
    ...((document.linkedJournalIds?.length ?? 0) > 0 ? [['関連仕訳', `${document.linkedJournalIds?.length}件`] as [string, React.ReactNode]] : []),
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-2xl bg-fill/[0.08] lg:aspect-auto lg:min-h-0 lg:flex-1">
        {isPdf ? (
          <iframe src={document.storageUrl} className="h-full w-full" title="証憑プレビュー" />
        ) : imgError || !document.storageUrl ? (
          <div className="text-center text-sm text-ink-3">
            <p>プレビューを表示できません</p>
            <a href={document.storageUrl} target="_blank" rel="noopener noreferrer" className="mt-1 block text-accent">
              ファイルを開く
            </a>
          </div>
        ) : (
          <img src={document.storageUrl} alt="証憑プレビュー" className="max-h-full max-w-full object-contain" onError={() => setImgError(true)} />
        )}
      </div>
      <dl className="mt-4 divide-y divide-line/[0.06] text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-4 py-2.5">
            <dt className="shrink-0 text-ink-3">{label}</dt>
            <dd className="min-w-0 truncate text-right text-ink">{value}</dd>
          </div>
        ))}
      </dl>
      <a
        href={document.storageUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-flex h-10 items-center justify-center rounded-full bg-fill/[0.1] text-sm font-medium text-ink hover:bg-fill/[0.16]"
      >
        元ファイルを開く
      </a>
    </div>
  );
}
