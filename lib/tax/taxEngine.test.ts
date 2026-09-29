import { describe, expect, it } from 'vitest';
import { getBasicDeduction, getMaxBlueFormDeduction, applyBlueFormDeduction } from './taxYearRules';
import { calcIncomeTaxFromTaxable, calcIncomeTaxReturn } from './incomeTax';
import { calcAllDeductions, calcLifeInsuranceDeduction, calcSpouseDeduction } from './deductions';
import { calcConsumptionTaxReturn } from './consumptionReturn';
import { calcDepreciationForYear } from './depreciation';
import { calcLocalTaxEstimate } from './localTax';
import { DEFAULT_DEDUCTIONS } from '@/types';
import type { JournalEntry } from '@/types';

function ts(date: string): JournalEntry['transactionDate'] {
  return { toDate: () => new Date(date) } as JournalEntry['transactionDate'];
}

describe('基礎控除', () => {
  it('令和7年分は合計所得132万円以下で95万円', () => {
    expect(getBasicDeduction(2025, 1_000_000)).toBe(950_000);
  });
  it('令和7年分は655万円超で58万円', () => {
    expect(getBasicDeduction(2025, 7_000_000)).toBe(580_000);
  });
  it('令和8年分は489万円以下で104万円', () => {
    expect(getBasicDeduction(2026, 4_000_000)).toBe(1_040_000);
  });
  it('令和8年分は655万円超2,350万円以下で62万円', () => {
    expect(getBasicDeduction(2026, 7_000_000)).toBe(620_000);
  });
  it('高所得者は逓減する', () => {
    expect(getBasicDeduction(2026, 24_200_000)).toBe(320_000);
    expect(getBasicDeduction(2026, 26_000_000)).toBe(0);
  });
});

describe('青色申告特別控除', () => {
  it('令和8年分はe-Tax+複式で65万円', () => {
    const r = getMaxBlueFormDeduction(2026, {
      filingType: 'blue',
      eTaxFiling: true,
      excellentElectronicBooks: false,
    });
    expect(r.amount).toBe(650_000);
  });
  it('令和9年分は優良電子帳簿+e-Taxで75万円', () => {
    const r = getMaxBlueFormDeduction(2027, {
      filingType: 'blue',
      eTaxFiling: true,
      excellentElectronicBooks: true,
    });
    expect(r.amount).toBe(750_000);
  });
  it('令和9年分の書面は10万円', () => {
    const r = getMaxBlueFormDeduction(2027, {
      filingType: 'blue',
      eTaxFiling: false,
      excellentElectronicBooks: false,
    });
    expect(r.amount).toBe(100_000);
  });
  it('所得が控除額未満なら所得を上限にする', () => {
    expect(applyBlueFormDeduction(400_000, 650_000)).toBe(400_000);
    expect(applyBlueFormDeduction(-10, 650_000)).toBe(0);
  });
});

describe('所得税', () => {
  it('課税所得195万円以下は5%', () => {
    expect(calcIncomeTaxFromTaxable(1_950_000)).toEqual({ incomeTax: 97_500, bracketRate: 0.05 });
  });
  it('千円未満切捨てと復興税2.1%を含む', () => {
    const result = calcIncomeTaxReturn({
      fiscalYear: 2026,
      businessIncome: 4_000_000,
      deductions: { ...DEFAULT_DEDUCTIONS },
    });
    expect(result.taxableIncome % 1000).toBe(0);
    expect(result.reconstructionTax).toBe(Math.floor(result.incomeTax * 0.021));
    expect(result.deductions.basic).toBe(1_040_000);
  });
});

