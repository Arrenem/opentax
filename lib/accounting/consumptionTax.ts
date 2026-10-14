import type { TaxType } from '@/types';
import { getExemptSellerRatio } from './periodConfig';

// ============================================================
// 税率定数（整数演算）
// ============================================================
export const TAX_RATES = {
  standard10: { national: 78, local: 22, total: 100 },   // 10% (国税7.8%+地方2.2%)
  reduced8: { national: 62, local: 18, total: 80 },      // 8% (国税6.24%+地方1.76%)
} as const;

export const SIMPLIFIED_PURCHASE_RATIO: Record<1 | 2 | 3 | 4 | 5 | 6, number> = {
  1: 0.90,  // 卸売業
  2: 0.80,  // 小売業
  3: 0.70,  // 製造業等
  4: 0.60,  // 飲食店業等
  5: 0.50,  // サービス業
  6: 0.40,  // 不動産業
};

// ============================================================
// 売上税額計算（割戻し計算・標準）
// ============================================================
export function calcSalesTaxStandard(
  taxIncludedAmount: number,
  taxType: 'standard10' | 'reduced8' = 'standard10'
): {
  taxBase: number;
  nationalTax: number;
  localTax: number;
  total: number;
} {
  const rate = taxType === 'standard10' ? 110 : 108;
  // 課税標準額（千円未満切捨て）
  const taxBase = Math.floor(Math.floor(taxIncludedAmount * 100 / rate) / 1000) * 1000;
  // 国税分（1円未満切捨て）
  const nationalTax = Math.floor(taxBase * (taxType === 'standard10' ? 78 : 62) / 1000);
  // 地方分 = 国税 × 22/78 または 18/62（1円未満切捨て）
  const localRatio = taxType === 'standard10' ? 22 / 78 : 18 / 62;
  const localTax = Math.floor(nationalTax * localRatio);

  return {
    taxBase,
    nationalTax,
    localTax,
    total: nationalTax + localTax,
  };
}

// ============================================================
// 仕入税額計算（積上げ計算）
// ============================================================
export interface InvoicePurchase {
  amount: number;
  taxType: 'standard10' | 'reduced8';
  isExemptSeller: boolean;
  transactionDate: Date;
}

export function calcPurchaseTax(invoices: InvoicePurchase[]): {
  deductibleTax: number;
  exemptProportion: number;
} {
  let totalDeductible = 0;
  let totalExemptProportion = 0;
  let exemptCount = 0;

  for (const inv of invoices) {
    const rate = inv.taxType === 'standard10' ? 10 : 8;
    const denominator = 100 + rate;
    // 税額（1円未満切捨て）
    const taxAmount = Math.floor(inv.amount * rate / denominator);

    if (inv.isExemptSeller) {
      const ratio = getExemptSellerRatio(inv.transactionDate);
      totalDeductible += Math.floor(taxAmount * ratio / 100);
      totalExemptProportion += ratio;
      exemptCount++;
    } else {
      totalDeductible += taxAmount;
    }
  }

  return {
    deductibleTax: totalDeductible,
    exemptProportion: exemptCount > 0 ? totalExemptProportion / exemptCount : 0,
  };
}

// ============================================================
// 税抜金額 ↔ 税込金額変換（整数演算）
// ============================================================
export function toTaxIncluded(taxExcludedAmount: number, taxType: 'standard10' | 'reduced8'): number {
  const rate = taxType === 'standard10' ? 110 : 108;
  return Math.floor(taxExcludedAmount * rate / 100);
}

export function toTaxExcluded(taxIncludedAmount: number, taxType: 'standard10' | 'reduced8'): number {
  const rate = taxType === 'standard10' ? 110 : 108;
  return Math.floor(taxIncludedAmount * 100 / rate);
}

export function extractTaxAmount(taxIncludedAmount: number, taxType: 'standard10' | 'reduced8'): number {
  const excluded = toTaxExcluded(taxIncludedAmount, taxType);
  return taxIncludedAmount - excluded;
}

// ============================================================
// 消費税区分の表示名
// ============================================================
export const TAX_TYPE_LABELS: Record<TaxType, string> = {
  standard10: '課税10%',
  reduced8: '軽減8%',
  exempt: '非課税',
  non_taxable: '不課税',
  export: '免税（輸出）',
};
