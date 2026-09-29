'use client';

import React from 'react';

interface SegmentedProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: ReadonlyArray<{ value: T; label: React.ReactNode; count?: number }>;
  className?: string;
  /** true のとき親の幅いっぱいに均等配置する */
  block?: boolean;
  label?: string;
}

/** iOS 風のセグメントコントロール。少数の排他的な選択肢（フィルタ・タブ）に使う */
export function Segmented<T extends string>({ value, onChange, options, className = '', block = false, label }: SegmentedProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className={`scrollbar-none inline-flex h-11 max-w-full items-center gap-0.5 overflow-x-auto rounded-full bg-fill/[0.12] p-1 sm:h-10 ${
        block ? 'flex w-full' : ''
      } ${className}`}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={`inline-flex h-full shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[14px] font-medium transition-all duration-200 ease-fluid sm:text-[13px] ${
              block ? 'flex-1' : ''
            } ${active ? 'bg-surface text-ink shadow-[0_1px_3px_rgb(0_0_0/0.12)]' : 'text-ink-2 hover:text-ink'}`}
          >
            {opt.label}
            {opt.count !== undefined && opt.count > 0 && (
              <span className={`num rounded-full px-1.5 text-[11px] leading-[18px] ${active ? 'bg-accent text-white' : 'bg-fill/[0.16] text-ink-2'}`}>
                {opt.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
