import type { DependentInput, DisabilityType, IncomeDeductionInput } from '@/types';
import {
  getBasicDeduction,
  getDependentIncomeThreshold,
  getWorkingStudentIncomeLimit,
} from './taxYearRules';

export interface DeductionBreakdown {
  socialInsurance: number;
  smallEnterpriseMutual: number;
  lifeInsurance: number;
  earthquakeInsurance: number;
  spouse: number;
  dependents: number;
  specificRelativeSpecial: number;
  disability: number;
  widow: number;
  singleParent: number;
  workingStudent: number;
  medical: number;
  donations: number;
  basic: number;
  total: number;
}

function newLifePremiumDeduction(paid: number): number {
  if (paid <= 0) return 0;
  if (paid <= 20_000) return paid;
  if (paid <= 40_000) return Math.floor(paid / 2) + 10_000;
  if (paid <= 80_000) return Math.floor(paid / 4) + 20_000;
  return 40_000;
}

export function calcLifeInsuranceDeduction(input: IncomeDeductionInput): number {
  const general = newLifePremiumDeduction(input.lifeInsuranceGeneralPaid);
  const medical = newLifePremiumDeduction(input.lifeInsuranceMedicalPaid);
  const pension = newLifePremiumDeduction(input.lifeInsurancePensionPaid);
  return Math.min(120_000, general + medical + pension);
}

export function calcEarthquakeInsuranceDeduction(paid: number): number {
  if (paid <= 0) return 0;
  return Math.min(50_000, paid);
}

function taxpayerSpouseBand(taxpayerIncome: number): 0 | 1 | 2 | 3 {
  if (taxpayerIncome > 10_000_000) return 0;
  if (taxpayerIncome > 9_500_000) return 3;
  if (taxpayerIncome > 9_000_000) return 2;
  return 1;
}

function scaleSpouse(base: number, band: 0 | 1 | 2 | 3): number {
  if (band === 0) return 0;
  if (band === 1) return base;
  if (band === 2) return Math.round(base * (26 / 38));
  return Math.round(base * (13 / 38));
}

/**
 * 配偶者控除 / 配偶者特別控除（令和7年分以後の所得要件58万円）。
 */
export function calcSpouseDeduction(
  fiscalYear: number,
  taxpayerIncome: number,
  hasSpouse: boolean,
  spouseIncome: number,
  spouseIsElderly: boolean
): number {
  if (!hasSpouse) return 0;
  const band = taxpayerSpouseBand(taxpayerIncome);
  if (band === 0) return 0;

  const threshold = getDependentIncomeThreshold(fiscalYear);
  if (spouseIncome <= threshold) {
    const base = spouseIsElderly ? 480_000 : 380_000;
    return scaleSpouse(base, band);
  }

  // 配偶者特別控除: 控除対象配偶者の所得上限超〜133万円以下
  if (spouseIncome > 1_330_000) return 0;

  const table: Array<[number, number]> = [
    [950_000, 380_000],
    [1_000_000, 360_000],
    [1_050_000, 310_000],
    [1_100_000, 260_000],
    [1_150_000, 210_000],
    [1_200_000, 160_000],
    [1_250_000, 110_000],
    [1_300_000, 60_000],
    [1_330_000, 30_000],
  ];
  const found = table.find(([limit]) => spouseIncome <= limit);
  return scaleSpouse(found?.[1] ?? 0, band);
}

function specificRelativeSpecialAmount(income: number, threshold: number): number {
  if (income <= threshold) return 0;
  if (income <= 850_000) return 630_000;
  if (income <= 900_000) return 610_000;
  if (income <= 950_000) return 510_000;
  if (income <= 1_000_000) return 410_000;
  if (income <= 1_050_000) return 310_000;
  if (income <= 1_100_000) return 210_000;
  if (income <= 1_150_000) return 110_000;
  if (income <= 1_200_000) return 60_000;
  if (income <= 1_230_000) return 30_000;
  return 0;
}

