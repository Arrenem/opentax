import { describe, expect, it } from 'vitest';
import { buildPL, buildMonthlySummaries } from './reports';
import { aggregationScenarios } from './aggregationFixtures';
import type { JournalEntry, UserSettings } from '@/types';

const settings = { filingType: 'white', eTaxFiling: false, excellentElectronicBooks: false } as UserSettings;

describe('synthetic journal aggregation regression cases', () => {
  for (const scenario of aggregationScenarios) {
    it(scenario.name, () => {
      const journals = scenario.entries.map(({ debitAccount, creditAccount, amount }) => ({
        debitAccount, creditAccount,
        debitAmount: amount, creditAmount: amount, fiscalYear: 2026, fiscalMonth: 9,
      } as JournalEntry));
      const pl = buildPL(journals, 2026, settings);
      const expected = scenario.expected;
      if (expected.sales !== undefined) expect(pl.sales).toBe(expected.sales);
      expect(pl.totalExpenses).toBe(expected.totalExpenses);
      if (expected.grossProfit !== undefined) expect(pl.grossProfit).toBe(expected.grossProfit);
      const monthly = buildMonthlySummaries(journals, 2026, settings);
      expect(monthly.find((month) => month.month === 9)?.expenses).toBe(pl.totalExpenses);
    });
  }
});
