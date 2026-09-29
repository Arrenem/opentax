import { isSpecial20PctYear, isSpecial30PctYear } from '@/lib/tax/taxYearRules';

// 経過措置・特例期間の日付設定（マジックナンバー禁止 — ここだけで管理）

export const TAX_PERIOD_CONFIG = {
  // 免税事業者仕入の経過措置（取引日ベース）
  EXEMPT_80PCT_END: new Date('2026-09-30'),
  EXEMPT_50PCT_END: new Date('2029-09-30'),

  // 2割特例は「令和8年9月30日を含む課税期間」まで。
  // 個人事業者の課税期間は暦年のため 2026年1/1〜12/31 が最後。
  SPECIAL_20PCT_END: new Date('2026-09-30'),

  // 少額特例（1万円未満はインボイス不要）
  SMALL_AMOUNT_END: new Date('2029-09-30'),
  SMALL_AMOUNT_THRESHOLD: 10000,
} as const;

/**
 * 取引日に応じた免税事業者仕入の控除率を返す
 */
export function getExemptSellerRatio(transactionDate: Date): 80 | 50 | 0 {
  if (transactionDate <= TAX_PERIOD_CONFIG.EXEMPT_80PCT_END) return 80;
  if (transactionDate <= TAX_PERIOD_CONFIG.EXEMPT_50PCT_END) return 50;
  return 0;
}

/**
 * 2割特例が適用可能か（個人・暦年課税期間）。
 * 取引日ではなく年分で判定する。
 */
export function isSpecial20PctApplicable(transactionDate: Date): boolean {
  return isSpecial20PctYear(transactionDate.getFullYear());
}

export function isSpecial30PctApplicable(transactionDate: Date): boolean {
  return isSpecial30PctYear(transactionDate.getFullYear());
}

/**
 * 少額特例（インボイス不要）が適用可能か判定
 */
export function isSmallAmountExempt(transactionDate: Date, amount: number): boolean {
  return (
    transactionDate <= TAX_PERIOD_CONFIG.SMALL_AMOUNT_END &&
    amount < TAX_PERIOD_CONFIG.SMALL_AMOUNT_THRESHOLD
  );
}
