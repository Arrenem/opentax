import React from 'react';
import Link from 'next/link';
import { Icon } from './Icon';
import { SectionTabs } from '@/components/layout/SectionTabs';

const WIDTHS = {
  narrow: 'max-w-3xl',
  default: 'max-w-5xl',
  wide: 'max-w-7xl',
};

/** すべての画面で共通の外枠。横幅・余白・縦のリズムを揃える */
export function Page({
  children,
  width = 'default',
  className = '',
}: {
  children: React.ReactNode;
  width?: keyof typeof WIDTHS;
  className?: string;
}) {
  return (
    <div className={`mx-auto w-full ${WIDTHS[width]} space-y-5 px-4 pb-10 pt-4 sm:space-y-6 sm:px-6 sm:pt-8 lg:px-10 ${className}`}>
      {children}
    </div>
  );
}

interface PageHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  back?: { href: string; label: string };
  /** タイトルの上に出す小さなラベル（例: 「請求」グループ名） */
  eyebrow?: React.ReactNode;
}

export function PageHeader({ title, subtitle, actions, back, eyebrow }: PageHeaderProps) {
  return (
    <header className="space-y-3">
      <SectionTabs />
      {back && (
        <Link
          href={back.href}
          className="-ml-1 inline-flex h-8 items-center gap-0.5 rounded-full pr-2 text-[15px] text-accent hover:opacity-80"
        >
          <Icon name="chevronLeft" size={18} strokeWidth={2.2} />
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          {eyebrow && <p className="mb-1 text-[13px] font-medium text-ink-3">{eyebrow}</p>}
          <h1 className="text-[28px] font-bold leading-tight tracking-tight text-ink sm:text-[32px]">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-ink-2">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

/** カードの外に置く小見出し付きのまとまり */
export function Section({
  title,
  action,
  children,
  className = '',
}: {
  title?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`min-w-0 space-y-3 ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 px-1">
          {title && <h2 className="text-[17px] font-semibold text-ink">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/** フィルタ等を横に並べる帯。狭い画面では折り返す */
export function Toolbar({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`flex flex-wrap items-center gap-2 ${className}`}>{children}</div>;
}
