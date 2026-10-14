import type { ConsumptionTaxMethod, JournalEntry, TaxType } from '@/types';
import {
  calcSalesTaxStandard,
  extractTaxAmount,
  SIMPLIFIED_PURCHASE_RATIO,
} from '@/lib/accounting/consumptionTax';
import { getExemptSellerRatio, isSmallAmountExempt } from '@/lib/accounting/periodConfig';
import { isSpecial20PctYear, isSpecial30PctYear } from './taxYearRules';

export interface ConsumptionTaxReturn {
  fiscalYear: number;
  method: ConsumptionTaxMethod;
  methodLabel: string;
  taxableSalesIncl: number;
  reducedSalesIncl: number;
  exportSales: number;
  exemptSales: number;
  salesNationalTax: number;
  salesLocalTax: number;
  deductibleNationalTax: number;
  nationalTax: number;
  localTax: number;
  totalPayable: number;
  notes: string[];
  eligibleMethods: Array<{ method: ConsumptionTaxMethod; label: string; payable: number }>;
}

function journalDate(j: JournalEntry): Date {
  const raw = j.transactionDate as unknown;
  try {
    if (raw && typeof raw === 'object' && 'toDate' in raw && typeof (raw as { toDate: () => Date }).toDate === 'function') {
      return (raw as { toDate: () => Date }).toDate();
    }
    if (raw && typeof raw === 'object' && 'seconds' in raw) {
      return new Date((raw as { seconds: number }).seconds * 1000);
    }
    if (raw && typeof raw === 'object' && '_seconds' in raw) {
      return new Date((raw as { _seconds: number })._seconds * 1000);
    }
    if (typeof raw === 'string' || typeof raw === 'number') {
      const d = new Date(raw);
      if (!Number.isNaN(d.getTime())) return d;
    }
  } catch {
    /* fall through */
  }
  return new Date();
}

function isTaxableType(t: TaxType): t is 'standard10' | 'reduced8' {
  return t === 'standard10' || t === 'reduced8';
}

function methodLabel(method: ConsumptionTaxMethod): string {
  switch (method) {
    case 'special20pct':
      return '2割特例（小規模事業者の税額控除に関する経過措置）';
    case 'special30pct':
      return '3割特例（個人事業者の経過措置・令和9〜10年分）';
    case 'simplified':
      return '簡易課税';
    default:
      return '本則課税（一般課税）';
  }
}

function salesBuckets(journals: JournalEntry[]): {
  standard: number;
  reduced: number;
  export: number;
  exempt: number;
} {
  let standard = 0;
  let reduced = 0;
  let exportSales = 0;
  let exempt = 0;
  for (const j of journals) {
    if (j.creditAccount !== 'SALES' && j.creditAccount !== 'OTHER_INCOME') continue;
    const amount = j.creditAmount;
    if (j.taxType === 'standard10') standard += amount;
    else if (j.taxType === 'reduced8') reduced += amount;
    else if (j.taxType === 'export') exportSales += amount;
    else exempt += amount;
  }
  return { standard, reduced, export: exportSales, exempt };
}

function salesTaxFromInclusive(standardIncl: number, reducedIncl: number): {
  national: number;
  local: number;
} {
  const s = calcSalesTaxStandard(standardIncl, 'standard10');
  const r = calcSalesTaxStandard(reducedIncl, 'reduced8');
  return {
    national: s.nationalTax + r.nationalTax,
    local: s.localTax + r.localTax,
  };
}

function purchaseDeduction(journals: JournalEntry[]): number {
  let total = 0;
  for (const j of journals) {
    if (!isTaxableType(j.taxType)) continue;
    const isPurchase =
      j.debitAccount !== 'SALES' &&
      j.debitAccount !== 'OTHER_INCOME' &&
      j.creditAccount !== 'SALES' &&
      j.creditAccount !== 'OTHER_INCOME';
    if (!isPurchase) continue;

    const date = journalDate(j);
    const tax = j.taxAmount || extractTaxAmount(j.debitAmount, j.taxType);

    if (j.isQualifiedInvoice || isSmallAmountExempt(date, j.debitAmount)) {
      total += tax;
      continue;
    }
    const ratio = j.exemptSellerRatio ?? getExemptSellerRatio(date);
    total += Math.floor((tax * ratio) / 100);
  }
  return total;
}

