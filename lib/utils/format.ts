export function formatYen(amount: number): string {
  const sign = amount < 0 ? '−' : '';
  return `${sign}¥${new Intl.NumberFormat('ja-JP').format(Math.abs(Math.round(amount)))}`;
}

export function formatYenPlain(amount: number): string {
  return new Intl.NumberFormat('ja-JP').format(Math.round(amount));
}

export function floorToThousand(amount: number): number {
  if (amount <= 0) return 0;
  return Math.floor(amount / 1000) * 1000;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function toRatio(percent: number | undefined, fallback = 100): number {
  const value = percent ?? fallback;
  return clamp(value, 0, 100) / 100;
}

export function reiwaYear(gregorianYear: number): number {
  return gregorianYear - 2018;
}

export function fiscalYearLabel(year: number): string {
  return `${year}年分（令和${reiwaYear(year)}年分）`;
}
