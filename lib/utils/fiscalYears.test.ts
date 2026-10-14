import { describe, expect, it } from 'vitest';
import { yearRange } from './fiscalYears';

describe('yearRange', () => {
  it('最古の仕訳年から現在年まで降順で返す', () => {
    expect(yearRange([2019, 2024], 2026)).toEqual([2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019]);
  });
  it('仕訳がなければ現在年のみ', () => {
    expect(yearRange([undefined, undefined], 2026)).toEqual([2026]);
  });
  it('未来年の仕訳も含める', () => {
    expect(yearRange([2025, 2027], 2026)).toEqual([2027, 2026, 2025]);
  });
});
