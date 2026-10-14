'use client';
export const dynamic = 'force-dynamic';

import { Suspense, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useDocuments } from '@/hooks/useDocuments';
import { useProjects } from '@/hooks/useProjects';
import { DocumentViewer } from '@/components/Documents/DocumentViewer';
import { CONTROL_CLASS, Input, Select } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Icon } from '@/components/ui/Icon';
import { Page, PageHeader } from '@/components/ui/Page';
import { Banner, EmptyState, Spinner } from '@/components/ui/Feedback';
import { formatYen } from '@/lib/utils/format';
import { formatDate } from '@/lib/utils/date';
import type { Document } from '@/types';

const DOC_TYPE_LABELS: Record<Document['documentType'], string> = {
  receipt: '領収書',
  invoice: '請求書',
  credit_card_statement: 'クレカ明細',
  bank_statement: '銀行明細',
  other: 'その他',
};

const EMPTY_UPLOAD = {
  documentType: 'receipt' as Document['documentType'],
  transactionDate: '',
  counterparty: '',
  amount: '',
  invoiceRegistrationNumber: '',
  projectId: '',
  sourceReference: '',
};

function DocumentsView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [counterparty, setCounterparty] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [selected, setSelected] = useState<Document | null>(null);
  const [mobileViewerOpen, setMobileViewerOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [meta, setMeta] = useState(EMPTY_UPLOAD);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  const { projects } = useProjects();
  const { documents, loading, uploadDocument } = useDocuments({
    counterparty: counterparty || undefined,
    minAmount: minAmount ? Number(minAmount) : undefined,
    maxAmount: maxAmount ? Number(maxAmount) : undefined,
  });

  useEffect(() => {
    if (searchParams.get('upload') === '1') setUploadOpen(true);
  }, [searchParams]);

  function closeUpload() {
    setUploadOpen(false);
    setUploadError('');
    if (searchParams.get('upload')) router.replace(pathname);
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    setUploadError('');
    try {
      await uploadDocument(file, meta.documentType, {
        transactionDate: meta.transactionDate,
        counterparty: meta.counterparty,
        amount: meta.amount,
        invoiceRegistrationNumber: meta.invoiceRegistrationNumber,
        projectId: meta.projectId,
        sourceReference: meta.sourceReference,
      });
      setFile(null);
      setMeta(EMPTY_UPLOAD);
      closeUpload();
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'アップロードに失敗しました');
    } finally {
      setUploading(false);
    }
  }

  function select(doc: Document) {
    setSelected(doc);
    setMobileViewerOpen(true);
  }

  return (
    <Page width="wide">
      <PageHeader
        title="証憑"
        subtitle="領収書・請求書などの原本を保存します（電子帳簿保存法の検索要件に対応）"
        actions={
          <Button icon="camera" onClick={() => setUploadOpen(true)}>
            証憑を追加
          </Button>
        }
      />

      {/* 検索: 取引先・金額（日付は一覧の並び順） */}
      <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
        <div className="relative col-span-2 sm:w-72">
          <Icon name="search" size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3" />
          <input
            type="search"
            aria-label="取引先で検索"
            placeholder="取引先で検索"
            value={counterparty}
            onChange={(e) => setCounterparty(e.target.value)}
            className={`${CONTROL_CLASS} pl-10`}
          />
        </div>
        <input
          type="number"
          inputMode="numeric"
          aria-label="最低金額"
          placeholder="¥ 下限"
          value={minAmount}
          onChange={(e) => setMinAmount(e.target.value)}
          className={`${CONTROL_CLASS} num sm:w-32`}
        />
        <input
          type="number"
          inputMode="numeric"
          aria-label="最高金額"
          placeholder="¥ 上限"
          value={maxAmount}
          onChange={(e) => setMaxAmount(e.target.value)}
          className={`${CONTROL_CLASS} num sm:w-32`}
        />
        <p className="col-span-2 text-sm text-ink-3 sm:ml-auto">{loading ? '' : `${documents.length}件`}</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="overflow-hidden">
          {loading ? (
            <Spinner />
          ) : documents.length === 0 ? (
            <EmptyState
              icon="evidence"
              title="証憑がありません"
              description="レシートや請求書を撮影・アップロードして保存しましょう。"
              action={
                <Button icon="camera" onClick={() => setUploadOpen(true)}>
                  証憑を追加
                </Button>
              }
            />
          ) : (
            <ul className="divide-y divide-line/[0.06]">
              {documents.map((doc) => (
                <li key={doc.id}>
                  <button
                    type="button"
                    onClick={() => select(doc)}
                    className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors sm:px-5 ${
                      selected?.id === doc.id ? 'bg-accent/[0.06]' : 'hover:bg-fill/[0.05] active:bg-fill/[0.1]'
                    }`}
                  >
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-fill/[0.1] text-ink-3">
                      {doc.fileType === 'application/pdf' ? (
                        <span className="text-[11px] font-bold text-negative">PDF</span>
                      ) : !doc.storageUrl ? (
                        <Icon name="evidence" size={20} />
                      ) : (
                        <img
                          src={doc.storageUrl}
                          alt=""
                          className="h-full w-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] text-ink sm:text-sm">{doc.counterparty || doc.originalFileName}</span>
                      <span className="mt-0.5 block truncate text-[13px] text-ink-3">
                        {DOC_TYPE_LABELS[doc.documentType]} · {formatDate(doc.transactionDate ?? doc.uploadedAt)}
                      </span>
                    </span>
                    {doc.amount !== undefined && <span className="num shrink-0 text-[15px] font-medium text-ink sm:text-sm">{formatYen(doc.amount)}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* デスクトップ: 右側に固定のプレビュー */}
        <aside className="hidden lg:block">
          <Card className="sticky top-8 flex h-[calc(100dvh-4rem)] max-h-[760px] flex-col p-4">
            <DocumentViewer key={selected?.id ?? 'none'} document={selected} />
          </Card>
        </aside>
      </div>

      {/* モバイル: シートでプレビュー */}
      <div className="lg:hidden">
        <Modal open={mobileViewerOpen && selected !== null} onClose={() => setMobileViewerOpen(false)} title={selected?.counterparty || selected?.originalFileName}>
          <DocumentViewer key={selected?.id ?? 'none'} document={selected} />
        </Modal>
      </div>

      <Modal
        open={uploadOpen}
        onClose={closeUpload}
        title="証憑を追加"
        description="PDF・JPEG・PNG（10MBまで）"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={closeUpload}>
              キャンセル
            </Button>
            <Button type="submit" form="evidence-upload" loading={uploading} disabled={!file}>
              保存する
            </Button>
          </>
        }
      >
        <form id="evidence-upload" onSubmit={handleUpload} className="space-y-4 pt-1">
          <label
            className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-8 text-center transition-colors ${
              file ? 'border-accent/40 bg-accent/[0.05]' : 'border-line/[0.12] hover:bg-fill/[0.05]'
            }`}
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 text-accent">
              <Icon name={file ? 'check' : 'camera'} size={24} />
            </span>
            <span className="text-[15px] font-medium text-ink">{file ? file.name : '撮影またはファイルを選択'}</span>
            <span className="text-xs text-ink-3">{file ? `${Math.round(file.size / 1024)} KB · タップで変更` : 'スマートフォンではカメラで直接撮影できます'}</span>
            <input type="file" accept="image/jpeg,image/png,application/pdf" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Select
              label="種別"
              wrapperClassName="col-span-2 sm:col-span-1"
              value={meta.documentType}
              onChange={(e) => setMeta({ ...meta, documentType: e.target.value as Document['documentType'] })}
              options={Object.entries(DOC_TYPE_LABELS).map(([value, label]) => ({ value, label }))}
            />
            <Input label="取引日" type="date" value={meta.transactionDate} onChange={(e) => setMeta({ ...meta, transactionDate: e.target.value })} />
            <Input label="金額（円）" type="number" inputMode="numeric" min="0" value={meta.amount} onChange={(e) => setMeta({ ...meta, amount: e.target.value })} />
            <Input label="取引先" wrapperClassName="col-span-2 sm:col-span-3" value={meta.counterparty} onChange={(e) => setMeta({ ...meta, counterparty: e.target.value })} />
          </div>

          <details className="group rounded-2xl bg-fill/[0.06] px-4 py-1">
            <summary className="flex h-11 cursor-pointer list-none items-center justify-between text-sm font-medium text-ink-2">
              詳細（登録番号・案件・参照ID）
              <Icon name="chevronDown" size={16} className="transition-transform group-open:rotate-180" />
            </summary>
            <div className="grid grid-cols-1 gap-3 pb-4 sm:grid-cols-3">
              <Input label="インボイス登録番号" placeholder="T + 13桁" value={meta.invoiceRegistrationNumber} onChange={(e) => setMeta({ ...meta, invoiceRegistrationNumber: e.target.value })} />
              <Select
                label="案件"
                value={meta.projectId}
                onChange={(e) => setMeta({ ...meta, projectId: e.target.value })}
                options={[{ value: '', label: '案件なし' }, ...projects.map((p) => ({ value: p.id, label: p.name }))]}
              />
              <Input label="参照ID" value={meta.sourceReference} onChange={(e) => setMeta({ ...meta, sourceReference: e.target.value })} />
            </div>
          </details>

          {uploadError && <Banner tone="danger">{uploadError}</Banner>}
        </form>
      </Modal>
    </Page>
  );
}

export default function DocumentsPage() {
  return (
    <Suspense>
      <DocumentsView />
    </Suspense>
  );
}
