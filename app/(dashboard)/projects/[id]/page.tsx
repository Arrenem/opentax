'use client';
export const dynamic = 'force-dynamic';

import { useMemo } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useProjects } from '@/hooks/useProjects';
import { useIssuedDocuments } from '@/hooks/useIssuedDocuments';
import { ButtonLink } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Page, PageHeader, Section } from '@/components/ui/Page';
import { EmptyState, Spinner } from '@/components/ui/Feedback';
import { Icon } from '@/components/ui/Icon';
import { ISSUED_DOCUMENT_KIND_LABELS, ISSUED_DOCUMENT_STATUS_LABELS, PROJECT_STATUS_LABELS } from '@/types';
import { projectStatusBadgeVariant, statusBadgeVariant } from '@/lib/billing/labels';
import { formatYen } from '@/lib/utils/format';

export default function ProjectDetailPage() {
  const params = useParams();
  const projectId = String(params.id ?? '');
  const { projects, loading: projectsLoading } = useProjects();
  const { documents, loading: docsLoading } = useIssuedDocuments({ projectId });
  const project = useMemo(() => projects.find((p) => p.id === projectId), [projects, projectId]);

  if (projectsLoading) return <Spinner className="py-32" />;

  if (!project) {
    return (
      <Page width="narrow">
        <PageHeader back={{ href: '/projects', label: '案件' }} title="案件" />
        <Card>
          <EmptyState icon="project" title="案件が見つかりません" />
        </Card>
      </Page>
    );
  }

  const invoiced = documents.filter((d) => d.kind === 'invoice' && d.status !== 'cancelled').reduce((s, d) => s + d.totalAmount, 0);

  return (
    <Page>
      <PageHeader
        back={{ href: '/projects', label: '案件' }}
        eyebrow={project.customerName}
        title={project.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant={projectStatusBadgeVariant(project.status)}>{PROJECT_STATUS_LABELS[project.status]}</Badge>
            {project.description && <span>{project.description}</span>}
          </span>
        }
        actions={
          <>
            <ButtonLink href={`/billing/new?projectId=${project.id}&kind=estimate`} variant="secondary">
              見積書
            </ButtonLink>
            <ButtonLink href={`/billing/new?projectId=${project.id}&kind=invoice`} icon="plus">
              請求書を作成
            </ButtonLink>
          </>
        }
      />

      <Section title="この案件の帳票" action={<span className="num text-sm text-ink-3">請求額 {formatYen(invoiced)}</span>}>
        <Card className="overflow-hidden">
          {docsLoading ? (
            <Spinner />
          ) : documents.length === 0 ? (
            <EmptyState icon="billing" title="まだ帳票がありません" />
          ) : (
            <ul className="divide-y divide-line/[0.06]">
              {documents.map((d) => (
                <li key={d.id}>
                  <Link href={`/billing/${d.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-fill/[0.05] sm:px-6">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] text-ink sm:text-sm">
                        {ISSUED_DOCUMENT_KIND_LABELS[d.kind]}
                        {d.title ? ` · ${d.title}` : ''}
                      </span>
                      <span className="num mt-0.5 block truncate text-[13px] text-ink-3">
                        {d.documentNumber} · {d.issueDate} · {d.postedToAccounting ? '会計連携済' : '未連携'}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <span className="num text-[15px] font-medium text-ink sm:text-sm">{formatYen(d.totalAmount)}</span>
                      <Badge variant={statusBadgeVariant(d.status)} dot>
                        {ISSUED_DOCUMENT_STATUS_LABELS[d.status]}
                      </Badge>
                    </span>
                    <Icon name="chevronRight" size={16} strokeWidth={2} className="text-ink-3/70" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </Section>
    </Page>
  );
}
