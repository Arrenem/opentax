'use client';
export const dynamic = 'force-dynamic';

import { useState } from 'react';
import Link from 'next/link';
import { useProjects } from '@/hooks/useProjects';
import { useCustomers } from '@/hooks/useCustomers';
import { Button, IconButton } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Page, PageHeader } from '@/components/ui/Page';
import { Segmented } from '@/components/ui/Segmented';
import { Banner, EmptyState, Spinner } from '@/components/ui/Feedback';
import { Icon } from '@/components/ui/Icon';
import { PROJECT_STATUS_LABELS, type Project, type ProjectStatus } from '@/types';
import { projectStatusBadgeVariant } from '@/lib/billing/labels';

const STATUS_OPTIONS = [
  { value: 'active', label: '進行中' },
  { value: 'completed', label: '完了' },
  { value: 'cancelled', label: '中止' },
];

type ProjectForm = { name: string; customerId: string; description: string; status: ProjectStatus; startDate: string; endDate: string };
const EMPTY: ProjectForm = { name: '', customerId: '', description: '', status: 'active', startDate: '', endDate: '' };

export default function ProjectsPage() {
  const [status, setStatus] = useState<ProjectStatus | 'all'>('active');
  const { projects, loading, createProject, updateProject, deleteProject } = useProjects({ status: status === 'all' ? undefined : status });
  const { customers } = useCustomers();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [form, setForm] = useState<ProjectForm>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function openCreate() {
    setEditing(null);
    setConfirmDelete(false);
    setForm({ ...EMPTY, customerId: customers[0]?.id ?? '', startDate: new Date().toISOString().slice(0, 10) });
    setOpen(true);
  }

  function openEdit(p: Project) {
    setEditing(p);
    setConfirmDelete(false);
    setForm({ name: p.name, customerId: p.customerId, description: p.description ?? '', status: p.status, startDate: p.startDate ?? '', endDate: p.endDate ?? '' });
    setOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim() || !form.customerId) return;
    const customer = customers.find((c) => c.id === form.customerId);
    setSaving(true);
    try {
      if (editing) await updateProject(editing.id, { ...form, customerName: customer?.name ?? editing.customerName });
      else await createProject({ ...form, customerName: customer?.name ?? '' });
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!editing) return;
    setSaving(true);
    try {
      await deleteProject(editing.id);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Page>
      <PageHeader
        title="案件"
        subtitle="顧客ごとの仕事。見積・請求・領収をここに紐づけます"
        actions={
          <Button icon="plus" onClick={openCreate} disabled={customers.length === 0}>
            案件を追加
          </Button>
        }
      />

      {customers.length === 0 && !loading && (
        <Banner tone="warning" action={<Link href="/customers" className="text-sm font-medium text-accent">顧客を登録</Link>}>
          案件を作るには、先に顧客を登録してください。
        </Banner>
      )}

      <Segmented
        label="状態"
        value={status}
        onChange={setStatus}
        options={[{ value: 'active', label: '進行中' }, { value: 'completed', label: '完了' }, { value: 'cancelled', label: '中止' }, { value: 'all', label: 'すべて' }]}
      />

      <Card className="overflow-hidden">
        {loading ? (
          <Spinner />
        ) : projects.length === 0 ? (
          <EmptyState icon="project" title="該当する案件はありません" />
        ) : (
          <ul className="divide-y divide-line/[0.06]">
            {projects.map((p) => (
              <li key={p.id} className="flex items-center gap-2 pr-2 transition-colors hover:bg-fill/[0.04] sm:pr-4">
                <Link href={`/projects/${p.id}`} className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 sm:px-6">
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[15px] font-medium text-ink sm:text-sm">{p.name}</span>
                      <Badge variant={projectStatusBadgeVariant(p.status)}>{PROJECT_STATUS_LABELS[p.status]}</Badge>
                    </span>
                    <span className="mt-0.5 block truncate text-[13px] text-ink-3">
                      {p.customerName}
                      {p.startDate ? ` · ${p.startDate}${p.endDate ? ` 〜 ${p.endDate}` : ' 〜'}` : ''}
                    </span>
                  </span>
                  <Icon name="chevronRight" size={16} strokeWidth={2} className="text-ink-3/70" />
                </Link>
                <IconButton icon="pencil" label="編集" size={36} onClick={() => openEdit(p)} className="!bg-transparent" />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={confirmDelete ? '案件を削除' : editing ? '案件を編集' : '案件を追加'}
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
              <Button onClick={handleSave} loading={saving} disabled={!form.name.trim() || !form.customerId}>
                保存
              </Button>
            </>
          )
        }
      >
        {confirmDelete ? (
          <p className="pt-1 text-sm text-ink-2">案件「{editing?.name}」を削除します。</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 pt-1 sm:grid-cols-2">
            <Input label="案件名" wrapperClassName="sm:col-span-2" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Select
              label="顧客"
              options={[{ value: '', label: '選択してください' }, ...customers.map((c) => ({ value: c.id, label: c.name }))]}
              value={form.customerId}
              onChange={(e) => setForm({ ...form, customerId: e.target.value })}
            />
            <Select label="ステータス" options={STATUS_OPTIONS} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ProjectStatus })} />
            <Input label="説明" wrapperClassName="sm:col-span-2" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <Input label="開始日" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
            <Input label="終了日" type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
          </div>
        )}
      </Modal>
    </Page>
  );
}
