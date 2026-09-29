import React from 'react';
import { formatYen } from '@/lib/utils/format';

type Tone = 'default' | 'positive' | 'negative' | 'accent';

const TONES: Record<Tone, string> = {
  default: 'text-ink',
  positive: 'text-positive',
  negative: 'text-negative',
  accent: 'text-accent',
};

/** 数値を大きく見せるタイル。金額（yen）か任意の表示値を受け取る */
export function Stat({
  label,
  value,
  yen,
  sub,
  tone = 'default',
  className = '',
}: {
  label: React.ReactNode;
  value?: React.ReactNode;
  yen?: number;
  sub?: React.ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <div className={`min-w-0 rounded-card border border-line/[0.06] bg-surface p-4 shadow-card sm:p-5 ${className}`}>
      <p className="truncate text-[13px] font-medium text-ink-2">{label}</p>
      <p className={`num mt-1.5 truncate text-[22px] font-semibold leading-tight tracking-tight sm:text-[26px] ${TONES[tone]}`}>
        {yen !== undefined ? formatYen(yen) : value}
      </p>
      {sub && <p className="mt-1 truncate text-xs text-ink-3">{sub}</p>}
    </div>
  );
}

/** 帳票・決算書の1行（ラベルと金額） */
export function StatementRow({
  label,
  amount,
  indent = 0,
  bold = false,
  separator = false,
  prefix = '',
  tone,
}: {
  label: React.ReactNode;
  amount?: number;
  indent?: number;
  bold?: boolean;
  separator?: boolean;
  prefix?: string;
  tone?: Tone;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-4 py-2 ${separator ? 'mt-1 border-t border-line/[0.08] pt-3' : ''} ${
        bold ? 'font-semibold text-ink' : 'text-ink-2'
      }`}
    >
      <span className="min-w-0 text-[15px] sm:text-sm" style={{ paddingLeft: indent * 16 }}>
        {label}
      </span>
      {amount !== undefined && (
        <span className={`num shrink-0 text-[15px] sm:text-sm ${tone ? TONES[tone] : bold ? 'text-ink' : 'text-ink'}`}>
          {prefix}
          {formatYen(amount)}
        </span>
      )}
    </div>
  );
}

/** 決算書のセクション見出し */
export function StatementHeading({ children }: { children: React.ReactNode }) {
  return <p className="mb-1 mt-5 text-xs font-semibold uppercase tracking-wider text-ink-3 first:mt-0">{children}</p>;
}
