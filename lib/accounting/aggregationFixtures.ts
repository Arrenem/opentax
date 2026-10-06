import type { AccountCode } from '@/types';

// Synthetic journal inputs for accounting regression tests. No external content is needed.
export interface AggregationScenario {
  name: string;
  entries: Array<{ debitAccount: AccountCode; creditAccount: AccountCode; amount: number }>;
  expected: { sales?: number; totalExpenses: number; grossProfit?: number };
}

export const aggregationScenarios: AggregationScenario[] = [
  {
    name: 'mixed cash and receivable sales',
    entries: [
      { debitAccount: 'CASH', creditAccount: 'SALES', amount: 30000 },
      { debitAccount: 'SUPPLIES', creditAccount: 'CASH', amount: 2000 },
      { debitAccount: 'ACCOUNTS_RECEIVABLE', creditAccount: 'SALES', amount: 50000 },
      { debitAccount: 'COMMUNICATION', creditAccount: 'ACCRUED_EXPENSES', amount: 3000 },
      { debitAccount: 'SUPPLIES', creditAccount: 'OWNER_CONTRIBUTIONS', amount: 1000 },
    ],
    expected: { sales: 80000, totalExpenses: 6000, grossProfit: 74000 },
  },
  {
    name: 'receivable settlement with expenses',
    entries: [
      { debitAccount: 'ACCOUNTS_RECEIVABLE', creditAccount: 'SALES', amount: 100000 },
      { debitAccount: 'BANK', creditAccount: 'ACCOUNTS_RECEIVABLE', amount: 100000 },
      { debitAccount: 'COMMUNICATION', creditAccount: 'ACCRUED_EXPENSES', amount: 6000 },
      { debitAccount: 'SUPPLIES', creditAccount: 'OWNER_CONTRIBUTIONS', amount: 2000 },
    ],
    expected: { sales: 100000, totalExpenses: 8000, grossProfit: 92000 },
  },
  {
    name: 'mixed expenses and receivable settlement',
    entries: [
      { debitAccount: 'ACCOUNTS_RECEIVABLE', creditAccount: 'SALES', amount: 40000 },
      { debitAccount: 'SUPPLIES', creditAccount: 'CASH', amount: 1500 },
      { debitAccount: 'BANK', creditAccount: 'ACCOUNTS_RECEIVABLE', amount: 40000 },
      { debitAccount: 'TRAVEL', creditAccount: 'OWNER_CONTRIBUTIONS', amount: 800 },
      { debitAccount: 'COMMUNICATION', creditAccount: 'ACCRUED_EXPENSES', amount: 3000 },
    ],
    expected: { sales: 40000, totalExpenses: 5300, grossProfit: 34700 },
  },
  {
    name: 'settlements and owner draws exclude duplicate expenses',
    entries: [
      { debitAccount: 'SUPPLIES', creditAccount: 'CASH', amount: 2000 },
      { debitAccount: 'BANK', creditAccount: 'ACCOUNTS_RECEIVABLE', amount: 50000 },
      { debitAccount: 'COMMUNICATION', creditAccount: 'ACCRUED_EXPENSES', amount: 3000 },
      { debitAccount: 'ACCRUED_EXPENSES', creditAccount: 'BANK', amount: 3000 },
      { debitAccount: 'TRAVEL', creditAccount: 'OWNER_CONTRIBUTIONS', amount: 1000 },
      { debitAccount: 'OWNER_DRAWS', creditAccount: 'BANK', amount: 20000 },
    ],
    expected: { totalExpenses: 6000 },
  },
  {
    name: 'bank settlements separate owner movements from expenses',
    entries: [
      { debitAccount: 'BANK', creditAccount: 'ACCOUNTS_RECEIVABLE', amount: 50000 },
      { debitAccount: 'ACCRUED_EXPENSES', creditAccount: 'BANK', amount: 12000 },
      { debitAccount: 'OWNER_DRAWS', creditAccount: 'BANK', amount: 20000 },
      { debitAccount: 'COMMUNICATION', creditAccount: 'BANK', amount: 3000 },
      { debitAccount: 'BANK', creditAccount: 'OWNER_CONTRIBUTIONS', amount: 10000 },
    ],
    expected: { totalExpenses: 3000 },
  },
  {
    name: 'owner-paid expenses exclude personal withdrawals',
    entries: [
      { debitAccount: 'SUPPLIES', creditAccount: 'OWNER_CONTRIBUTIONS', amount: 2000 },
      { debitAccount: 'OWNER_DRAWS', creditAccount: 'BANK', amount: 30000 },
      { debitAccount: 'OWNER_DRAWS', creditAccount: 'ACCOUNTS_RECEIVABLE', amount: 20000 },
      { debitAccount: 'OWNER_DRAWS', creditAccount: 'ACCRUED_EXPENSES', amount: 5000 },
    ],
    expected: { totalExpenses: 2000 },
  },
];
