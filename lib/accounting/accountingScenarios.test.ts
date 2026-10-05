import { describe, expect, it } from 'vitest';
import { buildPL } from './reports';
import { calcDepreciationForYear } from '../tax/depreciation';
import type { FixedAsset, JournalEntry, UserSettings } from '@/types';
const settings = { filingType: 'white', homeOfficeRatio: 20, communicationRatio: 40 } as UserSettings;
const entry = (debitAccount: JournalEntry['debitAccount'], creditAccount: JournalEntry['creditAccount'], amount: number, fiscalMonth = 12) => ({ debitAccount, creditAccount, debitAmount: amount, creditAmount: amount, fiscalYear: 2026, fiscalMonth }) as JournalEntry;
describe('allocation, settlement, depreciation and prepayment regression cases', () => {
  it('full payments plus allocation produce 288,000 yen annually', () => {
    const journals = Array.from({length: 12}, (_, i) => [entry('RENT', 'BANK', 100000, i + 1), entry('COMMUNICATION', 'BANK', 10000, i + 1)]).flat();
    expect(buildPL(journals, 2026, settings).totalExpenses).toBe(288000);
  });
  it('withheld tax is not an expense and gross sales are retained', () => {
    const journals = [entry('ACCOUNTS_RECEIVABLE', 'SALES', 110000), entry('BANK', 'ACCOUNTS_RECEIVABLE', 99790), entry('OWNER_DRAWS', 'ACCOUNTS_RECEIVABLE', 10210)];
    const pl = buildPL(journals, 2026, settings);
    expect(pl.sales).toBe(110000);
    expect(pl.totalExpenses).toBe(0);
  });
  it('July purchase and use reproduce the explicitly scoped ordinary depreciation', () => {
    const asset: FixedAsset = { id: 'fictional-pc', name: '架空のPC', acquiredOn: '2026-07-01', acquisitionCost: 240000, usefulLifeYears: 4, method: 'straight_line', businessUseRatio: 100, accumulatedDepreciation: 0, isDisposed: false };
    const whole = calcDepreciationForYear(2026, [asset], true).items[0];
    expect(whole.deductibleAmount).toBe(30000);
    expect(whole.bookValueAfter).toBe(210000);
    const business = calcDepreciationForYear(2026, [{...asset, businessUseRatio: 80}], true).items[0];
    expect(business.deductibleAmount).toBe(24000);
    expect(business.bookValueAfter).toBe(168000);
  });
  it('an initial prepaid payment is excluded from current expenses', () => {
    const journals = [entry('ACCOUNTS_RECEIVABLE', 'SALES', 120000), entry('MISC_EXPENSE', 'ACCRUED_EXPENSES', 15000), entry('PREPAID_EXPENSE', 'BANK', 90000)];
    const pl = buildPL(journals, 2026, settings);
    expect(pl.sales).toBe(120000);
    expect(pl.totalExpenses).toBe(15000);
  });
});
