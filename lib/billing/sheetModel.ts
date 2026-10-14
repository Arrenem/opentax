import type { BankAccount, IssuedDocument, UserSettings } from '@/types';
import { BANK_ACCOUNT_TYPE_LABELS, ISSUED_DOCUMENT_KIND_LABELS } from '@/types';
import { TAX_TYPE_LABELS } from '@/lib/accounting/consumptionTax';
import { calculateDocumentTotals, taxTreatmentLabel } from '@/lib/billing';
import { amountHeadline } from '@/lib/billing/labels';
import { formatYen } from '@/lib/utils/format';
import type { ComputedLineItem, DocumentTotals } from '@/lib/billing';

export type BillingIssuer = Pick<
  UserSettings,
  | 'businessName'
  | 'ownerName'
  | 'address'
  | 'invoiceRegistrationNumber'
  | 'isInvoiceIssuer'
  | 'bankAccounts'
>;

export interface SheetBankAccount {
  /** 例: 〇〇銀行 渋谷支店 */
  bankLine: string;
  /** 例: 普通 1234567 */
  accountLine: string;
  accountHolder: string;
}

export interface SheetLine {
  id: string;
  description: string;
  quantity: string;
  unitPrice: string;
  taxLabel: string;
  exclusiveAmount: string;
  withholding: boolean;
}

export interface SheetTaxRow {
  label: string;
  subtotal: string;
  taxAmount: string;
}

export interface BillingSheetModel {
  kindLabel: string;
  documentNumber: string;
  issueDate: string;
  dueDate?: string;
  title?: string;
  customerName: string;
  customerAddress?: string;
  issuerName: string;
  issuerOwner?: string;
  issuerAddress?: string;
  registrationNumber?: string;
  isQualifiedInvoice: boolean;
  headlineLabel: string;
  headlineAmount: string;
  lines: SheetLine[];
  subtotal: string;
  taxAmount: string;
  totalAmount: string;
  withholdingBase?: string;
  withholdingAmount?: string;
  amountDue?: string;
  hasWithholding: boolean;
  taxRows: SheetTaxRow[];
  notes?: string;
  /** 振込先（請求書のみ） */
  bankAccount?: SheetBankAccount;
  isReceipt: boolean;
  fileName: string;
  totals: DocumentTotals;
  computedLines: ComputedLineItem[];
}

export function formatQuantity(qty: number): string {
  if (Number.isInteger(qty)) return String(qty);
  return String(qty);
}

/** 請求書に記載する口座（isDefault 優先、なければ先頭） */
export function pickInvoiceBankAccount(accounts?: BankAccount[]): BankAccount | undefined {
  const usable = (accounts ?? []).filter((a) => a.bankName.trim() && a.accountNumber.trim());
  return usable.find((a) => a.isDefault) ?? usable[0];
}

export function formatSheetBankAccount(account: BankAccount): SheetBankAccount {
  return {
    bankLine: [account.bankName, account.branchName].map((v) => v.trim()).filter(Boolean).join(' '),
    accountLine: `${BANK_ACCOUNT_TYPE_LABELS[account.accountType] ?? '普通'} ${account.accountNumber.trim()}`,
    accountHolder: account.accountHolder.trim(),
  };
}

export function buildBillingSheetModel(
  document: IssuedDocument,
  issuer?: BillingIssuer
): BillingSheetModel {
  const totals = calculateDocumentTotals(document.lineItems ?? []);
  const hasWithholding = totals.withholdingAmount > 0;
  const kindLabel = ISSUED_DOCUMENT_KIND_LABELS[document.kind];
  const issuerName = issuer?.businessName || issuer?.ownerName || '（発行者未設定）';
  const showOwner = Boolean(issuer?.ownerName && issuer?.businessName);

  const taxRows: SheetTaxRow[] = [];
  (['standard10', 'reduced8'] as const).forEach((key) => {
    const bucket = totals.byTaxType[key];
    if (!bucket || bucket.subtotal === 0) return;
    taxRows.push({
      label: TAX_TYPE_LABELS[key],
      subtotal: formatYen(bucket.subtotal),
      taxAmount: formatYen(bucket.taxAmount),
    });
  });

  const bankAccount =
    document.kind === 'invoice' ? pickInvoiceBankAccount(issuer?.bankAccounts) : undefined;

  return {
    kindLabel,
    documentNumber: document.documentNumber,
    issueDate: document.issueDate,
    dueDate: document.dueDate || undefined,
    title: document.title || undefined,
    customerName: document.customerName,
    customerAddress: document.customerAddress || undefined,
    issuerName,
    issuerOwner: showOwner ? issuer?.ownerName : undefined,
    issuerAddress: issuer?.address || undefined,
    registrationNumber:
      issuer?.isInvoiceIssuer && issuer?.invoiceRegistrationNumber
        ? issuer.invoiceRegistrationNumber
        : undefined,
    isQualifiedInvoice: Boolean(issuer?.isInvoiceIssuer && issuer?.invoiceRegistrationNumber),
    headlineLabel: amountHeadline(document.kind, hasWithholding),
    headlineAmount: formatYen(hasWithholding ? totals.amountDue : totals.totalAmount),
    lines: totals.lines.map((line) => ({
      id: line.id,
      description: line.description || '（品目未入力）',
      quantity: formatQuantity(line.quantity),
      unitPrice: formatYen(line.unitPrice),
      taxLabel: taxTreatmentLabel(line.taxType, line.priceMode),
      exclusiveAmount: formatYen(line.exclusiveAmount),
      withholding: line.withholding,
    })),
    subtotal: formatYen(totals.subtotal),
    taxAmount: formatYen(totals.taxAmount),
    totalAmount: formatYen(totals.totalAmount),
    withholdingBase: hasWithholding ? formatYen(totals.withholdingBase) : undefined,
    withholdingAmount: hasWithholding ? formatYen(totals.withholdingAmount) : undefined,
    amountDue: hasWithholding ? formatYen(totals.amountDue) : undefined,
    hasWithholding,
    taxRows,
    notes: document.notes || undefined,
    bankAccount: bankAccount ? formatSheetBankAccount(bankAccount) : undefined,
    isReceipt: document.kind === 'receipt',
    fileName: `${kindLabel}_${document.documentNumber}.pdf`,
    totals,
    computedLines: totals.lines,
  };
}
