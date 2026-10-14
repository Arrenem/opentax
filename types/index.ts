import { Timestamp } from 'firebase/firestore';

// ============================================================
// 勘定科目
// ============================================================
export type AccountCode =
  | 'CASH'
  | 'BANK'
  | 'ACCOUNTS_RECEIVABLE'
  | 'PREPAID_EXPENSE'
  | 'INVENTORY'
  | 'FIXED_ASSETS'
  | 'OWNER_DRAWS'
  | 'ACCOUNTS_PAYABLE'
  | 'ACCRUED_EXPENSES'
  | 'DEPOSITS_RECEIVED'
  | 'CONSUMPTION_TAX_PAYABLE'
  | 'OWNER_CONTRIBUTIONS'
  | 'CAPITAL'
  | 'SALES'
  | 'OTHER_INCOME'
  | 'TAXES_AND_DUES'
  | 'FREIGHT'
  | 'UTILITIES'
  | 'TRAVEL'
  | 'COMMUNICATION'
  | 'ADVERTISING'
  | 'ENTERTAINMENT'
  | 'INSURANCE'
  | 'REPAIRS'
  | 'SUPPLIES'
  | 'DEPRECIATION'
  | 'WELFARE'
  | 'SALARIES'
  | 'SUBCONTRACTING'
  | 'INTEREST'
  | 'RENT'
  | 'BAD_DEBT'
  | 'MISC_EXPENSE'
  | 'PURCHASES'
  | 'FAMILY_WAGES';

export type TaxType = 'standard10' | 'reduced8' | 'exempt' | 'non_taxable' | 'export';

export type SourceType = 'credit_card' | 'bank' | 'invoice' | 'manual' | 'issued_document';

export type ClassificationMethod = 'rule' | 'ml' | 'llm' | 'manual';

export type JournalStatus = 'pending' | 'confirmed';
export type EntryOrigin = 'manual' | 'agent' | 'billing' | 'api';

// ============================================================
// 仕訳エントリ
// ============================================================
export interface JournalEntry {
  id: string;
  entryNumber: number;
  version: number;
  isCurrent: boolean;
  isDeleted: boolean;

  transactionDate: Timestamp;
  fiscalYear: number;
  fiscalMonth: number;

  debitAccount: AccountCode;
  debitAmount: number;
  creditAccount: AccountCode;
  creditAmount: number;

  counterparty: string;
  description: string;

  taxType: TaxType;
  taxAmount: number;
  taxIncluded: boolean;

  invoiceRegistrationNumber?: string;
  isQualifiedInvoice: boolean;
  exemptSellerRatio?: 80 | 50 | 0;

  sourceType: SourceType;
  sourceDocumentId?: string;

  classificationMethod?: ClassificationMethod; // legacy read compatibility
  classificationConfidence?: number; // legacy read compatibility
  entryOrigin?: EntryOrigin;
  agentConnectionId?: string;
  sourceReference?: string;
  evidenceIds?: string[];
  reviewNote?: string;
  status: JournalStatus | 'auto'; // 'auto' may be present in legacy records

  createdAt: Timestamp;
  createdBy: string;
  updatedAt: Timestamp;
  updatedBy: string;
}

// ============================================================
// 監査ログ
// ============================================================
export type OperationType = 'CREATE' | 'UPDATE' | 'DELETE';

export interface AuditLogEntry {
  id: string;
  journalId?: string;
  entityType?: string;
  entityId?: string;
  operationType: OperationType;
  operationDatetime: Timestamp;
  operatorId: string;
  actorType?: 'user' | 'agent';
  actorId?: string;
  agentConnectionId?: string;
  previousValues?: Partial<JournalEntry>;
  newValues?: Partial<JournalEntry>;
  reason?: string;
}

// ============================================================
// 証憑ドキュメント
// ============================================================
export type DocumentType =
  | 'credit_card_statement'
  | 'invoice'
  | 'bank_statement'
  | 'receipt'
  | 'other';

export type FileType = 'image/jpeg' | 'image/png' | 'application/pdf';

export interface Document {
  id: string;
  fileName: string;
  originalFileName: string;
  storageUrl: string;
  fileType: FileType;
  fileSizeBytes: number;

  documentType: DocumentType;

  transactionDate?: Timestamp;
  counterparty?: string;
  amount?: number;

  projectId?: string;
  sourceReference?: string;
  ocrStatus?: string; // legacy records only
  ocrRawText?: string; // legacy records only
  ocrExtractedData?: unknown; // legacy records only

  invoiceRegistrationNumber?: string;
  isVerifiedInvoice?: boolean;

  linkedJournalIds: string[];

  uploadedAt: Timestamp;
  uploadedBy: string;

  isDeleted: boolean;
}

// ============================================================
// ユーザー設定
// ============================================================
export type FilingType = 'blue' | 'white';

export type ConsumptionTaxStatus = 'taxable' | 'exempt';

