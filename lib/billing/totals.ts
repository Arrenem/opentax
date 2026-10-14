import type { BillingLineItem, PriceMode, TaxType } from '@/types';
import { toTaxIncluded, toTaxExcluded } from '@/lib/accounting/consumptionTax';

export interface TaxBucket {
  subtotal: number;
  taxAmount: number;
  total: number;
}

export interface ComputedLineItem extends BillingLineItem {
  priceMode: PriceMode;
  withholding: boolean;
  /** 税抜金額 */
  exclusiveAmount: number;
  /** 税込金額 */
  inclusiveAmount: number;
  /** 消費税額 */
  lineTaxAmount: number;
  /** 源泉対象額（税抜）。対象外なら 0 */
  withholdingBase: number;
}

export interface DocumentTotals {
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  withholdingBase: number;
  withholdingAmount: number;
  amountDue: number;
  /** 税率ごとの税抜小計 */
  byTaxType: Partial<Record<TaxType, TaxBucket>>;
  lines: ComputedLineItem[];
}

const TAXABLE_TYPES: Array<'standard10' | 'reduced8'> = ['standard10', 'reduced8'];

function isTaxable(taxType: TaxType): taxType is 'standard10' | 'reduced8' {
  return TAXABLE_TYPES.includes(taxType as 'standard10' | 'reduced8');
}

/**
 * 報酬に対する源泉所得税＋復興特別所得税。
 * 100万円以下: 10.21%、100万円超: 100万円×10.21% + 超過分×20.42%。
 * 対象額は消費税を含まない（税抜）。1円未満切捨て。
 */
export function calcWithholdingTax(base: number): number {
  const amount = Math.floor(Math.max(0, base));
  if (amount <= 0) return 0;
  if (amount <= 1_000_000) {
    return Math.floor((amount * 1021) / 10000);
  }
  return 102_100 + Math.floor(((amount - 1_000_000) * 2042) / 10000);
}

export function resolvePriceMode(item: Pick<BillingLineItem, 'priceMode'>): PriceMode {
  return item.priceMode === 'inclusive' ? 'inclusive' : 'exclusive';
}

export function computeLineItem(item: BillingLineItem): ComputedLineItem {
  const priceMode = resolvePriceMode(item);
  const withholding = Boolean(item.withholding);
  const raw = Math.round(Number(item.quantity || 0) * Number(item.unitPrice || 0));

  let exclusiveAmount = raw;
  let inclusiveAmount = raw;
  let lineTaxAmount = 0;

  if (isTaxable(item.taxType)) {
    if (priceMode === 'inclusive') {
      inclusiveAmount = raw;
      exclusiveAmount = toTaxExcluded(raw, item.taxType);
      lineTaxAmount = inclusiveAmount - exclusiveAmount;
    } else {
      exclusiveAmount = raw;
      inclusiveAmount = toTaxIncluded(raw, item.taxType);
      lineTaxAmount = inclusiveAmount - exclusiveAmount;
    }
  }

  return {
    ...item,
    priceMode,
    withholding,
    amount: raw,
    exclusiveAmount,
    inclusiveAmount,
    lineTaxAmount,
    withholdingBase: withholding ? exclusiveAmount : 0,
  };
}

/**
 * 明細行から税抜合計・税額・税込合計・源泉・差引額を計算する。
 * 単価は行ごとの 外税/内税 に従う。源泉は税抜報酬に対して一括計算する。
 */
export function calculateDocumentTotals(lineItems: BillingLineItem[]): DocumentTotals {
  const lines = lineItems.map(computeLineItem);
  const byTaxType: DocumentTotals['byTaxType'] = {};
  let subtotal = 0;
  let taxAmount = 0;
  let totalAmount = 0;
  let withholdingBase = 0;

  for (const line of lines) {
    subtotal += line.exclusiveAmount;
    taxAmount += line.lineTaxAmount;
    totalAmount += line.inclusiveAmount;
    withholdingBase += line.withholdingBase;

    const bucket = byTaxType[line.taxType] ?? { subtotal: 0, taxAmount: 0, total: 0 };
    bucket.subtotal += line.exclusiveAmount;
    bucket.taxAmount += line.lineTaxAmount;
    bucket.total += line.inclusiveAmount;
    byTaxType[line.taxType] = bucket;
  }

  const withholdingAmount = calcWithholdingTax(withholdingBase);
  const amountDue = totalAmount - withholdingAmount;

  return {
    subtotal,
    taxAmount,
    totalAmount,
    withholdingBase,
    withholdingAmount,
    amountDue,
    byTaxType,
    lines,
  };
}

/** 明細行の amount を quantity × unitPrice で同期する */
export function syncLineItemAmount(
  item: Omit<BillingLineItem, 'amount'> & { amount?: number }
): BillingLineItem {
  return {
    ...item,
    priceMode: resolvePriceMode(item),
    withholding: Boolean(item.withholding),
    amount: Math.round(Number(item.quantity || 0) * Number(item.unitPrice || 0)),
  };
}

export function emptyBillingLine(partial?: Partial<BillingLineItem>): BillingLineItem {
  return syncLineItemAmount({
    id: partial?.id ?? `line-${Date.now()}`,
    description: partial?.description ?? '',
    quantity: partial?.quantity ?? 1,
    unitPrice: partial?.unitPrice ?? 0,
    taxType: partial?.taxType ?? 'standard10',
    priceMode: partial?.priceMode ?? 'exclusive',
    withholding: partial?.withholding ?? false,
  });
}

/** 帳票保存用に合計フィールドを展開する */
export function totalsFields(totals: DocumentTotals) {
  return {
    subtotal: totals.subtotal,
    taxAmount: totals.taxAmount,
    totalAmount: totals.totalAmount,
    withholdingBase: totals.withholdingBase,
    withholdingAmount: totals.withholdingAmount,
    amountDue: totals.amountDue,
  };
}
