'use client';
export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { useCustomers } from '@/hooks/useCustomers';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Card } from '@/components/ui/Card';
import { Page, PageHeader } from '@/components/ui/Page';
import { EmptyState, Spinner } from '@/components/ui/Feedback';
import type { Customer } from '@/types';

type CustomerForm = {
  name: string;
  nameKana: string;
  address: string;
  email: string;
  phone: string;
  invoiceRegistrationNumber: string;
  note: string;
};

const EMPTY: CustomerForm = { name: '', nameKana: '', address: '', email: '', phone: '', invoiceRegistrationNumber: '', note: '' };

export default function CustomersPage() {
  const { customers, loading, createCustomer, updateCustomer, deleteCustomer } = useCustomers();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState<CustomerForm>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setConfirmDelete(false);
    setOpen(true);
  }

  function openEdit(c: Customer) {
    setEditing(c);
    setConfirmDelete(false);
    setForm({
      name: c.name,
      nameKana: c.nameKana ?? '',
      address: c.address ?? '',
      email: c.email ?? '',
      phone: c.phone ?? '',
      invoiceRegistrationNumber: c.invoiceRegistrationNumber ?? '',
      note: c.note ?? '',
    });
    setOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (editing) await updateCustomer(editing.id, form);
      else await createCustomer(form);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!editing) return;
    setSaving(true);
    try {
      await deleteCustomer(editing.id);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Page>
      <PageHeader
        title="顧客"
        subtitle="帳票の発行先です"
        actions={
          <Button icon="plus" onClick={openCreate}>
            顧客を追加
          </Button>
        }
      />

      <Card className="overflow-hidden">
        {loading ? (
          <Spinner />
        ) : customers.length === 0 ? (
          <EmptyState icon="customers" title="顧客がまだありません" action={<Button icon="plus" onClick={openCreate}>顧客を追加</Button>} />
        ) : (
          <ul className="divide-y divide-line/[0.06]">
            {customers.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => openEdit(c)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-fill/[0.05] active:bg-fill/[0.1] sm:px-6">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-fill/[0.12] text-sm font-semibold text-ink-2">
                    {c.name.replace(/^(株式会社|合同会社|有限会社)/, '').slice(0, 1)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium text-ink sm:text-sm">{c.name}</span>
                    <span className="mt-0.5 block truncate text-[13px] text-ink-3">{[c.address, c.email].filter(Boolean).join(' · ') || '連絡先未登録'}</span>
                  </span>
                  {c.invoiceRegistrationNumber && (
                    <span className="num hidden shrink-0 text-xs text-ink-3 sm:block">{c.invoiceRegistrationNumber}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={confirmDelete ? '顧客を削除' : editing ? '顧客を編集' : '顧客を追加'}
        size={confirmDelete ? 'sm' : 'lg'}
        footer={
          confirmDelete ? (
            <>
              <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
                戻る
              </Button>
              <Button variant="danger" loading={saving} onClick={handleDelete}>
                削除する
              </Button>
            </>
          ) : (
            <>
              {editing && (
                <Button variant="danger-tinted" icon="trash" onClick={() => setConfirmDelete(true)} className="sm:mr-auto">
                  削除
                </Button>
              )}
              <Button variant="secondary" onClick={() => setOpen(false)}>
                キャンセル
              </Button>
              <Button onClick={handleSave} loading={saving} disabled={!form.name.trim()}>
                保存
              </Button>
            </>
          )
        }
      >
        {confirmDelete ? (
          <p className="pt-1 text-sm text-ink-2">「{editing?.name}」を削除します。</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 pt-1 sm:grid-cols-2">
            <Input label="顧客名" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Input label="フリガナ" value={form.nameKana} onChange={(e) => setForm({ ...form, nameKana: e.target.value })} />
            <Input label="住所" wrapperClassName="sm:col-span-2" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            <Input label="メール" type="email" inputMode="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <Input label="電話" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <Input
              label="インボイス登録番号"
              value={form.invoiceRegistrationNumber}
              onChange={(e) => setForm({ ...form, invoiceRegistrationNumber: e.target.value })}
              placeholder="T1234567890123"
            />
            <Input label="メモ" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </div>
        )}
      </Modal>
    </Page>
  );
}
