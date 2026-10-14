import type { DepreciationMethod, FixedAsset } from '@/types';

/** 平成19年4月1日以後取得の定額法償却率（旧定額法ではない） */
export const STRAIGHT_LINE_RATES: Record<number, number> = {
  2: 0.5,
  3: 0.334,
  4: 0.25,
  5: 0.2,
  6: 0.167,
  7: 0.143,
  8: 0.125,
  9: 0.112,
  10: 0.1,
  12: 0.084,
  15: 0.067,
  20: 0.05,
  24: 0.042,
};

export function straightLineRate(usefulLifeYears: number): number {
  if (STRAIGHT_LINE_RATES[usefulLifeYears]) return STRAIGHT_LINE_RATES[usefulLifeYears];
  return Math.round((1 / usefulLifeYears) * 1000) / 1000;
}

export interface AssetYearDepreciation {
  assetId: string;
  name: string;
  method: DepreciationMethod;
  acquisitionCost: number;
  businessCost: number;
  ordinaryAmount: number;
  deductibleAmount: number;
  bookValueAfter: number;
  note: string;
}

export interface DepreciationSummary {
  fiscalYear: number;
  items: AssetYearDepreciation[];
  totalDeductible: number;
  immediateUsed: number;
  immediateRemaining: number;
}

const IMMEDIATE_LIMIT = 300_000;
const IMMEDIATE_ANNUAL_CAP = 3_000_000;

function monthsInService(acquiredOn: string, fiscalYear: number): number {
  const d = new Date(acquiredOn);
  if (Number.isNaN(d.getTime())) return 12;
  if (d.getFullYear() < fiscalYear) return 12;
  if (d.getFullYear() > fiscalYear) return 0;
  return 13 - (d.getMonth() + 1);
}

function businessCost(asset: FixedAsset): number {
  const ratio = Math.min(100, Math.max(0, asset.businessUseRatio ?? 100)) / 100;
  return Math.floor(asset.acquisitionCost * ratio);
}

/**
 * 個人事業主の減価償却（原則・定額法）。
 * - 10万円未満: 消耗品（即時）
 * - 10万円以上20万円未満: 一括償却（3年均等）または通常償却
 * - 30万円未満かつ青色: 少額減価償却資産（年間合計300万円まで）
 */
export function calcDepreciationForYear(
  fiscalYear: number,
  assets: FixedAsset[],
  isBlueFiler: boolean
): DepreciationSummary {
  const items: AssetYearDepreciation[] = [];
  let immediateUsed = 0;

  for (const asset of assets) {
    if (asset.isDisposed) continue;
    const acquired = new Date(asset.acquiredOn);
    if (Number.isNaN(acquired.getTime()) || acquired.getFullYear() > fiscalYear) continue;

    const cost = businessCost(asset);
    const months = monthsInService(asset.acquiredOn, fiscalYear);
    if (months <= 0) continue;

    let method = asset.method;
    let ordinary = 0;
    let note = '';

    if (method === 'none' || cost < 100_000) {
      if (acquired.getFullYear() === fiscalYear) {
        ordinary = cost;
        method = 'immediate';
        note = '取得価額10万円未満のため消耗品費（必要経費算入）';
      } else {
        continue;
      }
    } else if (method === 'immediate') {
      if (!isBlueFiler) {
        note = '白色申告のため少額減価償却資産の特例は使えません。定額法で計算します。';
        method = 'straight_line';
      } else if (asset.acquisitionCost >= IMMEDIATE_LIMIT) {
        note = '取得価額30万円以上のため特例対象外。定額法で計算します。';
        method = 'straight_line';
      } else if (acquired.getFullYear() !== fiscalYear) {
        continue;
      } else if (immediateUsed + cost > IMMEDIATE_ANNUAL_CAP) {
        note = '少額減価償却資産の年間上限300万円を超えるため定額法で計算します。';
        method = 'straight_line';
      } else {
        ordinary = cost;
        immediateUsed += cost;
        note = '少額減価償却資産の特例（青色・30万円未満）';
      }
    }

    if (method === 'lump_sum') {
      if (asset.acquisitionCost < 100_000 || asset.acquisitionCost >= 200_000) {
        note = '一括償却は取得価額10万円以上20万円未満が対象です。定額法で計算します。';
        method = 'straight_line';
      } else {
        const yearIndex = fiscalYear - acquired.getFullYear();
        if (yearIndex >= 0 && yearIndex < 3) {
          ordinary = Math.floor(cost / 3);
          note = `一括償却資産（3年均等） ${yearIndex + 1}/3年目`;
        } else {
          continue;
        }
      }
    }

    if (method === 'straight_line') {
      const rate = straightLineRate(asset.usefulLifeYears);
      const annual = Math.floor(cost * rate);
      ordinary = Math.floor((annual * months) / 12);
      const remaining = Math.max(1, cost - asset.accumulatedDepreciation);
      ordinary = Math.min(ordinary, remaining - 1 > 0 ? remaining - 1 : remaining);
      note = note || `定額法 耐用年数${asset.usefulLifeYears}年 償却率${rate}（使用月数${months}）`;
    }

    const bookValueAfter = Math.max(0, cost - asset.accumulatedDepreciation - ordinary);

    items.push({
      assetId: asset.id,
      name: asset.name,
      method,
      acquisitionCost: asset.acquisitionCost,
      businessCost: cost,
      ordinaryAmount: ordinary,
      deductibleAmount: ordinary,
      bookValueAfter,
      note,
    });
  }

  const totalDeductible = items.reduce((s, i) => s + i.deductibleAmount, 0);
  return {
    fiscalYear,
    items,
    totalDeductible,
    immediateUsed,
    immediateRemaining: Math.max(0, IMMEDIATE_ANNUAL_CAP - immediateUsed),
  };
}

export const USEFUL_LIFE_PRESETS = [
  { label: '工具・器具（パソコン等） 4年', years: 4 },
  { label: '事務机・椅子 8年', years: 8 },
  { label: '車両（普通車） 6年', years: 6 },
  { label: '建物附属設備 15年', years: 15 },
  { label: 'ソフトウェア 5年', years: 5 },
  { label: '建物（木造事務所） 24年', years: 24 },
];
