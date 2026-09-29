import type {
  AccountCode,
  IssuedDocument,
  IssuedDocumentKind,
  JournalEntry,
  TaxType,
  UserSettings,
} from '@/types';
import { extractTaxAmount } from '@/lib/accounting/consumptionTax';
import { calculateDocumentTotals } from './totals';

export type AccountingPostKind = 'invoice_issue' | 'receipt_payment';

export interface AccountingPostPlan {
  kind: AccountingPostKind;
  debitAccount: AccountCode;
  creditAccount: AccountCode;
  amount: number;
  taxType: TaxType;
  taxAmount: number;
  taxIncluded: boolean;
  counterparty: string;
  description: string;
  transactionDate: Date;
}

type BillingDoc = Pick<
  IssuedDocument,
  | 'kind'
  | 'documentNumber'
  | 'customerName'
  | 'title'
  | 'totalAmount'
  | 'taxAmount'
  | 'subtotal'
  | 'issueDate'
  | 'lineItems'
  | 'withholdingAmount'
  | 'amountDue'
>;

function resolvedAmounts(doc: BillingDoc) {
  const totals = calculateDocumentTotals(doc.lineItems ?? []);
  const totalAmount = doc.totalAmount || totals.totalAmount;
  const taxAmount = doc.taxAmount || totals.taxAmount;
  const withholdingAmount = doc.withholdingAmount ?? totals.withholdingAmount;
  const amountDue = doc.amountDue ?? totals.amountDue;
  return { totalAmount, taxAmount, withholdingAmount, amountDue, totals };
}

/**
 * 帳票から会計連携仕訳のプランを組み立てる（先頭1件。後方互換）。
 */
export function buildAccountingPostPlan(
  doc: BillingDoc,
  postKind: AccountingPostKind
): AccountingPostPlan | null {
  return buildAccountingPostPlans(doc, postKind)[0] ?? null;
}

/**
 * 帳票から会計連携仕訳プランを組み立てる。
 * - 請求書発行: 借方 売掛金 / 貸方 売上高（税込合計）
 * - 領収・入金: 借方 普通預金 / 貸方 売掛金（差引額）
 *   源泉がある場合は 借方 事業主貸 / 貸方 売掛金 を追加
 * - 見積書: 空
 */
export function buildAccountingPostPlans(
  doc: BillingDoc,
  postKind: AccountingPostKind
): AccountingPostPlan[] {
  if (doc.kind === 'estimate') return [];

  const { totalAmount, taxAmount, withholdingAmount, amountDue } = resolvedAmounts(doc);
  if (totalAmount <= 0) return [];

  const primaryTax = dominantTaxType(doc.lineItems.map((l) => l.taxType));
  const transactionDate = new Date(doc.issueDate + 'T00:00:00');
  const titleSuffix = doc.title ? ` ${doc.title}` : '';

  if (postKind === 'invoice_issue') {
    if (doc.kind !== 'invoice') return [];
    return [
      {
        kind: 'invoice_issue',
        debitAccount: 'ACCOUNTS_RECEIVABLE',
        creditAccount: 'SALES',
        amount: totalAmount,
        taxType: primaryTax,
        taxAmount:
          taxAmount ||
          (primaryTax === 'standard10' || primaryTax === 'reduced8'
            ? extractTaxAmount(totalAmount, primaryTax)
            : 0),
        taxIncluded: true,
        counterparty: doc.customerName,
        description: `請求書 ${doc.documentNumber}${titleSuffix}`,
        transactionDate,
      },
    ];
  }

  const plans: AccountingPostPlan[] = [
    {
      kind: 'receipt_payment',
      debitAccount: 'BANK',
      creditAccount: 'ACCOUNTS_RECEIVABLE',
      amount: withholdingAmount > 0 ? amountDue : totalAmount,
      taxType: 'non_taxable',
      taxAmount: 0,
      taxIncluded: true,
      counterparty: doc.customerName,
      description:
        doc.kind === 'receipt'
          ? `領収書 ${doc.documentNumber}${titleSuffix}`
          : `請求書入金 ${doc.documentNumber}`,
      transactionDate,
    },
  ];

  if (withholdingAmount > 0) {
    plans.push({
      kind: 'receipt_payment',
      debitAccount: 'OWNER_DRAWS',
      creditAccount: 'ACCOUNTS_RECEIVABLE',
      amount: withholdingAmount,
      taxType: 'non_taxable',
      taxAmount: 0,
      taxIncluded: true,
      counterparty: doc.customerName,
      description: `源泉徴収 ${doc.documentNumber}`,
      transactionDate,
    });
  }

  return plans;
}

export function planToJournalPayload(
  plan: AccountingPostPlan,
  userId: string,
  issuedDocumentId: string,
  settings?: Pick<UserSettings, 'invoiceRegistrationNumber' | 'isInvoiceIssuer'>
): Omit<
  JournalEntry,
  'id' | 'entryNumber' | 'version' | 'isCurrent' | 'createdAt' | 'updatedAt' | 'transactionDate'
> & { transactionDate: Date } {
  const date = plan.transactionDate;
  return {
    isDeleted: false,
    transactionDate: date,
    fiscalYear: date.getFullYear(),
    fiscalMonth: date.getMonth() + 1,
    debitAccount: plan.debitAccount,
    debitAmount: plan.amount,
    creditAccount: plan.creditAccount,
    creditAmount: plan.amount,
    counterparty: plan.counterparty,
    description: plan.description,
    taxType: plan.taxType,
    taxAmount: plan.taxAmount,
    taxIncluded: plan.taxIncluded,
    invoiceRegistrationNumber: settings?.invoiceRegistrationNumber || undefined,
    isQualifiedInvoice: Boolean(settings?.isInvoiceIssuer && plan.kind === 'invoice_issue'),
    sourceType: 'issued_document',
    sourceDocumentId: issuedDocumentId,
    entryOrigin: 'billing',
    status: 'confirmed',
    createdBy: userId,
    updatedBy: userId,
  };
}

function dominantTaxType(types: TaxType[]): TaxType {
  const counts = new Map<TaxType, number>();
  for (const t of types) {
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  let best: TaxType = 'standard10';
  let bestCount = -1;
  Array.from(counts.entries()).forEach(([t, c]) => {
    if (c > bestCount) {
      best = t;
      bestCount = c;
    }
  });
  return best;
}

export function defaultPostKindForDocument(kind: IssuedDocumentKind): AccountingPostKind | null {
  if (kind === 'invoice') return 'invoice_issue';
  if (kind === 'receipt') return 'receipt_payment';
  return null;
}
