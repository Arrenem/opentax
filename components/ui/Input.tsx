'use client';

import React, { useId } from 'react';
import { Icon } from './Icon';

// 入力系はすべて同じ高さ・角丸・フォーカス表現に揃える。
// iOS のズームを避けるため、モバイルでは 16px のフォントを使う。
export const CONTROL_CLASS =
  'block w-full h-11 sm:h-10 rounded-control border border-line/[0.12] bg-surface px-3.5 text-base sm:text-sm text-ink ' +
  'placeholder:text-ink-3 shadow-control transition-[border-color,box-shadow] duration-200 ' +
  'focus:outline-none focus:border-accent/60 focus:ring-4 focus:ring-accent/15 ' +
  'disabled:bg-fill/[0.06] disabled:text-ink-3';

interface FieldProps {
  label?: string;
  hint?: string;
  error?: string;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}

export function Field({ label, hint, error, htmlFor, className = '', children }: FieldProps) {
  return (
    <div className={`min-w-0 ${className}`}>
      {label && (
        <label htmlFor={htmlFor} className="mb-1.5 block text-[13px] font-medium text-ink-2">
          {label}
        </label>
      )}
      {children}
      {error ? (
        <p className="mt-1.5 text-xs text-negative">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-ink-3">{hint}</p>
      ) : null}
    </div>
  );
}

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  /** 外側（Field）に付けるクラス。グリッドの col-span などに使う */
  wrapperClassName?: string;
}

export function Input({ label, hint, error, className = '', wrapperClassName = '', id, ...props }: InputProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <Field label={label} hint={hint} error={error} htmlFor={inputId} className={wrapperClassName}>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        className={`${CONTROL_CLASS} ${error ? 'border-negative/60 focus:ring-negative/15' : ''} ${
          props.type === 'number' ? 'num' : ''
        } ${className}`}
        {...props}
      />
    </Field>
  );
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  error?: string;
  options: Array<{ value: string; label: string }>;
  wrapperClassName?: string;
}

export function Select({ label, hint, error, options, className = '', wrapperClassName = '', id, ...props }: SelectProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <Field label={label} hint={hint} error={error} htmlFor={inputId} className={wrapperClassName}>
      <div className={`relative ${className}`}>
        <select
          id={inputId}
          className={`${CONTROL_CLASS} appearance-none truncate pr-9 ${error ? 'border-negative/60' : ''}`}
          {...props}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <Icon
          name="chevronDown"
          size={16}
          strokeWidth={2}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-3"
        />
      </div>
    </Field>
  );
}

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
  wrapperClassName?: string;
}

export function Textarea({ label, hint, error, className = '', wrapperClassName = '', id, ...props }: TextareaProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <Field label={label} hint={hint} error={error} htmlFor={inputId} className={wrapperClassName}>
      <textarea
        id={inputId}
        className={`${CONTROL_CLASS} h-auto min-h-[88px] py-2.5 leading-relaxed ${className}`}
        {...props}
      />
    </Field>
  );
}

interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: React.ReactNode;
  description?: string;
}

/** 行全体がタップ対象になるチェックボックス */
export function Checkbox({ label, description, className = '', ...props }: CheckboxProps) {
  return (
    <label className={`flex min-h-[44px] cursor-pointer items-start gap-3 py-2 sm:min-h-0 ${className}`}>
      <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 rounded-md accent-accent" {...props} />
      <span className="min-w-0">
        <span className="block text-[15px] sm:text-sm text-ink">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-ink-3">{description}</span>}
      </span>
    </label>
  );
}
