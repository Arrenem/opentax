'use client';

import Link from 'next/link';
import { Modal } from '@/components/ui/Modal';
import { Icon } from '@/components/ui/Icon';
import { QUICK_ACTIONS } from './navigation';

export function QuickAddSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="新規作成" size="sm">
      <div className="grid grid-cols-2 gap-2.5 pt-1">
        {QUICK_ACTIONS.map((action) => (
          <Link
            key={action.href}
            href={action.href}
            onClick={onClose}
            className="flex flex-col gap-3 rounded-2xl bg-fill/[0.07] p-4 transition-colors hover:bg-fill/[0.12] active:scale-[0.98]"
          >
            <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${action.tone}`}>
              <Icon name={action.icon} size={21} />
            </span>
            <span>
              <span className="block text-[15px] font-semibold text-ink">{action.label}</span>
              <span className="mt-0.5 block text-xs leading-snug text-ink-3">{action.description}</span>
            </span>
          </Link>
        ))}
      </div>
    </Modal>
  );
}
