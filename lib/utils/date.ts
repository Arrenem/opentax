import { format } from 'date-fns';
import { ja } from 'date-fns/locale';

/** Firestore Timestamp / 復元済みの値 / 文字列のいずれかを Date に変換する */
export function toDate(value: unknown): Date | null {
  if (!value) return null;
  try {
    const maybe = value as { toDate?: () => Date };
    const date = typeof maybe.toDate === 'function' ? maybe.toDate() : new Date(value as string);
    return Number.isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
}

export function formatDate(value: unknown, pattern = 'yyyy/MM/dd'): string {
  const date = toDate(value);
  return date ? format(date, pattern, { locale: ja }) : '—';
}

/** input[type=date] 用の yyyy-MM-dd */
export function toDateInputValue(value: unknown): string {
  const date = toDate(value);
  return date ? format(date, 'yyyy-MM-dd') : '';
}
