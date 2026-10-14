/** 与えられた年と現在年を含む連続した年の配列を降順で返す */
export function yearRange(years: unknown[], currentYear = new Date().getFullYear()): number[] {
  const valid = years.filter((y): y is number => Number.isInteger(y));
  const from = Math.min(currentYear, ...valid);
  const to = Math.max(currentYear, ...valid);
  return Array.from({ length: to - from + 1 }, (_, i) => to - i);
}
