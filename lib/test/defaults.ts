import type { FixedAsset, IncomeDeductionInput, UserSettings } from '@/types';
import { DEFAULT_DEDUCTIONS, DEFAULT_USER_SETTINGS } from '@/types';

export const TEST_USER_SETTINGS: UserSettings = {
  ...DEFAULT_USER_SETTINGS,
  businessName: 'テストデザイン事務所',
  ownerName: '山田花子',
  address: '東京都渋谷区神宮前1-2-3',
  taxOffice: '渋谷',
  invoiceRegistrationNumber: 'T1234567890123',
  isInvoiceIssuer: true,
  filingType: 'blue',
  eTaxFiling: true,
  excellentElectronicBooks: false,
  consumptionTaxStatus: 'taxable',
  consumptionTaxMethod: 'special20pct',
  simplifiedBusinessType: 5,
  businessTaxCategory: 1,
  homeOfficeRatio: 30,
  communicationRatio: 80,
  utilitiesRatio: 30,
  carUsageRatio: 50,
  baselineRevenue: 2_860_000,
  bankAccounts: [
    {
      id: 'bank-test',
      bankName: 'テスト銀行',
      branchName: '渋谷支店',
      accountType: 'ordinary',
      accountNumber: '1234567',
      accountHolder: 'ヤマダ ハナコ',
      isDefault: true,
    },
  ],
};

export const TEST_DEDUCTIONS: IncomeDeductionInput = {
  ...DEFAULT_DEDUCTIONS,
  socialInsurance: 480_000,
  smallEnterpriseMutual: 240_000,
  lifeInsuranceGeneralPaid: 80_000,
  lifeInsuranceMedicalPaid: 40_000,
  donations: 50_000,
};

export const TEST_ASSETS: FixedAsset[] = [
  {
    id: 'asset-macbook',
    name: 'MacBook Air M3',
    acquiredOn: '2025-02-05',
    acquisitionCost: 165_000,
    usefulLifeYears: 4,
    method: 'straight_line',
    businessUseRatio: 100,
    accumulatedDepreciation: 0,
    isDisposed: false,
    note: '業務用PC',
  },
];