export type ConsumptionTaxMethod =
  | 'standard'
  | 'simplified'
  | 'special20pct'
  | 'special30pct';

/** 個人事業税の事業区分（第1種5% / 第2種4% / 第3種5%・一部3%） */
export type BusinessTaxCategory = 1 | 2 | 3;

/** 預金種目 */
export type BankAccountType = 'ordinary' | 'checking' | 'savings';

export const BANK_ACCOUNT_TYPE_LABELS: Record<BankAccountType, string> = {
  ordinary: '普通',
  checking: '当座',
  savings: '貯蓄',
};

/** 請求書に記載する振込先口座 */
export interface BankAccount {
  id: string;
  bankName: string;
  branchName: string;
  accountType: BankAccountType;
  accountNumber: string;
  /** 口座名義（カナ） */
  accountHolder: string;
  /** 請求書に記載する口座 */
  isDefault?: boolean;
}

export interface UserSettings {
  businessName: string;
  ownerName: string;
  address?: string;
  taxOffice?: string;
  invoiceRegistrationNumber: string;
  isInvoiceIssuer: boolean;

  fiscalYearStart: number;
  openingDate?: string;

  filingType: FilingType;
  eTaxFiling: boolean;
  excellentElectronicBooks: boolean;

  consumptionTaxStatus: ConsumptionTaxStatus;
  consumptionTaxMethod: ConsumptionTaxMethod;
  simplifiedBusinessType?: 1 | 2 | 3 | 4 | 5 | 6;

  businessTaxCategory: BusinessTaxCategory;

  /** 家事按分（事業使用割合 %） */
  homeOfficeRatio?: number;
  communicationRatio?: number;
  carUsageRatio?: number;
  utilitiesRatio?: number;

  /** 基準期間（前々年）の課税売上高。1,000万円超で課税事業者 */
  baselineRevenue?: number;

  /** 振込先口座（isDefault の口座を請求書に記載） */
  bankAccounts?: BankAccount[];
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
  businessName: '',
  ownerName: '',
  address: '',
  taxOffice: '',
  invoiceRegistrationNumber: '',
  isInvoiceIssuer: true,
  fiscalYearStart: 1,
  filingType: 'blue',
  eTaxFiling: true,
  excellentElectronicBooks: false,
  consumptionTaxStatus: 'taxable',
  consumptionTaxMethod: 'special20pct',
  simplifiedBusinessType: 5,
  businessTaxCategory: 1,
  homeOfficeRatio: 30,
  communicationRatio: 80,
  carUsageRatio: 50,
  utilitiesRatio: 30,
  baselineRevenue: 0,
  bankAccounts: [],
};

// ============================================================
// 所得控除・確定申告入力
// ============================================================
export type DependentType =
  | 'general'
  | 'specific'
  | 'elderly'
  | 'elderly_livein'
  | 'specific_special';

export interface DependentInput {
  id: string;
  name: string;
  type: DependentType;
  income: number;
}

export type DisabilityType = 'none' | 'ordinary' | 'special' | 'special_livein';

export interface IncomeDeductionInput {
  socialInsurance: number;
  smallEnterpriseMutual: number;
  lifeInsuranceGeneralPaid: number;
  lifeInsuranceMedicalPaid: number;
  lifeInsurancePensionPaid: number;
  earthquakeInsurancePaid: number;
  hasSpouse: boolean;
  spouseIncome: number;
  spouseIsElderly: boolean;
  dependents: DependentInput[];
  disability: DisabilityType;
  isWidow: boolean;
  isSingleParent: boolean;
  isWorkingStudent: boolean;
  medicalExpenses: number;
  medicalInsuranceReimburse: number;
  donations: number;
  withholdingTax: number;
  prepaidIncomeTax: number;
  beginningInventory: number;
  endingInventory: number;
}

export const DEFAULT_DEDUCTIONS: IncomeDeductionInput = {
  socialInsurance: 0,
  smallEnterpriseMutual: 0,
  lifeInsuranceGeneralPaid: 0,
  lifeInsuranceMedicalPaid: 0,
  lifeInsurancePensionPaid: 0,
  earthquakeInsurancePaid: 0,
  hasSpouse: false,
  spouseIncome: 0,
  spouseIsElderly: false,
  dependents: [],
  disability: 'none',
  isWidow: false,
  isSingleParent: false,
  isWorkingStudent: false,
  medicalExpenses: 0,
  medicalInsuranceReimburse: 0,
  donations: 0,
  withholdingTax: 0,
  prepaidIncomeTax: 0,
  beginningInventory: 0,
  endingInventory: 0,
};

// ============================================================
// 固定資産
// ============================================================
export type DepreciationMethod = 'straight_line' | 'immediate' | 'lump_sum' | 'none';

export interface FixedAsset {
  id: string;
  name: string;
  acquiredOn: string;
  acquisitionCost: number;
  usefulLifeYears: number;
  method: DepreciationMethod;
  businessUseRatio: number;
  accumulatedDepreciation: number;
  isDisposed: boolean;
  note?: string;
}

