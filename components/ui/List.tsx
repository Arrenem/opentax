import React from 'react';
import Link from 'next/link';
import { Icon, type IconName } from './Icon';

/** 区切り線付きの行リスト（iOS のグループ化リスト）。表の代わりにモバイルで使う */
export function ListGroup({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`overflow-hidden rounded-card border border-line/[0.06] bg-surface shadow-card ${className}`}>
      <ul className="divide-y divide-line/[0.06]">{children}</ul>
    </div>
  );
}

interface ListRowProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** 右側の主要な値（金額など） */
  value?: React.ReactNode;
  /** 右側の値の下に出す補足（ステータス等） */
  meta?: React.ReactNode;
  icon?: IconName;
  iconTone?: string;
  leading?: React.ReactNode;
  href?: string;
  onClick?: () => void;
  chevron?: boolean;
  active?: boolean;
  className?: string;
}

export function ListRow({
  title,
  subtitle,
  value,
  meta,
  icon,
  iconTone = 'bg-fill/[0.12] text-ink-2',
  leading,
  href,
  onClick,
  chevron,
  active = false,
  className = '',
}: ListRowProps) {
  const interactive = Boolean(href || onClick);
  const body = (
    <div
      className={`flex min-h-[60px] items-center gap-3 px-4 py-3 sm:px-5 ${
        interactive ? 'transition-colors hover:bg-fill/[0.05] active:bg-fill/[0.1]' : ''
      } ${active ? 'bg-accent/[0.06]' : ''} ${className}`}
    >
      {leading ??
        (icon && (
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] ${iconTone}`}>
            <Icon name={icon} size={18} />
          </span>
        ))}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] text-ink sm:text-sm">{title}</div>
        {subtitle && <div className="mt-0.5 truncate text-[13px] text-ink-3">{subtitle}</div>}
      </div>
      {(value !== undefined || meta) && (
        <div className="flex shrink-0 flex-col items-end gap-1 text-right">
          {value !== undefined && <div className="num text-[15px] font-medium text-ink sm:text-sm">{value}</div>}
          {meta}
        </div>
      )}
      {(chevron ?? Boolean(href)) && <Icon name="chevronRight" size={16} strokeWidth={2} className="-mr-1 text-ink-3/70" />}
    </div>
  );

  return (
    <li>
      {href ? (
        <Link href={href} className="block">
          {body}
        </Link>
      ) : onClick ? (
        <button type="button" onClick={onClick} className="block w-full text-left">
          {body}
        </button>
      ) : (
        body
      )}
    </li>
  );
}