export function calcDependentDeductions(
  fiscalYear: number,
  dependents: DependentInput[]
): { dependents: number; specificRelativeSpecial: number } {
  const threshold = getDependentIncomeThreshold(fiscalYear);
  let dependentsAmt = 0;
  let specificRelativeSpecial = 0;

  for (const d of dependents) {
    if (d.type === 'specific_special') {
      if (fiscalYear >= 2025) {
        specificRelativeSpecial += specificRelativeSpecialAmount(d.income, threshold);
      }
      continue;
    }
    if (d.income > threshold) continue;
    if (d.type === 'general') dependentsAmt += 380_000;
    else if (d.type === 'specific') dependentsAmt += 630_000;
    else if (d.type === 'elderly') dependentsAmt += 480_000;
    else if (d.type === 'elderly_livein') dependentsAmt += 580_000;
  }

  return { dependents: dependentsAmt, specificRelativeSpecial };
}

export function calcDisabilityDeduction(type: DisabilityType): number {
  if (type === 'ordinary') return 270_000;
  if (type === 'special') return 400_000;
  if (type === 'special_livein') return 750_000;
  return 0;
}

export function calcMedicalDeduction(
  medicalExpenses: number,
  reimbursed: number,
  totalIncome: number
): number {
  const net = Math.max(0, medicalExpenses - reimbursed);
  if (net <= 0) return 0;
  const floor = Math.min(100_000, Math.floor(totalIncome * 0.05));
  const deductible = net - floor;
  if (deductible <= 0) return 0;
  return Math.min(2_000_000, deductible);
}

export function calcDonationDeduction(donations: number, totalIncome: number): number {
  if (donations <= 2_000) return 0;
  const cap = Math.floor(totalIncome * 0.4);
  return Math.min(cap, donations - 2_000);
}

export function calcAllDeductions(
  fiscalYear: number,
  totalIncome: number,
  input: IncomeDeductionInput
): DeductionBreakdown {
  const socialInsurance = Math.max(0, Math.floor(input.socialInsurance));
  const smallEnterpriseMutual = Math.max(0, Math.floor(input.smallEnterpriseMutual));
  const lifeInsurance = calcLifeInsuranceDeduction(input);
  const earthquakeInsurance = calcEarthquakeInsuranceDeduction(input.earthquakeInsurancePaid);
  const spouse = calcSpouseDeduction(
    fiscalYear,
    totalIncome,
    input.hasSpouse,
    input.spouseIncome,
    input.spouseIsElderly
  );
  const dep = calcDependentDeductions(fiscalYear, input.dependents);
  const disability = calcDisabilityDeduction(input.disability);
  const singleParent =
    input.isSingleParent && totalIncome <= 5_000_000 ? 350_000 : 0;
  const widow =
    !input.isSingleParent && input.isWidow && totalIncome <= 5_000_000 ? 270_000 : 0;
  const workingStudent =
    input.isWorkingStudent && totalIncome <= getWorkingStudentIncomeLimit(fiscalYear)
      ? 270_000
      : 0;
  const medical = calcMedicalDeduction(
    input.medicalExpenses,
    input.medicalInsuranceReimburse,
    totalIncome
  );
  const donations = calcDonationDeduction(input.donations, totalIncome);
  const basic = getBasicDeduction(fiscalYear, totalIncome);

  const total =
    socialInsurance +
    smallEnterpriseMutual +
    lifeInsurance +
    earthquakeInsurance +
    spouse +
    dep.dependents +
    dep.specificRelativeSpecial +
    disability +
    widow +
    singleParent +
    workingStudent +
    medical +
    donations +
    basic;

  return {
    socialInsurance,
    smallEnterpriseMutual,
    lifeInsurance,
    earthquakeInsurance,
    spouse,
    dependents: dep.dependents,
    specificRelativeSpecial: dep.specificRelativeSpecial,
    disability,
    widow,
    singleParent,
    workingStudent,
    medical,
    donations,
    basic,
    total,
  };
}

export const DEDUCTION_LABELS: Record<keyof DeductionBreakdown, string> = {
  socialInsurance: '社会保険料控除',
  smallEnterpriseMutual: '小規模企業共済等掛金控除',
  lifeInsurance: '生命保険料控除',
  earthquakeInsurance: '地震保険料控除',
  spouse: '配偶者（特別）控除',
  dependents: '扶養控除',
  specificRelativeSpecial: '特定親族特別控除',
  disability: '障害者控除',
  widow: '寡婦控除',
  singleParent: 'ひとり親控除',
  workingStudent: '勤労学生控除',
  medical: '医療費控除',
  donations: '寄附金控除',
  basic: '基礎控除',
  total: '所得控除合計',
};
