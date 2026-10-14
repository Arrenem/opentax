import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export function Card({ children, className = '' }: CardProps) {
  return (
    <div className={`rounded-card border border-line/[0.06] bg-surface shadow-card ${className}`}>
      {children}
    </div>
  );
}

interface CardHeaderProps {
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

/** タイトル＋右側アクションの定型ヘッダー。children を渡した場合はそのまま描画する */
export function CardHeader({ title, description, action, children, className = '' }: CardHeaderProps) {
  return (
    <div className={`border-b border-line/[0.06] px-5 py-4 sm:px-6 ${className}`}>
      {children ?? (
        <div className="flex min-h-[28px] items-center justify-between gap-3">
          <div className="min-w-0">
            {title && <h2 className="text-[15px] font-semibold text-ink">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-ink-3">{description}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
    </div>
  );
}

export function CardContent({ children, className = '' }: CardProps) {
  return <div className={`px-5 py-5 sm:px-6 ${className}`}>{children}</div>;
}