function payableForMethod(
  method: ConsumptionTaxMethod,
  salesNational: number,
  salesLocal: number,
  purchaseTax: number,
  simplifiedType: 1 | 2 | 3 | 4 | 5 | 6
): { national: number; local: number } {
  if (method === 'special20pct') {
    const deductible = Math.floor(salesNational * 0.8);
    const national = Math.max(0, salesNational - deductible);
    const local = Math.floor(national * (22 / 78));
    return { national, local };
  }
  if (method === 'special30pct') {
    const deductible = Math.floor(salesNational * 0.7);
    const national = Math.max(0, salesNational - deductible);
    const local = Math.floor(national * (22 / 78));
    return { national, local };
  }
  if (method === 'simplified') {
    const ratio = SIMPLIFIED_PURCHASE_RATIO[simplifiedType];
    const deductible = Math.floor(salesNational * ratio);
    const national = Math.max(0, salesNational - deductible);
    const local = Math.floor(national * (22 / 78));
    return { national, local };
  }
  const national = Math.max(0, salesNational - purchaseTax);
  const localRatio = salesNational > 0 ? salesLocal / salesNational : 22 / 78;
  const local = Math.floor(national * localRatio);
  return { national, local };
}

export function calcConsumptionTaxReturn(params: {
  fiscalYear: number;
  journals: JournalEntry[];
  method: ConsumptionTaxMethod;
  simplifiedBusinessType?: 1 | 2 | 3 | 4 | 5 | 6;
  consumptionTaxStatus: 'taxable' | 'exempt';
}): ConsumptionTaxReturn {
  const notes: string[] = [];
  const simplifiedType = params.simplifiedBusinessType ?? 5;
  const buckets = salesBuckets(params.journals);
  const sales = salesTaxFromInclusive(buckets.standard, buckets.reduced);
  const purchaseTax = purchaseDeduction(params.journals);

  if (params.consumptionTaxStatus === 'exempt') {
    notes.push('免税事業者のため消費税の申告・納付義務はありません。');
    return {
      fiscalYear: params.fiscalYear,
      method: params.method,
      methodLabel: '免税事業者',
      taxableSalesIncl: buckets.standard,
      reducedSalesIncl: buckets.reduced,
      exportSales: buckets.export,
      exemptSales: buckets.exempt,
      salesNationalTax: 0,
      salesLocalTax: 0,
      deductibleNationalTax: 0,
      nationalTax: 0,
      localTax: 0,
      totalPayable: 0,
      notes,
      eligibleMethods: [],
    };
  }

  let method = params.method;
  if (method === 'special20pct' && !isSpecial20PctYear(params.fiscalYear)) {
    notes.push('2割特例は令和8年分（2026年分）までです。本則課税で再計算しました。');
    method = isSpecial30PctYear(params.fiscalYear) ? 'special30pct' : 'standard';
  }
  if (method === 'special30pct' && !isSpecial30PctYear(params.fiscalYear)) {
    notes.push('3割特例は令和9・10年分（2027・2028年分）の個人事業者向け経過措置です。');
    method = isSpecial20PctYear(params.fiscalYear) ? 'special20pct' : 'standard';
  }

  if (isSpecial20PctYear(params.fiscalYear)) {
    notes.push('個人事業者の2割特例は令和8年分まで適用できます（届出不要・申告時選択）。');
  }
  if (isSpecial30PctYear(params.fiscalYear)) {
    notes.push('個人事業者の3割特例は令和9・10年分の時限措置です（届出不要・申告時選択）。');
  }
  if (params.fiscalYear === 2026) {
    notes.push('令和9年分から簡易課税を使う場合は、原則として2026年12月31日までに選択届出が必要です。');
  }

  const result = payableForMethod(method, sales.national, sales.local, purchaseTax, simplifiedType);

  const candidates: ConsumptionTaxMethod[] = ['standard', 'simplified'];
  if (isSpecial20PctYear(params.fiscalYear)) candidates.push('special20pct');
  if (isSpecial30PctYear(params.fiscalYear)) candidates.push('special30pct');

  const eligibleMethods = candidates.map((m) => {
    const p = payableForMethod(m, sales.national, sales.local, purchaseTax, simplifiedType);
    return { method: m, label: methodLabel(m), payable: p.national + p.local };
  });

  return {
    fiscalYear: params.fiscalYear,
    method,
    methodLabel: methodLabel(method),
    taxableSalesIncl: buckets.standard,
    reducedSalesIncl: buckets.reduced,
    exportSales: buckets.export,
    exemptSales: buckets.exempt,
    salesNationalTax: sales.national,
    salesLocalTax: sales.local,
    deductibleNationalTax:
      method === 'standard' ? purchaseTax : sales.national - result.national,
    nationalTax: result.national,
    localTax: result.local,
    totalPayable: result.national + result.local,
    notes,
    eligibleMethods,
  };
}
