import type { PriceMode, TaxType } from '@/types';

/** 明細入力用の税処理（内税/外税と税率を1つにまとめる） */
export type TaxTreatment =
  | 'exclusive_10'
  | 'inclusive_10'
  | 'exclusive_8'
  | 'inclusive_8'
  | 'exempt'
  | 'non_taxable'
  | 'export';

export const TAX_TREATMENT_OPTIONS: Array<{ value: TaxTreatment; label: string }> = [
  { value: 'exclusive_10', label: '外税 10%' },
  { value: 'inclusive_10', label: '内税 10%' },
  { value: 'exclusive_8', label: '外税 8%' },
  { value: 'inclusive_8', label: '内税 8%' },
  { value: 'exempt', label: '非課税' },
  { value: 'non_taxable', label: '不課税' },
  { value: 'export', label: '免税（輸出）' },
];

export function toTaxTreatment(taxType: TaxType, priceMode: PriceMode = 'exclusive'): TaxTreatment {
  if (taxType === 'standard10') {
    return priceMode === 'inclusive' ? 'inclusive_10' : 'exclusive_10';
  }
  if (taxType === 'reduced8') {
    return priceMode === 'inclusive' ? 'inclusive_8' : 'exclusive_8';
  }
  if (taxType === 'exempt') return 'exempt';
  if (taxType === 'export') return 'export';
  return 'non_taxable';
}

export function parseTaxTreatment(value: TaxTreatment): {
  taxType: TaxType;
  priceMode: PriceMode;
} {
  switch (value) {
    case 'exclusive_10':
      return { taxType: 'standard10', priceMode: 'exclusive' };
    case 'inclusive_10':
      return { taxType: 'standard10', priceMode: 'inclusive' };
    case 'exclusive_8':
      return { taxType: 'reduced8', priceMode: 'exclusive' };
    case 'inclusive_8':
      return { taxType: 'reduced8', priceMode: 'inclusive' };
    case 'exempt':
      return { taxType: 'exempt', priceMode: 'exclusive' };
    case 'export':
      return { taxType: 'export', priceMode: 'exclusive' };
    default:
      return { taxType: 'non_taxable', priceMode: 'exclusive' };
  }
}

export function taxTreatmentLabel(taxType: TaxType, priceMode: PriceMode = 'exclusive'): string {
  const found = TAX_TREATMENT_OPTIONS.find(
    (opt) => opt.value === toTaxTreatment(taxType, priceMode)
  );
  return found?.label ?? '外税 10%';
}
