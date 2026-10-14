import type {
  AccountCode,
  BalanceSheet,
  IncomeDeductionInput,
  JournalEntry,
  MonthlySummary,
  ProfitAndLoss,
  UserSettings,
} from '@/types';
import { CHART_OF_ACCOUNTS } from '@/lib/accounting/chartOfAccounts';
import { allocatedExpenseAmount } from '@/lib/tax/allocation';
import { applyBlueFormDeduction, getMaxBlueFormDeduction } from '@/lib/tax/taxYearRules';
import { calcIncomeTaxReturn, type IncomeTaxResult } from '@/lib/tax/incomeTax';
import { calcConsumptionTaxReturn, type ConsumptionTaxReturn } from '@/lib/tax/consumptionReturn';
import { calcLocalTaxEstimate, type LocalTaxEstimate } from '@/lib/tax/localTax';
import { calcDepreciationForYear, type DepreciationSummary } from '@/lib/tax/depreciation';
import type { FixedAsset } from '@/types';

export interface TaxReturnBundle {
  fiscalYear: number;
  pl: ProfitAndLoss;
  bs: BalanceSheet;
  monthly: MonthlySummary[];
  incomeTax: IncomeTaxResult;
  consumptionTax: ConsumptionTaxReturn;
  localTax: LocalTaxEstimate;
  depreciation: DepreciationSummary;
}

function isExpenseCode(code: string): boolean {
  const def = CHART_OF_ACCOUNTS[code as AccountCode];
  return def?.type === 'expense';
}

export function emptyExpenseRecord(): Record<AccountCode, number> {
  return Object.fromEntries(
    Object.keys(CHART_OF_ACCOUNTS).map((k) => [k, 0])
  ) as Record<AccountCode, number>;
}

export function buildPL(
  journals: JournalEntry[],
  fiscalYear: number,
  settings: UserSettings,
  extras?: {
    beginningInventory?: number;
    endingInventory?: number;
    depreciationAmount?: number;
  }
): ProfitAndLoss {
  const expenses = emptyExpenseRecord();
  let sales = 0;
  let otherIncome = 0;

  for (const j of journals) {
    if (j.creditAccount === 'SALES') sales += j.creditAmount;
    else if (j.creditAccount === 'OTHER_INCOME') otherIncome += j.creditAmount;

    if (isExpenseCode(j.debitAccount) && j.debitAccount !== 'PURCHASES' && j.debitAccount !== 'FAMILY_WAGES' && j.debitAccount !== 'DEPRECIATION') {
      expenses[j.debitAccount] += allocatedExpenseAmount(j.debitAccount, j.debitAmount, settings);
    }
    if (j.debitAccount === 'PURCHASES') {
      expenses.PURCHASES += j.debitAmount;
    }
    if (j.debitAccount === 'FAMILY_WAGES') {
      expenses.FAMILY_WAGES += j.debitAmount;
    }
    if (j.debitAccount === 'DEPRECIATION') {
      expenses.DEPRECIATION += j.debitAmount;
    }
  }

  if (extras?.depreciationAmount && extras.depreciationAmount > 0) {
    expenses.DEPRECIATION = Math.max(expenses.DEPRECIATION, extras.depreciationAmount);
  }

  const beginningInventory = extras?.beginningInventory ?? 0;
  const endingInventory = extras?.endingInventory ?? 0;
  const purchases = expenses.PURCHASES;
  const costOfGoodsSold = Math.max(0, beginningInventory + purchases - endingInventory);
  const familyWages = expenses.FAMILY_WAGES;

  const operatingExpenses = Object.entries(expenses).reduce((sum, [code, amount]) => {
    if (code === 'PURCHASES' || code === 'FAMILY_WAGES') return sum;
    return sum + amount;
  }, 0);

  const totalRevenue = sales + otherIncome;
  const totalExpenses = costOfGoodsSold + operatingExpenses + familyWages;
  const grossProfit = totalRevenue - totalExpenses;

  const blue = getMaxBlueFormDeduction(fiscalYear, {
    filingType: settings.filingType,
    eTaxFiling: settings.eTaxFiling,
    excellentElectronicBooks: settings.excellentElectronicBooks,
    doubleEntry: true,
  });
  const blueFormDeduction = applyBlueFormDeduction(grossProfit, blue.amount);
  const netIncome = Math.max(0, grossProfit - blueFormDeduction);

  return {
    fiscalYear,
    sales,
    otherIncome,
    beginningInventory,
    purchases,
    endingInventory,
    costOfGoodsSold,
    totalRevenue,
    expenses,
    totalExpenses,
    familyWages,
    grossProfit,
    blueFormDeduction,
    blueFormDeductionLabel: blue.label,
    netIncome,
  };
}

