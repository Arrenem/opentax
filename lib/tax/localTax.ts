import {
  BUSINESS_TAX_OWNER_DEDUCTION,
  BUSINESS_TAX_RATES,
  RESIDENT_TAX_BASIC_DEDUCTION,
  RESIDENT_TAX_INCOME_RATE,
  RESIDENT_TAX_PER_CAPITA,
} from './taxYearRules';

export interface LocalTaxEstimate {
  businessTaxBase: number;
  businessTax: number;
  residentTaxableIncome: number;
  residentIncomeTax: number;
  residentPerCapita: number;
  residentTax: number;
  notes: string[];
}

/**
 * 個人事業税・住民税の概算。
 * 事業税は青色申告特別控除を差し引く前の所得が対象。
 * 住民税の基礎控除は43万円（所得税の基礎控除改正の対象外）。
 */
export function calcLocalTaxEstimate(params: {
  profitBeforeBlueDeduction: number;
  incomeDeductionsExcludingBasic: number;
  businessTaxCategory: 1 | 2 | 3;
}): LocalTaxEstimate {
  const notes: string[] = [
    '住民税・事業税は翌年度課税の概算です。市区町村・都道府県の条例により差があります。',
    '個人事業税は青色申告特別控除を適用する前の事業所得から事業主控除290万円を差し引きます。',
  ];

  const businessTaxBase = Math.max(
    0,
    params.profitBeforeBlueDeduction - BUSINESS_TAX_OWNER_DEDUCTION
  );
  const rate = BUSINESS_TAX_RATES[params.businessTaxCategory];
  const businessTax = Math.floor(businessTaxBase * rate);

  const residentTaxableIncome = Math.max(
    0,
    Math.floor(
      (params.profitBeforeBlueDeduction - params.incomeDeductionsExcludingBasic - RESIDENT_TAX_BASIC_DEDUCTION) /
        1000
    ) * 1000
  );
  const residentIncomeTax = Math.floor(residentTaxableIncome * RESIDENT_TAX_INCOME_RATE);
  const residentPerCapita = RESIDENT_TAX_PER_CAPITA;
  const residentTax = residentIncomeTax + residentPerCapita;

  return {
    businessTaxBase,
    businessTax,
    residentTaxableIncome,
    residentIncomeTax,
    residentPerCapita,
    residentTax,
    notes,
  };
}
