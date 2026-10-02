import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildPL, buildMonthlySummaries } from './reports';
import type { AccountCode, JournalEntry, UserSettings } from '@/types';

const examples = JSON.parse(readFileSync('content/articles/examples-howto-a.json', 'utf8'));
const accounts: Record<string, AccountCode> = {
  現金: 'CASH', 普通預金: 'BANK', 売掛金: 'ACCOUNTS_RECEIVABLE',
  消耗品費: 'SUPPLIES', 売上: 'SALES', 通信費: 'COMMUNICATION',
  未払金: 'ACCRUED_EXPENSES', 事業主借: 'OWNER_CONTRIBUTIONS',
  事業主貸: 'OWNER_DRAWS', 旅費交通費: 'TRAVEL', 地代家賃: 'RENT',
};
const settings = { filingType: 'white', eTaxFiling: false, excellentElectronicBooks: false } as UserSettings;
describe('public article examples through the actual OpenTax aggregation code', () => {
  for (const id of ['41', '42', '43', '44', '47', '48']) {
    it('reproduces article ' + id + ' without real account data or network access', () => {
      const example = examples.find((item: { articleId: string }) => item.articleId === id);
      const journals = example.expectedEntries.map((entry: { debit: string; credit: string; amount: number }) => {
        expect(accounts[entry.debit]).toBeDefined();
        expect(accounts[entry.credit]).toBeDefined();
        return {
          debitAccount: accounts[entry.debit], creditAccount: accounts[entry.credit],
          debitAmount: entry.amount, creditAmount: entry.amount, fiscalYear: 2026, fiscalMonth: 9,
        } as JournalEntry;
      });
      const pl = buildPL(journals, 2026, settings);
      const expected = example.verification;
      if (expected.revenue !== undefined) expect(pl.sales).toBe(expected.revenue);
      if (expected.expenses !== undefined) expect(pl.totalExpenses).toBe(expected.expenses);
      if (expected.newExpenses !== undefined) expect(pl.totalExpenses).toBe(expected.newExpenses);
      if (expected.profit !== undefined) expect(pl.grossProfit).toBe(expected.profit);
      const monthly = buildMonthlySummaries(journals, 2026, settings);
      expect(monthly.find((month) => month.month === 9)?.expenses).toBe(pl.totalExpenses);
    });
  }
});