export function buildBS(journals: JournalEntry[], fiscalYear: number): BalanceSheet {
  const balances: Record<string, number> = {};

  for (const j of journals) {
    const amount = j.debitAmount;
    balances[j.debitAccount] = (balances[j.debitAccount] ?? 0) + amount;
    balances[j.creditAccount] = (balances[j.creditAccount] ?? 0) - amount;
  }

  const current: Record<string, number> = {};
  const fixed: Record<string, number> = {};
  const owner: Record<string, number> = {};
  const liabilityItems: Record<string, number> = {};
  const equityItems: Record<string, number> = {};

  for (const [code, def] of Object.entries(CHART_OF_ACCOUNTS)) {
    const raw = balances[code] ?? 0;
    if (def.type === 'asset') {
      const bal = Math.abs(raw);
      if (def.bsCategory === 'fixed') fixed[code] = bal;
      else if (def.bsCategory === 'owner') owner[code] = bal;
      else current[code] = bal;
    } else if (def.type === 'liability') {
      liabilityItems[code] = Math.abs(raw);
    } else if (def.type === 'equity') {
      equityItems[code] = Math.abs(raw);
    }
  }

  const totalAssets =
    Object.values(current).reduce((a, b) => a + b, 0) +
    Object.values(fixed).reduce((a, b) => a + b, 0) +
    Object.values(owner).reduce((a, b) => a + b, 0);
  const totalLiabilities = Object.values(liabilityItems).reduce((a, b) => a + b, 0);
  const totalEquity = Object.values(equityItems).reduce((a, b) => a + b, 0);

  return {
    fiscalYear,
    asOfDate: new Date(fiscalYear, 11, 31),
    assets: {
      current: current as Record<AccountCode, number>,
      fixed: fixed as Record<AccountCode, number>,
      owner: owner as Record<AccountCode, number>,
      totalAssets,
    },
    liabilities: {
      items: liabilityItems as Record<AccountCode, number>,
      totalLiabilities,
    },
    equity: {
      items: equityItems as Record<AccountCode, number>,
      totalEquity,
    },
    totalLiabilitiesAndEquity: totalLiabilities + totalEquity,
  };
}

export function buildMonthlySummaries(
  journals: JournalEntry[],
  fiscalYear: number,
  settings: UserSettings
): MonthlySummary[] {
  const summaries: Record<number, { revenue: number; expenses: number }> = {};
  for (let m = 1; m <= 12; m++) summaries[m] = { revenue: 0, expenses: 0 };

  for (const j of journals) {
    const month = j.fiscalMonth;
    if (month < 1 || month > 12) continue;
    if (j.creditAccount === 'SALES' || j.creditAccount === 'OTHER_INCOME') {
      summaries[month].revenue += j.creditAmount;
    }
    if (isExpenseCode(j.debitAccount) && j.debitAccount !== 'PURCHASES') {
      summaries[month].expenses += allocatedExpenseAmount(j.debitAccount, j.debitAmount, settings);
    }
  }

  return Object.entries(summaries).map(([month, data]) => ({
    year: fiscalYear,
    month: Number(month),
    revenue: data.revenue,
    expenses: data.expenses,
    profit: data.revenue - data.expenses,
  }));
}

export function buildTaxReturnBundle(params: {
  fiscalYear: number;
  journals: JournalEntry[];
  settings: UserSettings;
  deductions: IncomeDeductionInput;
  assets: FixedAsset[];
  beginningInventory?: number;
  endingInventory?: number;
}): TaxReturnBundle {
  const depreciation = calcDepreciationForYear(
    params.fiscalYear,
    params.assets,
    params.settings.filingType === 'blue'
  );
  const pl = buildPL(params.journals, params.fiscalYear, params.settings, {
    beginningInventory: params.beginningInventory,
    endingInventory: params.endingInventory,
    depreciationAmount: depreciation.totalDeductible,
  });
  const bs = buildBS(params.journals, params.fiscalYear);
  const monthly = buildMonthlySummaries(params.journals, params.fiscalYear, params.settings);
  const incomeTax = calcIncomeTaxReturn({
    fiscalYear: params.fiscalYear,
    businessIncome: pl.netIncome,
    otherIncome: 0,
    deductions: params.deductions,
  });
  const consumptionTax = calcConsumptionTaxReturn({
    fiscalYear: params.fiscalYear,
    journals: params.journals,
    method: params.settings.consumptionTaxMethod,
    simplifiedBusinessType: params.settings.simplifiedBusinessType,
    consumptionTaxStatus: params.settings.consumptionTaxStatus,
  });
  const localTax = calcLocalTaxEstimate({
    profitBeforeBlueDeduction: pl.grossProfit,
    incomeDeductionsExcludingBasic: incomeTax.deductions.total - incomeTax.deductions.basic,
    businessTaxCategory: params.settings.businessTaxCategory,
  });

  return { fiscalYear: params.fiscalYear, pl, bs, monthly, incomeTax, consumptionTax, localTax, depreciation };
}
