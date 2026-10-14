import type { IncomeDeductionInput } from '@/types';
import { floorToThousand } from '@/lib/utils/format';
import { calcAllDeductions, type DeductionBreakdown } from './deductions';
import { INCOME_TAX_BRACKETS, RECONSTRUCTION_TAX_RATE } from './taxYearRules';

export interface IncomeTaxResult {
  fiscalYear: number;
  businessIncome: number;
  otherIncome: number;
  totalIncome: number;
  deductions: DeductionBreakdown;
  taxableIncome: number;
  incomeTax: number;
  reconstructionTax: number;
  incomeAndReconstructionTax: number;
  withholdingTax: number;
  prepaidIncomeTax: number;
  taxDue: number;
  refund: number;
  bracketRate: number;
}

export function calcIncomeTaxFromTaxable(taxableIncome: number): {
  incomeTax: number;
  bracketRate: number;
} {
  const taxable = Math.max(0, taxableIncome);
  const bracket =
    INCOME_TAX_BRACKETS.find((b) => taxable <= b.limit) ??
    INCOME_TAX_BRACKETS[INCOME_TAX_BRACKETS.length - 1];
  const incomeTax = Math.floor(taxable * bracket.rate - bracket.deduction);
  return { incomeTax: Math.max(0, incomeTax), bracketRate: bracket.rate };
}

export function calcIncomeTaxReturn(params: {
  fiscalYear: number;
  businessIncome: number;
  otherIncome?: number;
  deductions: IncomeDeductionInput;
}): IncomeTaxResult {
  const businessIncome = Math.max(0, Math.floor(params.businessIncome));
  const otherIncome = Math.max(0, Math.floor(params.otherIncome ?? 0));
  const totalIncome = businessIncome + otherIncome;

  const deductions = calcAllDeductions(params.fiscalYear, totalIncome, params.deductions);
  const taxableIncome = floorToThousand(Math.max(0, totalIncome - deductions.total));
  const { incomeTax, bracketRate } = calcIncomeTaxFromTaxable(taxableIncome);
  const reconstructionTax = Math.floor(incomeTax * RECONSTRUCTION_TAX_RATE);
  const incomeAndReconstructionTax = incomeTax + reconstructionTax;
  const withholdingTax = Math.max(0, Math.floor(params.deductions.withholdingTax));
  const prepaidIncomeTax = Math.max(0, Math.floor(params.deductions.prepaidIncomeTax));
  const net = incomeAndReconstructionTax - withholdingTax - prepaidIncomeTax;

  return {
    fiscalYear: params.fiscalYear,
    businessIncome,
    otherIncome,
    totalIncome,
    deductions,
    taxableIncome,
    incomeTax,
    reconstructionTax,
    incomeAndReconstructionTax,
    withholdingTax,
    prepaidIncomeTax,
    taxDue: Math.max(0, net),
    refund: Math.max(0, -net),
    bracketRate,
  };
}
