'use client';
export const dynamic = 'force-dynamic';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useProjects } from '@/hooks/useProjects';
import { useCustomers } from '@/hooks/useCustomers';
import { useIssuedDocuments } from '@/hooks/useIssuedDocuments';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Page, PageHeader } from '@/components/ui/Page';
import { Segmented } from '@/components/ui/Segmented';
import { Banner, Spinner } from '@/components/ui/Feedback';
import { LineItemsEditor } from '@/components/Billing/LineItemsEditor';
import type { BillingLineItem, IssuedDocumentKind } from '@/types';
import { calculateDocumentTotals, emptyBillingLine } from '@/lib/billing';
import { formatYen } from '@/lib/utils/format';

function NewBillingForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const presetProjectId = searchParams.get('projectId') ?? '';
  const presetKind = (searchParams.get('kind') as IssuedDocumentKind | null) ?? 'invoice';

  const { projects } = useProjects();
  const { customers } = useCustomers();
  const { createDocument } = useIssuedDocuments();

  const [kind, setKind] = useState<IssuedDocumentKind>(presetKind);
  const [projectId, setProjectId] = useState(presetProjectId);
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState('');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [lineItems, setLineItems] = useState<BillingLineItem[]>([emptyBillingLine()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (presetProjectId) setProjectId(presetProjectId);
  }, [presetProjectId]);
  useEffect(() => {
    setKind(presetKind);
  }, [presetKind]);

  const project = useMemo(() => projects.find((p) => p.id === projectId), [projects, projectId]);
  const customer = useMemo(() => customers.find((c) => c.id === project?.customerId), [customers, project]);
  const totals = calculateDocumentTotals(lineItems);

  async function handleSubmit(asDraft: boolean) {
    if (!project) {
      setError('案件を選択してください');
      return;
    }
    if (lineItems.every((l) => !l.description.trim() || l.amount <= 0)) {
      setError('有効な明細を入力してください');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await createDocument({
        kind,
        projectId: project.id,
        projectName: project.name,
        customerId: project.customerId,
        customerName: project.customerName,
        customerAddress: customer?.address,
        issueDate,
        dueDate: kind === 'invoice' ? dueDate : undefined,
        title,
        lineItems,
        notes,
        status: asDraft ? 'draft' : 'issued',
      });
      router.push(`/billing/${result.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Page width="narrow" className="pb-32">
      <PageHeader back={{ href: '/billing', label: '帳票' }} title="帳票を作成" />

      <Segmented
        block
        label="帳票の種類"
        value={kind}
        onChange={setKind}
        options={[
          { value: 'estimate', label: '見積書' },
          { value: 'invoice', label: '請求書' },
          { value: 'receipt', label: '領収書' },
        ]}
        className="sm:w-96"
      />

      <Card>
        <CardHeader title="宛先と日付" />
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            label="案件"
            wrapperClassName="sm:col-span-2"
            options={[{ value: '', label: '選択してください' }, ...projects.map((p) => ({ value: p.id, label: `${p.name}（${p.customerName}）` }))]}
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            hint={
              project
                ? `発行先: ${project.customerName}${customer?.address ? ` / ${customer.address}` : ''}`
                : projects.length === 0
                  ? undefined
                  : '案件の顧客が発行先になります'
            }
          />
          {projects.length === 0 && (
            <p className="text-sm text-ink-2 sm:col-span-2">
              案件がありません。先に
              <Link href="/projects" className="mx-1 text-accent">
                案件
              </Link>
              を登録してください。
            </p>
          )}
          <Input label="発行日" type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
          {kind === 'invoice' && <Input label="支払期限" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />}
          <Input label="件名" wrapperClassName="sm:col-span-2" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例: Webサイト制作 第1回請求" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="明細" />
        <CardContent>
          <LineItemsEditor items={lineItems} onChange={setLineItems} />
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Textarea label="備考" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="振込先・有効期限など" />
        </CardContent>
      </Card>

      {error && <Banner tone="danger">{error}</Banner>}

      {/* 合計と発行ボタンを常に見える位置に */}
      <div className="no-print fixed inset-x-0 bottom-[calc(60px+env(safe-area-inset-bottom))] z-30 border-t border-line/[0.08] glass lg:bottom-0 lg:left-[264px]">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-3 sm:px-6 lg:px-10">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-ink-3">{totals.withholdingAmount > 0 ? '差引お振込額' : '合計（税込）'}</p>
            <p className="num truncate text-lg font-semibold text-ink">{formatYen(totals.withholdingAmount > 0 ? totals.amountDue : totals.totalAmount)}</p>
          </div>
          <Button variant="secondary" onClick={() => handleSubmit(true)} loading={saving}>
            下書き
          </Button>
          <Button onClick={() => handleSubmit(false)} loading={saving}>
            発行する
          </Button>
        </div>
      </div>
    </Page>
  );
}

export default function NewBillingDocumentPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <NewBillingForm />
    </Suspense>
  );
}
