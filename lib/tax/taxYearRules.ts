/**
 * 年分ごとの所得税・青色申告・消費税ルール。
 * 出典: 国税庁「令和7年度税制改正による所得税の基礎控除の見直し等について」
 *       財務省「令和8年度税制改正の大綱」
 * 金額はすべて円。
 */

export const INCOME_TAX_BRACKETS = [
  { limit: 1_950_000, rate: 0.05, deduction: 0 },
  { limit: 3_300_000, rate: 0.10, deduction: 97_500 },
  { limit: 6_950_000, rate: 0.20, deduction: 427_500 },
  { limit: 9_000_000, rate: 0.23, deduction: 636_000 },
  { limit: 18_000_000, rate: 0.33, deduction: 1_536_000 },
  { limit: 40_000_000, rate: 0.40, deduction: 2_796_000 },
  { limit: Infinity, rate: 0.45, deduction: 4_796_000 },
] as const;

/** 復興特別所得税（平成25年〜令和19年） */
export const RECONSTRUCTION_TAX_RATE = 0.021;

/** 個人事業税の事業主控除 */
export const BUSINESS_TAX_OWNER_DEDUCTION = 2_900_000;

export const BUSINESS_TAX_RATES: Record<1 | 2 | 3, number> = {
  1: 0.05,
  2: 0.04,
  3: 0.05,
};

/** 住民税所得割（標準税率）・均等割の目安 */
export const RESIDENT_TAX_INCOME_RATE = 0.10;
export const RESIDENT_TAX_PER_CAPITA = 5_000;
export const RESIDENT_TAX_BASIC_DEDUCTION = 430_000;

/** 扶養・配偶者の合計所得要件 */
export function getDependentIncomeThreshold(fiscalYear: number): number {
  return fiscalYear >= 2025 ? 580_000 : 480_000;
}

export function getWorkingStudentIncomeLimit(fiscalYear: number): number {
  return fiscalYear >= 2025 ? 850_000 : 750_000;
}

/**
 * 所得税の基礎控除。
 * 令和6年分以前: 48/32/16/0
 * 令和7年分: 95/88/68/63/58 + 高所得逓減（国税庁）
 * 令和8・9年分: 令和8年度改正により最大104万円（合計所得489万円以下）
 * 令和10年分以後: 本則62万円 + 高所得逓減
 */
export function getBasicDeduction(fiscalYear: number, totalIncome: number): number {
  const highIncomeTaper = (income: number, standard: number): number => {
    if (income <= 23_500_000) return standard;
    if (income <= 24_000_000) return 480_000;
    if (income <= 24_500_000) return 320_000;
    if (income <= 25_000_000) return 160_000;
    return 0;
  };

  if (fiscalYear <= 2024) {
    if (totalIncome <= 24_000_000) return 480_000;
    if (totalIncome <= 24_500_000) return 320_000;
    if (totalIncome <= 25_000_000) return 160_000;
    return 0;
  }

  if (fiscalYear === 2025) {
    let base: number;
    if (totalIncome <= 1_320_000) base = 950_000;
    else if (totalIncome <= 3_360_000) base = 880_000;
    else if (totalIncome <= 4_890_000) base = 680_000;
    else if (totalIncome <= 6_550_000) base = 630_000;
    else base = 580_000;
    return highIncomeTaper(totalIncome, base);
  }

  if (fiscalYear === 2026 || fiscalYear === 2027) {
    let base: number;
    if (totalIncome <= 4_890_000) base = 1_040_000;
    else if (totalIncome <= 6_550_000) base = 670_000;
    else base = 620_000;
    return highIncomeTaper(totalIncome, base);
  }

  return highIncomeTaper(totalIncome, 620_000);
}

export type BlueDeductionTier = 'excellent75' | 'etax65' | 'paper55' | 'simple10' | 'none';

/**
 * 青色申告特別控除の上限。
 * 〜令和8年分: 65万（e-Tax+複式）/ 55万（紙+複式）/ 10万
 * 令和9年分以後: 75万（優良電子帳簿+e-Tax）/ 65万（e-Tax+複式）/ 10万（紙は55万→10万）
 */
export function getMaxBlueFormDeduction(
  fiscalYear: number,
  options: {
    filingType: 'blue' | 'white';
    eTaxFiling: boolean;
    excellentElectronicBooks: boolean;
    doubleEntry?: boolean;
  }
): { amount: number; tier: BlueDeductionTier; label: string } {
  if (options.filingType !== 'blue') {
    return { amount: 0, tier: 'none', label: '白色申告（特別控除なし）' };
  }

  const doubleEntry = options.doubleEntry ?? true;

  if (fiscalYear >= 2027) {
    if (doubleEntry && options.eTaxFiling && options.excellentElectronicBooks) {
      return {
        amount: 750_000,
        tier: 'excellent75',
        label: '75万円（優良な電子帳簿 + e-Tax）',
      };
    }
    if (doubleEntry && options.eTaxFiling) {
      return {
        amount: 650_000,
        tier: 'etax65',
        label: '65万円（複式簿記 + e-Tax）',
      };
    }
    return { amount: 100_000, tier: 'simple10', label: '10万円（書面提出または簡易簿記）' };
  }

  if (doubleEntry && options.eTaxFiling) {
    return { amount: 650_000, tier: 'etax65', label: '65万円（複式簿記 + e-Tax）' };
  }
  if (doubleEntry) {
    return { amount: 550_000, tier: 'paper55', label: '55万円（複式簿記・書面提出）' };
  }
  return { amount: 100_000, tier: 'simple10', label: '10万円（簡易簿記）' };
}

export function applyBlueFormDeduction(profitBefore: number, maxDeduction: number): number {
  if (profitBefore <= 0) return 0;
  return Math.min(maxDeduction, profitBefore);
}

/** 2割特例: 個人は令和5〜8年分（2023〜2026）の課税期間 */
export function isSpecial20PctYear(fiscalYear: number): boolean {
  return fiscalYear >= 2023 && fiscalYear <= 2026;
}

/** 3割特例: 個人のみ令和9・10年分（2027・2028） */
export function isSpecial30PctYear(fiscalYear: number): boolean {
  return fiscalYear === 2027 || fiscalYear === 2028;
}

export function getTaxableBusinessThreshold(): number {
  return 10_000_000;
}

export function filingDeadline(fiscalYear: number): { incomeTax: string; consumptionTax: string } {
  return {
    incomeTax: `${fiscalYear + 1}-03-15`,
    consumptionTax: `${fiscalYear + 1}-03-31`,
  };
}
