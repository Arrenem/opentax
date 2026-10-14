import React from 'react';

export type BadgeTone = 'green' | 'yellow' | 'red' | 'blue' | 'gray';

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeTone;
  dot?: boolean;
  className?: string;
}

const TONES: Record<BadgeTone, { chip: string; dot: string }> = {
  green: { chip: 'bg-positive/10 text-positive', dot: 'bg-positive' },
  yellow: { chip: 'bg-warning/10 text-warning', dot: 'bg-warning' },
  red: { chip: 'bg-negative/10 text-negative', dot: 'bg-negative' },
  blue: { chip: 'bg-accent/10 text-accent', dot: 'bg-accent' },
  gray: { chip: 'bg-fill/[0.12] text-ink-2', dot: 'bg-ink-3' },
};

export function Badge({ children, variant = 'gray', dot = false, className = '' }: BadgeProps) {
  const tone = TONES[variant];
  return (
    <span
      className={`inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-medium ${tone.chip} ${className}`}
    >
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />}
      {children}
    </span>
  );
}
