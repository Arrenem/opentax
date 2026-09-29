'use client';

import React, { useEffect } from 'react';
import { IconButton } from './Button';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  /** 下部に固定表示するアクション（保存・キャンセル等） */
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const SIZES = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-4xl',
};

/**
 * モバイルでは下から出るシート、sm 以上では中央のダイアログとして表示する。
 * 本文だけがスクロールし、ヘッダーとフッターは常に見える。
 */
export function Modal({ open, onClose, title, description, children, footer, size = 'md' }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 animate-fade-in bg-black/30 backdrop-blur-[2px]" onClick={onClose} />
      <div
        className={`relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-sheet bg-surface shadow-float animate-sheet-up sm:max-h-[86dvh] sm:rounded-sheet sm:animate-pop-in ${SIZES[size]}`}
      >
        <div className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-fill/[0.3] sm:hidden" aria-hidden="true" />
        {title && (
          <div className="flex shrink-0 items-start justify-between gap-4 px-5 pb-3 pt-3 sm:px-6 sm:pt-5">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-ink">{title}</h2>
              {description && <p className="mt-0.5 text-sm text-ink-2">{description}</p>}
            </div>
            <IconButton icon="close" label="閉じる" onClick={onClose} size={32} />
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 sm:px-6">{children}</div>
        {footer && (
          <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-line/[0.06] px-5 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end sm:px-6 sm:pb-4 [&>*]:w-full sm:[&>*]:w-auto">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
