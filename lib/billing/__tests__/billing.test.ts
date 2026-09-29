import { describe, it, expect } from 'vitest';
import {
  calculateDocumentTotals,
  syncLineItemAmount,
  calcWithholdingTax,
  generateDocumentNumber,
  nextSequence,
  buildAccountingPostPlan,
  buildAccountingPostPlans,
  planToJournalPayload,
  defaultPostKindForDocument,
  toTaxTreatment,
  parseTaxTreatment,
} from '@/lib/billing';
import type { BankAccount, BillingLineItem, IssuedDocument } from '@/types';
import { buildBillingSheetModel, pickInvoiceBankAccount } from '@/lib/billing/sheetModel';

const sampleLines: BillingLineItem[] = [
  {
    id: '1',
    description: '開発費',
    quantity: 2,
    unitPrice: 100000,
    taxType: 'standard10',
    priceMode: 'exclusive',
    amount: 200000,
  },
  {
    id: '2',
    description: '書籍',
    quantity: 1,
    unitPrice: 2000,
    taxType: 'reduced8',
    priceMode: 'exclusive',
    amount: 2000,
  },
  {
    id: '3',
    description: '立替（非課税）',
    quantity: 1,
    unitPrice: 5000,
    taxType: 'exempt',
    amount: 5000,
  },
];

describe('calculateDocumentTotals', () => {
  it('税率ごとに税額を合算する（外税）', () => {
    const totals = calculateDocumentTotals(sampleLines);
    expect(totals.subtotal).toBe(207000);
    expect(totals.taxAmount).toBe(20160);
    expect(totals.totalAmount).toBe(227160);
    expect(totals.withholdingAmount).toBe(0);
    expect(totals.amountDue).toBe(227160);
  });

  it('内税単価から税抜・税額を逆算する', () => {
    const totals = calculateDocumentTotals([
      {
        id: '1',
        description: '内税の開発費',
        quantity: 1,
        unitPrice: 110000,
        taxType: 'standard10',
        priceMode: 'inclusive',
        amount: 110000,
      },
    ]);
    expect(totals.subtotal).toBe(100000);
    expect(totals.taxAmount).toBe(10000);
    expect(totals.totalAmount).toBe(110000);
  });

  it('内税と外税が混在しても税抜で合算する', () => {
    const totals = calculateDocumentTotals([
      {
        id: '1',
        description: '外税',
        quantity: 1,
        unitPrice: 10000,
        taxType: 'standard10',
        priceMode: 'exclusive',
        amount: 10000,
      },
      {
        id: '2',
        description: '内税',
        quantity: 1,
        unitPrice: 11000,
        taxType: 'standard10',
        priceMode: 'inclusive',
        amount: 11000,
      },
    ]);
    expect(totals.subtotal).toBe(20000);
    expect(totals.taxAmount).toBe(2000);
    expect(totals.totalAmount).toBe(22000);
  });

  it('源泉徴収を税抜報酬に対して計算する', () => {
    const totals = calculateDocumentTotals([
      {
        id: '1',
        description: '原稿料',
        quantity: 1,
        unitPrice: 100000,
        taxType: 'standard10',
        priceMode: 'exclusive',
        withholding: true,
        amount: 100000,
      },
    ]);
    expect(totals.withholdingBase).toBe(100000);
    expect(totals.withholdingAmount).toBe(10210);
    expect(totals.totalAmount).toBe(110000);
    expect(totals.amountDue).toBe(99790);
  });

  it('空明細はゼロ', () => {
    expect(calculateDocumentTotals([])).toMatchObject({
      subtotal: 0,
      taxAmount: 0,
      totalAmount: 0,
      withholdingAmount: 0,
      amountDue: 0,
    });
  });
});

describe('calcWithholdingTax', () => {
  it('100万円以下は 10.21%', () => {
    expect(calcWithholdingTax(100000)).toBe(10210);
    expect(calcWithholdingTax(1_000_000)).toBe(102100);
  });

  it('100万円超は超過分 20.42%', () => {
    // 1,000,000 * 10.21% + 200,000 * 20.42% = 102,100 + 40,840 = 142,940
    expect(calcWithholdingTax(1_200_000)).toBe(142940);
  });
});

describe('syncLineItemAmount', () => {
  it('quantity × unitPrice を反映する', () => {
    const item = syncLineItemAmount({
      id: 'x',
      description: 'test',
      quantity: 3,
      unitPrice: 1500,
      taxType: 'standard10',
    });
    expect(item.amount).toBe(4500);
    expect(item.priceMode).toBe('exclusive');
  });
});

describe('taxTreatment', () => {
  it('内税10% を taxType と priceMode に展開する', () => {
    expect(parseTaxTreatment('inclusive_10')).toEqual({
      taxType: 'standard10',
      priceMode: 'inclusive',
    });
    expect(toTaxTreatment('standard10', 'inclusive')).toBe('inclusive_10');
  });
});

