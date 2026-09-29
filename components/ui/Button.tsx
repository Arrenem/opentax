'use client';

import React from 'react';
import Link from 'next/link';
import { Icon, type IconName } from './Icon';

export type ButtonVariant = 'primary' | 'accent' | 'positive' | 'secondary' | 'ghost' | 'danger' | 'danger-tinted';
export type ButtonSize = 'sm' | 'md' | 'lg';

const BASE =
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full font-medium select-none ' +
  'transition-[background-color,color,transform,box-shadow] duration-200 ease-fluid active:scale-[0.97] ' +
  'disabled:opacity-40 disabled:pointer-events-none';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-ink text-white hover:bg-ink/85 shadow-control',
  accent: 'bg-accent text-white hover:bg-accent/90 shadow-control',
  positive: 'bg-positive text-white hover:bg-positive/90 shadow-control',
  secondary: 'bg-fill/[0.12] text-ink hover:bg-fill/[0.2]',
  ghost: 'text-ink-2 hover:bg-fill/[0.1] hover:text-ink',
  danger: 'bg-negative text-white hover:bg-negative/90 shadow-control',
  'danger-tinted': 'bg-negative/10 text-negative hover:bg-negative/15',
};

// モバイルは 44px のタップ領域を確保し、デスクトップでは少し詰める
const SIZES: Record<ButtonSize, string> = {
  sm: 'h-9 px-3.5 text-[13px]',
  md: 'h-11 px-5 text-[15px] sm:h-10 sm:text-sm',
  lg: 'h-12 px-6 text-base',
};

export function buttonClass(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', extra = '') {
  return `${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${extra}`;
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: IconName;
  block?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  block = false,
  className = '',
  disabled,
  children,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClass(variant, size, `${block ? 'w-full' : ''} ${className}`)}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Spinner /> : icon ? <Icon name={icon} size={size === 'sm' ? 16 : 18} strokeWidth={2} /> : null}
      {children}
    </button>
  );
}

interface ButtonLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  block?: boolean;
}

export function ButtonLink({
  href,
  variant = 'primary',
  size = 'md',
  icon,
  block = false,
  className = '',
  children,
  ...props
}: ButtonLinkProps) {
  return (
    <Link href={href} className={buttonClass(variant, size, `${block ? 'w-full' : ''} ${className}`)} {...props}>
      {icon && <Icon name={icon} size={size === 'sm' ? 16 : 18} strokeWidth={2} />}
      {children}
    </Link>
  );
}

/** アイコンだけの丸ボタン（閉じる・その他メニュー等） */
export function IconButton({
  icon,
  label,
  className = '',
  size = 36,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName; label: string; size?: number }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`inline-flex items-center justify-center rounded-full text-ink-2 bg-fill/[0.1] hover:bg-fill/[0.18] hover:text-ink transition-colors active:scale-95 ${className}`}
      style={{ width: size, height: size }}
      {...props}
    >
      <Icon name={icon} size={Math.round(size * 0.5)} strokeWidth={2} />
    </button>
  );
}

function Spinner() {
  return <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent opacity-80" />;
}
