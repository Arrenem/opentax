import { describe, expect, it } from 'vitest';
import { validateJournalInput, normalizeJournal } from './service';
import { assertReviewComplete, pendingCount } from '@/lib/domain/reports/service';
import type { JournalEntry } from '@/types';

const valid = {
  transactionDate: '2026-09-29', debitAccount: 'SUPPLIES', debitAmount: 1100,
  creditAccount: 'BANK', creditAmount: 1100, counterparty: 'Vendor', description: 'Paper',
  taxType: 'standard10', taxIncluded: true,
};
describe('journal validation', () => {
  it('accepts a balanced journal and derives fiscal period and tax', () => {
    const parsed = validateJournalInput({ ...valid, fiscalYear: 1999, fiscalMonth: 2, taxAmount: 999, status: 'confirmed' });
    expect(parsed).toMatchObject({ fiscalYear: 2026, fiscalMonth: 9, taxAmount: 100 });
    expect(parsed).not.toHaveProperty('status');
  });
  it('calculates tax for tax-exclusive entries on the server', () => {
    expect(validateJournalInput({ ...valid, taxIncluded: false, debitAmount: 1000, creditAmount: 1000 }).taxAmount).toBe(100);
  });
  it.each([
    [{ ...valid, debitAmount: 900 }, 'UNBALANCED_JOURNAL'],
    [{ ...valid, creditAmount: Infinity }, 'UNBALANCED_JOURNAL'],
    [{ ...valid, debitAccount: 'NOT_AN_ACCOUNT' }, 'INVALID_ACCOUNT'],
    [{ ...valid, taxType: 'invented' }, 'INVALID_TAX_TYPE'],
    [{ ...valid, sourceType: 'invented' }, 'INVALID_SOURCE_TYPE'],
    [{ ...valid, transactionDate: '2026-02-30' }, 'INVALID_DATE'],
  ])('rejects invalid fields with a structured code', (input, code) => {
    expect(() => validateJournalInput(input)).toThrowError(code as string);
  });
  it('treats legacy auto as pending for reads and export guard', () => {
    const legacy = { status: 'auto' } as JournalEntry;
    expect(normalizeJournal(legacy).status).toBe('pending');
    expect(pendingCount([legacy])).toBe(1);
    expect(() => assertReviewComplete([legacy])).toThrowError('pending journals require review');
    expect(() => assertReviewComplete([{ status: 'confirmed' } as JournalEntry])).not.toThrow();
  });
});
