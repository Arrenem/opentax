import React from 'react';
import { Icon, type IconName } from './Icon';

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center py-16 ${className}`} role="status" aria-label="読み込み中">
      <span className="h-7 w-7 animate-spin rounded-full border-[2.5px] border-ink/15 border-t-ink/60" />
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-control bg-fill/[0.1] ${className}`} />;
}

export function EmptyState({
  icon = 'sparkles',
  title,
  description,
  action,
  className = '',
}: {
  icon?: IconName;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center px-6 py-14 text-center ${className}`}>
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-fill/[0.1] text-ink-3">
        <Icon name={icon} size={26} />
      </div>
      <p className="text-[15px] font-semibold text-ink">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-ink-2">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

type BannerTone = 'info' | 'warning' | 'danger' | 'success';

const BANNER_TONES: Record<BannerTone, { box: string; icon: IconName }> = {
  info: { box: 'bg-accent/[0.07] text-ink [&_svg]:text-accent', icon: 'sparkles' },
  warning: { box: 'bg-warning/[0.09] text-ink [&_svg]:text-warning', icon: 'warning' },
  danger: { box: 'bg-negative/[0.07] text-negative [&_svg]:text-negative', icon: 'warning' },
  success: { box: 'bg-positive/[0.08] text-ink [&_svg]:text-positive', icon: 'review' },
};

/** 画面内の通知・警告。role はトーンから決める */
export function Banner({
  tone = 'info',
  title,
  children,
  action,
  className = '',
}: {
  tone?: BannerTone;
  title?: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  const t = BANNER_TONES[tone];
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={`flex items-start gap-3 rounded-2xl px-4 py-3 text-sm ${t.box} ${className}`}
    >
      <Icon name={t.icon} size={18} strokeWidth={2} className="mt-px" />
      <div className="min-w-0 flex-1 leading-relaxed">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? 'mt-0.5 opacity-90' : ''}>{children}</div>}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  );
}
