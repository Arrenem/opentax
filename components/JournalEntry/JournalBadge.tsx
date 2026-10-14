import { Badge } from '@/components/ui/Badge';
import type { JournalStatus } from '@/types';

export function JournalBadge({ status }: { status: JournalStatus | 'auto' }) {
  switch (status) {
    case 'confirmed':
      return <Badge variant="green" dot>確認済</Badge>;
    case 'pending':
    case 'auto':
      return <Badge variant="yellow" dot>要確認</Badge>;
    default:
      return <Badge variant="gray">{status}</Badge>;
  }
}