describe('numbering', () => {
  it('帳票番号を生成する', () => {
    expect(generateDocumentNumber('invoice', '2026-08-21', 3)).toBe('INV-202608-0003');
    expect(generateDocumentNumber('estimate', '2026-01-01', 1)).toBe('EST-202601-0001');
    expect(generateDocumentNumber('receipt', '2025-12-31', 99)).toBe('RCP-202512-0099');
  });

  it('既存番号から次連番を求める', () => {
    const existing = ['INV-202608-0001', 'INV-202608-0003', 'EST-202608-0009', 'INV-202607-0099'];
    expect(nextSequence('invoice', '2026-08-15', existing)).toBe(4);
    expect(nextSequence('estimate', '2026-08-15', existing)).toBe(10);
    expect(nextSequence('receipt', '2026-08-15', existing)).toBe(1);
  });
});

describe('accountingPost', () => {
  const baseDoc: Pick<
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
  > = {
    kind: 'invoice',
    documentNumber: 'INV-202608-0001',
    customerName: 'テスト株式会社',
    title: '開発費',
    totalAmount: 110000,
    taxAmount: 10000,
    subtotal: 100000,
    issueDate: '2026-08-01',
    lineItems: [
      {
        id: '1',
        description: '開発',
        quantity: 1,
        unitPrice: 100000,
        taxType: 'standard10',
        amount: 100000,
      },
    ],
  };

  it('請求書は売掛金/売上のプランを返す', () => {
    const plan = buildAccountingPostPlan(baseDoc, 'invoice_issue');
    expect(plan).not.toBeNull();
    expect(plan!.debitAccount).toBe('ACCOUNTS_RECEIVABLE');
    expect(plan!.creditAccount).toBe('SALES');
    expect(plan!.amount).toBe(110000);
  });

  it('見積書は null', () => {
    expect(buildAccountingPostPlan({ ...baseDoc, kind: 'estimate' }, 'invoice_issue')).toBeNull();
    expect(defaultPostKindForDocument('estimate')).toBeNull();
  });

  it('領収書は入金仕訳プランを返す', () => {
    const plan = buildAccountingPostPlan(
      { ...baseDoc, kind: 'receipt' },
      'receipt_payment'
    );
    expect(plan!.debitAccount).toBe('BANK');
    expect(plan!.creditAccount).toBe('ACCOUNTS_RECEIVABLE');
    expect(plan!.taxType).toBe('non_taxable');
  });

  it('源泉がある入金は差引額と事業主貸に分割する', () => {
    const plans = buildAccountingPostPlans(
      {
        ...baseDoc,
        kind: 'receipt',
        withholdingAmount: 10210,
        amountDue: 99790,
        lineItems: [
          {
            id: '1',
            description: '開発',
            quantity: 1,
            unitPrice: 100000,
            taxType: 'standard10',
            withholding: true,
            amount: 100000,
          },
        ],
      },
      'receipt_payment'
    );
    expect(plans).toHaveLength(2);
    expect(plans[0]!.debitAccount).toBe('BANK');
    expect(plans[0]!.amount).toBe(99790);
    expect(plans[1]!.debitAccount).toBe('OWNER_DRAWS');
    expect(plans[1]!.amount).toBe(10210);
  });

  it('planToJournalPayload が issued_document ソースになる', () => {
    const plan = buildAccountingPostPlan(baseDoc, 'invoice_issue')!;
    const journal = planToJournalPayload(plan, 'uid-1', 'iss-1', {
      invoiceRegistrationNumber: 'T1111111111111',
      isInvoiceIssuer: true,
    });
    expect(journal.sourceType).toBe('issued_document');
    expect(journal.sourceDocumentId).toBe('iss-1');
    expect(journal.status).toBe('confirmed');
    expect(journal.isQualifiedInvoice).toBe(true);
  });
});

describe('sheetModel bank account', () => {
  const doc = {
    id: 'd1',
    kind: 'invoice',
    documentNumber: 'INV-1',
    issueDate: '2026-09-01',
    customerName: '顧客',
    lineItems: sampleLines,
  } as unknown as IssuedDocument;
  const accounts: BankAccount[] = [
    { id: 'a', bankName: 'A銀行', branchName: '本店', accountType: 'ordinary', accountNumber: '111', accountHolder: 'ア' },
    { id: 'b', bankName: 'B銀行', branchName: '渋谷支店', accountType: 'checking', accountNumber: '222', accountHolder: 'イ', isDefault: true },
  ];
  const issuer = { businessName: 'x', ownerName: 'y', invoiceRegistrationNumber: '', isInvoiceIssuer: false, bankAccounts: accounts };

  it('picks the default account, falling back to the first usable one', () => {
    expect(pickInvoiceBankAccount(accounts)?.id).toBe('b');
    expect(pickInvoiceBankAccount([accounts[0]])?.id).toBe('a');
    expect(pickInvoiceBankAccount([{ ...accounts[1], accountNumber: '' }])).toBeUndefined();
  });

  it('shows the account on invoices only', () => {
    expect(buildBillingSheetModel(doc, issuer).bankAccount).toEqual({
      bankLine: 'B銀行 渋谷支店',
      accountLine: '当座 222',
      accountHolder: 'イ',
    });
    expect(buildBillingSheetModel({ ...doc, kind: 'estimate' }, issuer).bankAccount).toBeUndefined();
    expect(buildBillingSheetModel({ ...doc, kind: 'receipt' }, issuer).bankAccount).toBeUndefined();
  });
});
