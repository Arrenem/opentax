'use client';
export const dynamic = 'force-dynamic';

import { Suspense, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Timestamp } from 'firebase/firestore';
import { useJournals } from '@/hooks/useJournals';
import { useFiscalYears } from '@/hooks/useFiscalYears';
import { JournalTable } from '@/components/JournalEntry/JournalTable';
import { JournalForm, type JournalFormData } from '@/components/JournalEntry/JournalForm';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Card } from '@/components/ui/Card';
import { Page, PageHeader, Toolbar } from '@/components/ui/Page';
import { Segmented } from '@/components/ui/Segmented';
import { formatYen } from '@/lib/utils/format';
import type { JournalEntry } from '@/types';

const CURRENT_YEAR = new Date().getFullYear();
const MONTH_OPTIONS = [{ value: '', label: '全月' }, ...Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: `${i + 1}月` }))];

type StatusFilter = 'all' | 'pending' | 'confirmed';

function JournalsView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [fiscalYear, setFiscalYear] = useState(CURRENT_YEAR);
  const yearOptions = useFiscalYears().map((y) => ({ value: String(y), label: `${y}年` }));
  const [fiscalMonth, setFiscalMonth] = useState<number | undefined>();
  const [status, setStatus] = useState<StatusFilter>('all');
  const [showForm, setShowForm] = useState(false);

  const { journals, loading, confirmJournal, updateJournal, deleteJournal, createJournal } = useJournals({
    fiscalYear,
    fiscalMonth,
    status: status === 'all' ? undefined : (status as JournalEntry['status']),
  });

  // 「新規作成」シートからの遷移（?new=1）でフォームを開く
  useEffect(() => {
    if (searchParams.get('new') === '1') setShowForm(true);
  }, [searchParams]);

  function closeForm() {
    setShowForm(false);
    if (searchParams.get('new')) router.replace(pathname);
  }

  async function handleCreate(data: JournalFormData) {
    const date = new Date(data.transactionDate);
    await createJournal({
      transactionDate: Timestamp.fromDate(date),
      fiscalYear: date.getFullYear(),
      fiscalMonth: date.getMonth() + 1,
      debitAccount: data.debitAccount,
      debitAmount: data.amount,
      creditAccount: data.creditAccount,
      creditAmount: data.amount,
      counterparty: data.counterparty,
      description: data.description,
      taxType: data.taxType,
      taxAmount: 0,
      taxIncluded: data.taxIncluded,
      isQualifiedInvoice: false,
      sourceType: data.sourceType,
      entryOrigin: 'manual',
      status: 'confirmed',
      isDeleted: false,
      version: 1,
      isCurrent: true,
    });
    closeForm();
  }

  const total = journals.reduce((s, j) => s + j.debitAmount, 0);

  return (
    <Page width="wide">
      <PageHeader
        title="仕訳帳"
        subtitle="すべての取引の記録です。行を選ぶと修正・確定できます。"
        actions={
          <Button icon="plus" onClick={() => setShowForm(true)}>
            仕訳を入力
          </Button>
        }
      />

      <Toolbar>
        <Segmented
          label="状態"
          value={status}
          onChange={setStatus}
          options={[
            { value: 'all', label: 'すべて' },
            { value: 'pending', label: '要確認' },
            { value: 'confirmed', label: '確認済' },
          ]}
        />
        <div className="flex gap-2">
          <Select aria-label="年" value={String(fiscalYear)} onChange={(e) => setFiscalYear(Number(e.target.value))} options={yearOptions} className="w-28" />
          <Select
            aria-label="月"
            value={String(fiscalMonth ?? '')}
            onChange={(e) => setFiscalMonth(e.target.value ? Number(e.target.value) : undefined)}
            options={MONTH_OPTIONS}
            className="w-24"
          />
        </div>
        <p className="num ml-auto text-sm text-ink-3">{loading ? '読み込み中…' : `${journals.length}件 · ${formatYen(total)}`}</p>
      </Toolbar>

      <Card className="overflow-hidden">
        <JournalTable journals={journals} onConfirm={confirmJournal} onUpdate={updateJournal} onDelete={deleteJournal} loading={loading} />
      </Card>

      <Modal open={showForm} onClose={closeForm} title="仕訳を入力" size="lg">
        <JournalForm onSubmit={handleCreate} onCancel={closeForm} />
      </Modal>
    </Page>
  );
}

export default function JournalsPage() {
  return (
    <Suspense>
      <JournalsView />
    </Suspense>
  );
}