describe('所得控除', () => {
  it('新生命保険料控除は上限4万円×3種類で12万円', () => {
    expect(
      calcLifeInsuranceDeduction({
        ...DEFAULT_DEDUCTIONS,
        lifeInsuranceGeneralPaid: 100_000,
        lifeInsuranceMedicalPaid: 100_000,
        lifeInsurancePensionPaid: 100_000,
      })
    ).toBe(120_000);
  });
  it('令和7年以後の配偶者控除は所得58万円以下', () => {
    expect(calcSpouseDeduction(2026, 5_000_000, true, 580_000, false)).toBe(380_000);
    expect(calcSpouseDeduction(2026, 5_000_000, true, 580_001, false)).toBe(380_000);
  });
  it('基礎控除を含む合計が計算される', () => {
    const d = calcAllDeductions(2026, 3_000_000, {
      ...DEFAULT_DEDUCTIONS,
      socialInsurance: 400_000,
    });
    expect(d.socialInsurance).toBe(400_000);
    expect(d.basic).toBe(1_040_000);
    expect(d.total).toBe(1_440_000);
  });
});

describe('消費税', () => {
  const sales: JournalEntry = {
    id: '1',
    entryNumber: 1,
    version: 1,
    isCurrent: true,
    isDeleted: false,
    transactionDate: ts('2026-06-01'),
    fiscalYear: 2026,
    fiscalMonth: 6,
    debitAccount: 'BANK',
    debitAmount: 1_100_000,
    creditAccount: 'SALES',
    creditAmount: 1_100_000,
    counterparty: 'A',
    description: '売上',
    taxType: 'standard10',
    taxAmount: 100_000,
    taxIncluded: true,
    isQualifiedInvoice: true,
    sourceType: 'invoice',
    status: 'confirmed',
    createdAt: ts('2026-06-01'),
    createdBy: 't',
    updatedAt: ts('2026-06-01'),
    updatedBy: 't',
  };

  it('2割特例は売上税額の概ね2割', () => {
    const r = calcConsumptionTaxReturn({
      fiscalYear: 2026,
      journals: [sales],
      method: 'special20pct',
      consumptionTaxStatus: 'taxable',
    });
    expect(r.method).toBe('special20pct');
    expect(r.totalPayable).toBeGreaterThan(0);
    expect(r.nationalTax).toBe(Math.floor(r.salesNationalTax * 0.2) || r.nationalTax);
  });

  it('令和9年分に2割特例を指定すると3割特例へフォールバック', () => {
    const r = calcConsumptionTaxReturn({
      fiscalYear: 2027,
      journals: [{ ...sales, fiscalYear: 2027 }],
      method: 'special20pct',
      consumptionTaxStatus: 'taxable',
    });
    expect(r.method).toBe('special30pct');
  });

  it('免税事業者は0円', () => {
    const r = calcConsumptionTaxReturn({
      fiscalYear: 2026,
      journals: [sales],
      method: 'standard',
      consumptionTaxStatus: 'exempt',
    });
    expect(r.totalPayable).toBe(0);
  });
});

describe('減価償却', () => {
  it('4年定額法・年央取得は月割', () => {
    const r = calcDepreciationForYear(
      2025,
      [
        {
          id: 'pc',
          name: 'PC',
          acquiredOn: '2025-02-05',
          acquisitionCost: 165_000,
          usefulLifeYears: 4,
          method: 'straight_line',
          businessUseRatio: 100,
          accumulatedDepreciation: 0,
          isDisposed: false,
        },
      ],
      true
    );
    expect(r.totalDeductible).toBeGreaterThan(0);
    expect(r.totalDeductible).toBeLessThan(165_000);
  });

  it('少額特例は取得年に全額', () => {
    const r = calcDepreciationForYear(
      2026,
      [
        {
          id: 'chair',
          name: '椅子',
          acquiredOn: '2026-04-01',
          acquisitionCost: 80_000,
          usefulLifeYears: 8,
          method: 'immediate',
          businessUseRatio: 100,
          accumulatedDepreciation: 0,
          isDisposed: false,
        },
      ],
      true
    );
    expect(r.items[0].deductibleAmount).toBe(80_000);
  });
});

describe('個人事業税', () => {
  it('事業主控除290万円を差し引く', () => {
    const r = calcLocalTaxEstimate({
      profitBeforeBlueDeduction: 5_000_000,
      incomeDeductionsExcludingBasic: 400_000,
      businessTaxCategory: 1,
    });
    expect(r.businessTaxBase).toBe(2_100_000);
    expect(r.businessTax).toBe(105_000);
  });
});