// ============================================================
// レポート
// ============================================================
export interface MonthlySummary {
  year: number;
  month: number;
  revenue: number;
  expenses: number;
  profit: number;
}

export interface ProfitAndLoss {
  fiscalYear: number;
  sales: number;
  otherIncome: number;
  beginningInventory: number;
  purchases: number;
  endingInventory: number;
  costOfGoodsSold: number;
  totalRevenue: number;
  expenses: Record<AccountCode, number>;
  totalExpenses: number;
  familyWages: number;
  grossProfit: number;
  blueFormDeduction: number;
  blueFormDeductionLabel: string;
  netIncome: number;
}

export interface BalanceSheet {
  fiscalYear: number;
  asOfDate: Date;
  assets: {
    current: Record<AccountCode, number>;
    fixed: Record<AccountCode, number>;
    owner: Record<AccountCode, number>;
    totalAssets: number;
  };
  liabilities: {
    items: Record<AccountCode, number>;
    totalLiabilities: number;
  };
  equity: {
    items: Record<AccountCode, number>;
    totalEquity: number;
  };
  totalLiabilitiesAndEquity: number;
}

// ============================================================
// 国税庁APIレスポンス
// ============================================================
export interface NtaApiResponse {
  destination: Array<{
    registratedNumber: string;
    process: string;
    name: string;
    registrationDate: string;
    cancelDate?: string;
    expirationDate?: string;
  }>;
}

// ============================================================
// 帳票作成（発行側）: 顧客・案件・発行帳票
// ============================================================

/** 顧客マスタ */
export interface Customer {
  id: string;
  name: string;
  nameKana?: string;
  address?: string;
  email?: string;
  phone?: string;
  invoiceRegistrationNumber?: string;
  note?: string;
  isDeleted: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type ProjectStatus = 'active' | 'completed' | 'cancelled';

/** 案件（プロジェクト） */
export interface Project {
  id: string;
  name: string;
  customerId: string;
  /** 表示用に非正規化 */
  customerName: string;
  description?: string;
  status: ProjectStatus;
  /** YYYY-MM-DD */
  startDate?: string;
  endDate?: string;
  isDeleted: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** 発行帳票の種類 */
export type IssuedDocumentKind = 'estimate' | 'invoice' | 'receipt';

/** 発行帳票のステータス */
export type IssuedDocumentStatus =
  | 'draft'
  | 'issued'
  | 'sent'
  | 'paid'
  | 'cancelled';

/** 単価の税込/税抜 */
export type PriceMode = 'exclusive' | 'inclusive';

/** 帳票明細行 */
export interface BillingLineItem {
  id: string;
  description: string;
  quantity: number;
  /**
   * 単価。
   * priceMode が exclusive なら税抜、inclusive なら税込。
   */
  unitPrice: number;
  taxType: TaxType;
  /** 外税 / 内税。未指定時は外税 */
  priceMode?: PriceMode;
  /** この行を源泉徴収の対象にする */
  withholding?: boolean;
  /** quantity × unitPrice（入力モードの金額） */
  amount: number;
}

/** 発行帳票（見積書・請求書・領収書） */
export interface IssuedDocument {
  id: string;
  kind: IssuedDocumentKind;
  documentNumber: string;
  projectId: string;
  projectName: string;
  customerId: string;
  customerName: string;
  customerAddress?: string;
  /** YYYY-MM-DD */
  issueDate: string;
  dueDate?: string;
  title?: string;
  lineItems: BillingLineItem[];
  /** 税抜合計 */
  subtotal: number;
  taxAmount: number;
  /** 税込合計 */
  totalAmount: number;
  /** 源泉徴収の対象額（税抜報酬） */
  withholdingBase?: number;
  /** 源泉徴収税額（復興特別所得税込み 10.21% / 20.42%） */
  withholdingAmount?: number;
  /** 差引支払額 = 税込合計 − 源泉徴収 */
  amountDue?: number;
  notes?: string;
  status: IssuedDocumentStatus;
  /** 会計連携済みの仕訳ID */
  linkedJournalIds: string[];
  postedToAccounting: boolean;
  /**
   * 変換元帳票ID
   * 見積→請求、請求→領収など
   */
  sourceDocumentId?: string;
  isDeleted: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;
  updatedBy: string;
}

export const ISSUED_DOCUMENT_KIND_LABELS: Record<IssuedDocumentKind, string> = {
  estimate: '見積書',
  invoice: '請求書',
  receipt: '領収書',
};

export const ISSUED_DOCUMENT_STATUS_LABELS: Record<IssuedDocumentStatus, string> = {
  draft: '下書き',
  issued: '発行済',
  sent: '送付済',
  paid: '入金済',
  cancelled: '取消',
};

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  active: '進行中',
  completed: '完了',
  cancelled: '中止',
};
