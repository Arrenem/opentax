'use client';
export const dynamic = 'force-dynamic';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useIssuedDocuments } from '@/hooks/useIssuedDocuments';
import { useSettings } from '@/hooks/useSettings';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { Page, PageHeader } from '@/components/ui/Page';
import { Banner, EmptyState, Spinner } from '@/components/ui/Feedback';
import { DocumentPreview } from '@/components/Billing/DocumentPreview';
import { PdfExportButton } from '@/components/Billing/PdfExportButton';
import type { IconName } from '@/components/ui/Icon';
import { ISSUED_DOCUMENT_KIND_LABELS, ISSUED_DOCUMENT_STATUS_LABELS, type IssuedDocumentKind } from '@/types';
import { statusBadgeVariant } from '@/lib/billing/labels';
import { formatYen } from '@/lib/utils/format';

type Action = { key: string; label: string; icon: IconName; run: () => void };

export default function BillingDocumentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const documentId = String(params.id ?? '');
  const { documents, loading, convertDocument, postToAccounting, updateDocument, deleteDocument } = useIssuedDocuments();
  const { settings } = useSettings();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const document = useMemo(() => documents.find((d) => d.id === documentId), [documents, documentId]);

  async function perform(fn: () => Promise<string | void>) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await fn();
      if (result) setMessage(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : '処理に失敗しました');
    } finally {
      setBusy(false);
    }
  }

  const handleConvert = (targetKind: IssuedDocumentKind) =>
    perform(async () => {
      const result = await convertDocument(document!.id, targetKind);
      router.push(`/billing/${result.id}`);
      return `${ISSUED_DOCUMENT_KIND_LABELS[targetKind]}（${result.documentNumber}）を作成しました`;
    });

  const handlePost = (postKind?: 'invoice_issue' | 'receipt_payment') =>
    perform(async () => {
      const result = await postToAccounting(document!.id, postKind);
      return result.postKind === 'invoice_issue'
        ? '売掛金・売上の仕訳を作成し、会計に連携しました'
        : '入金（売掛金消込）の仕訳を作成し、会計に連携しました';
    });

  if (loading && !document) return <Spinner className="py-32" />;

  if (!document) {
    return (
      <Page width="narrow">
        <PageHeader back={{ href: '/billing', label: '帳票' }} title="帳票" />
        <Card>
          <EmptyState icon="billing" title="帳票が見つかりません" action={<ButtonLink href="/billing" variant="secondary">帳票一覧へ</ButtonLink>} />
        </Card>
      </Page>
    );
  }

  // 状態に応じて「次にやること」を1つだけ主ボタンにする
  let primary: Action | null = null;
  const secondary: Action[] = [];
  if (document.kind === 'estimate') {
    primary = { key: 'toInvoice', label: '請求書に変換', icon: 'convert', run: () => handleConvert('invoice') };
  } else if (document.kind === 'invoice') {
    const receiptPayment: Action = { key: 'paid', label: '入金を記録', icon: 'payment', run: () => handlePost('receipt_payment') };
    if (!document.postedToAccounting) {
      primary = { key: 'post', label: '売上を計上', icon: 'check', run: () => handlePost('invoice_issue') };
      if (document.status !== 'paid') secondary.push(receiptPayment);
    } else if (document.status !== 'paid') {
      primary = receiptPayment;
    }
    if (document.status === 'issued') {
      secondary.push({
        key: 'sent',
        label: '送付済にする',
        icon: 'send',
        run: () =>
          perform(async () => {
            await updateDocument(document.id, { status: 'sent' });
            return '送付済に更新しました';
          }),
      });
    }
    secondary.push({ key: 'receipt', label: '領収書を発行', icon: 'billing', run: () => handleConvert('receipt') });
  } else if (document.kind === 'receipt' && !document.postedToAccounting) {
    primary = { key: 'postReceipt', label: '入金を会計連携', icon: 'check', run: () => handlePost('receipt_payment') };
  }

  return (
    <Page width="default" className="print:max-w-none print:space-y-0 print:p-0">
      <div className="no-print space-y-5">
        <PageHeader
          back={{ href: '/billing', label: '帳票' }}
          eyebrow={
            <span className="num">
              {document.documentNumber} · {document.issueDate}
            </span>
          }
          title={`${document.customerName}`}
          subtitle={
            <span className="flex flex-wrap items-center gap-2">
              <span>{ISSUED_DOCUMENT_KIND_LABELS[document.kind]}</span>
              <Badge variant={statusBadgeVariant(document.status)} dot>
                {ISSUED_DOCUMENT_STATUS_LABELS[document.status]}
              </Badge>
              {document.postedToAccounting && <Badge variant="green">会計連携済</Badge>}
              <Link href={`/projects/${document.projectId}`} className="text-accent">
                {document.projectName}
              </Link>
            </span>
          }
        />

        <Card className="p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-ink-3">{document.kind === 'estimate' ? '御見積金額' : document.kind === 'receipt' ? '領収金額' : 'ご請求金額'}</p>
              <p className="num text-[26px] font-semibold tracking-tight text-ink">{formatYen(document.totalAmount)}</p>
            </div>
            {primary && (
              <Button icon={primary.icon} loading={busy} onClick={primary.run} className="w-full sm:w-auto">
                {primary.label}
              </Button>
            )}
          </div>
          <div className="mt-4 flex flex-wrap gap-2 border-t border-line/[0.06] pt-4">
            {secondary.map((a) => (
              <Button key={a.key} variant="secondary" size="sm" icon={a.icon} onClick={a.run} disabled={busy}>
                {a.label}
              </Button>
            ))}
            <PdfExportButton document={document} issuer={settings} />
            <Button variant="ghost" size="sm" icon="trash" onClick={() => setConfirmDelete(true)} className="ml-auto hover:!text-negative">
              削除
            </Button>
          </div>
        </Card>

        {message && (
          <Banner
            tone="success"
            action={
              document.linkedJournalIds.length > 0 && (
                <Link href="/journals" className="text-sm font-medium text-accent">
                  仕訳帳へ
                </Link>
              )
            }
          >
            {message}
          </Banner>
        )}
        {error && <Banner tone="danger">{error}</Banner>}
      </div>

      <div className="rounded-card bg-fill/[0.06] p-2 sm:p-6 print:bg-transparent print:p-0">
        <DocumentPreview document={document} issuer={settings} />
      </div>

      {document.linkedJournalIds.length > 0 && (
        <p className="no-print num break-all text-xs text-ink-3">連携仕訳: {document.linkedJournalIds.join(', ')}</p>
      )}

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="帳票を削除"
        description={`${document.documentNumber} を削除します。`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
              キャンセル
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                await deleteDocument(document.id);
                router.push('/billing');
              }}
            >
              削除する
            </Button>
          </>
        }
      >
        <p className="pt-1 text-sm text-ink-2">この操作は取り消せません。</p>
      </Modal>
    </Page>
  );
}
