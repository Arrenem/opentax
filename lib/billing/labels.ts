import type { IssuedDocumentKind, IssuedDocumentStatus, ProjectStatus } from '@/types';

export {
  ISSUED_DOCUMENT_KIND_LABELS,
  ISSUED_DOCUMENT_STATUS_LABELS,
  PROJECT_STATUS_LABELS,
} from '@/types';

export function statusBadgeVariant(
  status: IssuedDocumentStatus
): 'green' | 'yellow' | 'red' | 'blue' | 'gray' {
  switch (status) {
    case 'paid':
      return 'green';
    case 'issued':
    case 'sent':
      return 'blue';
    case 'draft':
      return 'yellow';
    case 'cancelled':
      return 'red';
    default:
      return 'gray';
  }
}

export function projectStatusBadgeVariant(
  status: ProjectStatus
): 'green' | 'yellow' | 'red' | 'blue' | 'gray' {
  switch (status) {
    case 'active':
      return 'blue';
    case 'completed':
      return 'green';
    case 'cancelled':
      return 'red';
    default:
      return 'gray';
  }
}

export function kindOptions(): Array<{ value: IssuedDocumentKind; label: string }> {
  return [
    { value: 'estimate', label: '見積書' },
    { value: 'invoice', label: '請求書' },
    { value: 'receipt', label: '領収書' },
  ];
}

export function amountHeadline(kind: IssuedDocumentKind, hasWithholding: boolean): string {
  if (hasWithholding) return '差引お振込額';
  if (kind === 'estimate') return '御見積金額（税込）';
  if (kind === 'receipt') return '領収金額（税込）';
  return 'ご請求金額（税込）';
}
