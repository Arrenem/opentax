import type { AccountCode } from '@/types';

export interface AccountDefinition {
  code: string;
  name: string;
  type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  bsCategory?: 'current' | 'fixed' | 'owner';
  plLine?: number;
  requiresAllocation?: boolean;
}

export const CHART_OF_ACCOUNTS: Record<AccountCode, AccountDefinition> = {
  // 資産
  CASH: { code: '1010', name: '現金', type: 'asset', bsCategory: 'current' },
  BANK: { code: '1020', name: '普通預金', type: 'asset', bsCategory: 'current' },
  ACCOUNTS_RECEIVABLE: { code: '1030', name: '売掛金', type: 'asset', bsCategory: 'current' },
  PREPAID_EXPENSE: { code: '1040', name: '前払費用', type: 'asset', bsCategory: 'current' },
  INVENTORY: { code: '1050', name: '棚卸資産', type: 'asset', bsCategory: 'current' },
  FIXED_ASSETS: { code: '1510', name: '固定資産', type: 'asset', bsCategory: 'fixed' },
  OWNER_DRAWS: { code: '1900', name: '事業主貸', type: 'asset', bsCategory: 'owner' },

  // 負債
  ACCOUNTS_PAYABLE: { code: '2010', name: '買掛金', type: 'liability' },
  ACCRUED_EXPENSES: { code: '2020', name: '未払金', type: 'liability' },
  DEPOSITS_RECEIVED: { code: '2030', name: '預り金', type: 'liability' },
  CONSUMPTION_TAX_PAYABLE: { code: '2040', name: '未払消費税', type: 'liability' },
  OWNER_CONTRIBUTIONS: { code: '2900', name: '事業主借', type: 'liability' },

  // 資本
  CAPITAL: { code: '3010', name: '元入金', type: 'equity' },

  // 収益
  SALES: { code: '4010', name: '売上高', type: 'revenue' },
  OTHER_INCOME: { code: '4020', name: '雑収入', type: 'revenue' },

  // 費用（青色申告決算書の18科目）
  TAXES_AND_DUES: { code: '5010', name: '租税公課', type: 'expense', plLine: 8 },
  FREIGHT: { code: '5020', name: '荷造運賃', type: 'expense', plLine: 9 },
  UTILITIES: { code: '5030', name: '水道光熱費', type: 'expense', plLine: 10 },
  TRAVEL: { code: '5040', name: '旅費交通費', type: 'expense', plLine: 11 },
  COMMUNICATION: { code: '5050', name: '通信費', type: 'expense', plLine: 12 },
  ADVERTISING: { code: '5060', name: '広告宣伝費', type: 'expense', plLine: 13 },
  ENTERTAINMENT: { code: '5070', name: '接待交際費', type: 'expense', plLine: 14 },
  INSURANCE: { code: '5080', name: '損害保険料', type: 'expense', plLine: 15 },
  REPAIRS: { code: '5090', name: '修繕費', type: 'expense', plLine: 16 },
  SUPPLIES: { code: '5100', name: '消耗品費', type: 'expense', plLine: 17 },
  DEPRECIATION: { code: '5110', name: '減価償却費', type: 'expense', plLine: 18 },
  WELFARE: { code: '5120', name: '福利厚生費', type: 'expense', plLine: 19 },
  SALARIES: { code: '5130', name: '給料賃金', type: 'expense', plLine: 20 },
  SUBCONTRACTING: { code: '5140', name: '外注工賃', type: 'expense', plLine: 21 },
  INTEREST: { code: '5150', name: '利子割引料', type: 'expense', plLine: 22 },
  RENT: { code: '5160', name: '地代家賃', type: 'expense', plLine: 23, requiresAllocation: true },
  BAD_DEBT: { code: '5170', name: '貸倒金', type: 'expense', plLine: 24 },
  MISC_EXPENSE: { code: '5180', name: '雑費', type: 'expense', plLine: 25 },
  PURCHASES: { code: '5190', name: '仕入高', type: 'expense', plLine: 2 },
  FAMILY_WAGES: { code: '5200', name: '専従者給与', type: 'expense', plLine: 26 },
};

export function getAccount(code: AccountCode): AccountDefinition {
  return CHART_OF_ACCOUNTS[code];
}

export function getAccountName(code: AccountCode): string {
  return CHART_OF_ACCOUNTS[code]?.name ?? code;
}

export function getAccountsByType(type: AccountDefinition['type']): Array<[AccountCode, AccountDefinition]> {
  return Object.entries(CHART_OF_ACCOUNTS).filter(
    ([, def]) => def.type === type
  ) as Array<[AccountCode, AccountDefinition]>;
}

export function getExpenseAccounts(): Array<[AccountCode, AccountDefinition]> {
  return getAccountsByType('expense');
}

export function isExpenseAccount(code: AccountCode): boolean {
  return CHART_OF_ACCOUNTS[code]?.type === 'expense';
}

export function isRevenueAccount(code: AccountCode): boolean {
  return CHART_OF_ACCOUNTS[code]?.type === 'revenue';
}

export function isAssetAccount(code: AccountCode): boolean {
  return CHART_OF_ACCOUNTS[code]?.type === 'asset';
}

export function isLiabilityAccount(code: AccountCode): boolean {
  return CHART_OF_ACCOUNTS[code]?.type === 'liability';
}
