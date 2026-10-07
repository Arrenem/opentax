import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ docs: new Map<string, Record<string, unknown>>(), serial: Promise.resolve(), id: 0 }));
vi.mock('firebase-admin/firestore', () => {
  class Ref {
    id: string;
    constructor(public path: string) { this.id = path.split('/').at(-1)!; }
    collection(name: string) { return new Col(`${this.path}/${name}`); }
  }
  class Col {
    constructor(public path: string) {}
    doc(id?: string) { return new Ref(`${this.path}/${id ?? `id-${++state.id}`}`); }
  }
  const snapshot = (ref: Ref) => ({ exists: state.docs.has(ref.path), data: () => state.docs.get(ref.path), id: ref.id });
  const db = {
    collection: (name: string) => new Col(name),
    runTransaction: async <T>(fn: (tx: Record<string, (...args: any[]) => any>) => Promise<T>) => {
      let release!: () => void;
      const turn = new Promise<void>((resolve) => { release = resolve; });
      const prior = state.serial;
      state.serial = turn;
      await prior;
      const writes: Array<() => void> = [];
      const tx = {
        get: async (ref: Ref) => snapshot(ref),
        getAll: async (...refs: Ref[]) => refs.map(snapshot),
        set: (ref: Ref, data: Record<string, unknown>) => writes.push(() => state.docs.set(ref.path, data)),
        create: (ref: Ref, data: Record<string, unknown>) => writes.push(() => {
          if (state.docs.has(ref.path)) throw new Error('Already exists'); state.docs.set(ref.path, data);
        }),
        update: (ref: Ref, data: Record<string, unknown>) => writes.push(() => {
          const prev = state.docs.get(ref.path);
          if (!prev) throw new Error('Not found');
          const patch = Object.fromEntries(Object.entries(data).map(([key, value]) => [key,
            value && typeof value === 'object' && '__arrayUnion' in value
              ? Array.from(new Set([...(prev[key] as string[] ?? []), ...(value.__arrayUnion as string[])]))
              : value && typeof value === 'object' && '__arrayRemove' in value
                ? (prev[key] as string[] ?? []).filter((id) => !(value.__arrayRemove as string[]).includes(id)) : value]));
          state.docs.set(ref.path, { ...prev, ...patch });
        }),
      };
      try { const result = await fn(tx); writes.forEach((write) => write()); return result; }
      finally { release(); }
    },
  };
  return { getFirestore: () => db,
    FieldValue: { serverTimestamp: () => 'now', delete: () => undefined, arrayUnion: (...ids: string[]) => ({ __arrayUnion: ids }), arrayRemove: (...ids: string[]) => ({ __arrayRemove: ids }) },
    Timestamp: { fromDate: (date: Date) => ({ toDate: () => date }) },
  };
});
// Synthetic editorial examples only. Firestore is replaced by the in-memory
// adapter above; these tests cannot write to an account or contact an AI service.
import { createJournal, createJournalBatch, confirmJournals, updateJournal } from './service';
import { assertReviewComplete, pendingCount } from '@/lib/domain/reports/service';
import { buildBS, buildPL } from '@/lib/accounting/reports';
import { DEFAULT_USER_SETTINGS, type AccountCode, type JournalEntry } from '@/types';
import type { AuthContext } from '@/lib/auth/authenticateRequest';

const agent: AuthContext = { userId: 'article-demo', actorType: 'agent', actorId: 'synthetic-agent', scopes: ['read', 'journals:write'] };
const user: AuthContext = { userId: 'article-demo', actorType: 'user', actorId: 'article-demo', scopes: [] };
const settings = { ...DEFAULT_USER_SETTINGS, filingType: 'white' as const, communicationRatio: 100 };
const journals = () => Array.from(state.docs.entries()).filter(([path]) => path.includes('/journals/')).map(([, data]) => data as unknown as JournalEntry);
const audit = () => Array.from(state.docs.entries()).filter(([path]) => path.includes('/auditLog/')).map(([, data]) => data);
const input = (id: string, debitAccount: AccountCode, creditAccount: AccountCode, amount: number, date = '2026-09-03') => ({
  transactionDate: date, debitAccount, debitAmount: amount, creditAccount, creditAmount: amount,
  counterparty: '架空の取引先', description: `記事の架空取引 ${id}`, taxType: 'non_taxable', taxIncluded: true,
  sourceType: 'manual', sourceReference: id, idempotencyKey: `article-demo:${id}`,
});
// The non_taxable fixture value keeps consumption-tax calculation outside this
// bookkeeping example. It is not advice about the tax treatment of any purchase.

beforeEach(() => { state.docs.clear(); state.serial = Promise.resolve(); state.id = 0; });

describe('article workflows using the real journal and report services', () => {
  it('AI workflow: six pending entries, a corrected receivable, one retry and user confirmation', async () => {
    const entries = [
      input('T01', 'SUPPLIES', 'CASH', 2000),
      input('T02', 'BANK', 'SALES', 50000), // deliberately wrong candidate
      input('T03', 'COMMUNICATION', 'ACCRUED_EXPENSES', 3000),
      input('T04', 'ACCRUED_EXPENSES', 'BANK', 3000),
      input('T05', 'TRAVEL', 'OWNER_CONTRIBUTIONS', 1000),
      input('T06', 'OWNER_DRAWS', 'BANK', 20000),
    ];
    const results = await createJournalBatch(agent, entries);
    expect(results.map((r) => r.status)).toEqual(Array(6).fill('created'));
    expect(pendingCount(journals())).toBe(6);
    expect(buildPL(journals(), 2026, settings).sales).toBe(50000); // balanced is not necessarily correct
    await updateJournal(agent, results[1].journalId!, { creditAccount: 'ACCOUNTS_RECEIVABLE' }, '請求時に売上計上済みのため、売掛金回収へ修正');
    expect(audit().find((a) => a.reason === '請求時に売上計上済みのため、売掛金回収へ修正')).toMatchObject({
      previousValues: { creditAccount: 'SALES' }, newValues: { creditAccount: 'ACCOUNTS_RECEIVABLE' },
    });
    // T07–T09 are held outside OpenTax until their missing facts are known.
    // T10 is a resend of the same T01 payload and idempotency key.
    expect(await createJournal(agent, entries[0])).toEqual({ status: 'existing', journalId: results[0].journalId });
    expect(journals()).toHaveLength(6);
    expect(journals().reduce((n, j) => n + j.debitAmount, 0)).toBe(79000);
    expect(journals().reduce((n, j) => n + j.creditAmount, 0)).toBe(79000);
    expect(buildPL(journals(), 2026, settings)).toMatchObject({ sales: 0, totalExpenses: 6000 });
    const bankChange = journals().reduce((n, j) => n + (j.debitAccount === 'BANK' ? j.debitAmount : 0) - (j.creditAccount === 'BANK' ? j.creditAmount : 0), 0);
    expect(bankChange).toBe(27000);
    const ids = results.map((r) => r.journalId!);
    await expect(confirmJournals(agent, ids, 'AIから確定')).rejects.toThrow('USER_REQUIRED');
    expect(() => assertReviewComplete(journals())).toThrow('6 pending journals require review');
    await confirmJournals(user, ids, '架空資料と支払元・計上済み取引を確認');
    expect(pendingCount(journals())).toBe(0);
    expect(journals().every((j) => j.status === 'confirmed')).toBe(true);
    expect(() => assertReviewComplete(journals())).not.toThrow();
  });

  it('bank CSV workflow: five structured requests reconcile to 125,000 yen and do not duplicate on retry', async () => {
    const opening = [input('opening-bank', 'BANK', 'CAPITAL', 100000, '2026-08-31'),
      input('opening-receivable', 'ACCOUNTS_RECEIVABLE', 'CAPITAL', 50000, '2026-08-31'),
      input('opening-payable', 'CAPITAL', 'ACCRUED_EXPENSES', 12000, '2026-08-31')];
    for (const j of opening) await createJournal(user, j);
    const rows = [
      input('demo-bank-a:2026-09:001', 'BANK', 'ACCOUNTS_RECEIVABLE', 50000),
      input('demo-bank-a:2026-09:002', 'ACCRUED_EXPENSES', 'BANK', 12000, '2026-09-05'),
      input('demo-bank-a:2026-09:003', 'OWNER_DRAWS', 'BANK', 20000, '2026-09-10'),
      input('demo-bank-a:2026-09:004', 'COMMUNICATION', 'BANK', 3000, '2026-09-18'),
      input('demo-bank-a:2026-09:005', 'BANK', 'OWNER_CONTRIBUTIONS', 10000, '2026-09-25'),
    ].map((j) => ({ ...j, sourceType: 'bank', idempotencyKey: j.sourceReference }));
    const results = await createJournalBatch(agent, rows);
    expect(results.map((r) => r.status)).toEqual(Array(5).fill('created'));
    expect(pendingCount(journals())).toBe(5);
    const repeated = await createJournalBatch(agent, rows);
    expect(repeated.map((r) => r.status)).toEqual(Array(5).fill('existing'));
    expect(repeated.map((r) => r.journalId)).toEqual(results.map((r) => r.journalId));
    expect(journals()).toHaveLength(8); // three opening entries plus five bank rows
    await expect(createJournal(agent, { ...rows[0], debitAmount: 51000, creditAmount: 51000 })).rejects.toThrow('IDEMPOTENCY_CONFLICT');
    await confirmJournals(user, results.map((r) => r.journalId!), '5行を原本・請求書・カード未払金と照合');
    expect(pendingCount(journals())).toBe(0);
    expect(buildBS(journals(), 2026)).toMatchObject({ assets: { current: { BANK: 125000, ACCOUNTS_RECEIVABLE: 0 } }, liabilities: { items: { ACCRUED_EXPENSES: 0 } } });
    expect(buildPL(journals(), 2026, settings)).toMatchObject({ sales: 0, totalExpenses: 3000 });
    expect(journals().filter((j) => j.fiscalMonth === 9 && j.debitAccount === 'BANK').reduce((n, j) => n + j.debitAmount, 0)).toBe(60000);
    expect(journals().filter((j) => j.fiscalMonth === 9 && j.creditAccount === 'BANK').reduce((n, j) => n + j.creditAmount, 0)).toBe(35000);
  });

  it('freee alternatives: invoice, next-month settlement and personal reimbursement retain sales of 30,000 yen', async () => {
    const results = await createJournalBatch(agent, [input('sale', 'ACCOUNTS_RECEIVABLE', 'SALES', 30000, '2026-08-31'),
      input('settlement', 'BANK', 'ACCOUNTS_RECEIVABLE', 30000),
      input('personal-supplies', 'SUPPLIES', 'OWNER_CONTRIBUTIONS', 2000)]);
    expect(pendingCount(journals())).toBe(3);
    await confirmJournals(user, results.map((r) => r.journalId!), '比較用の3取引を確認');
    expect(buildPL(journals(), 2026, settings)).toMatchObject({ sales: 30000, totalExpenses: 2000 });
    expect(buildBS(journals(), 2026)).toMatchObject({ assets: { current: { BANK: 30000, ACCOUNTS_RECEIVABLE: 0 } }, liabilities: { items: { OWNER_CONTRIBUTIONS: 2000 } } });
  });

  it('rejects an unbalanced amount while a balanced wrong account still requires review', async () => {
    await expect(createJournal(agent, { ...input('invalid', 'SUPPLIES', 'CASH', 2000), creditAmount: 1999 })).rejects.toThrow('UNBALANCED_JOURNAL');
    expect(journals()).toHaveLength(0);
  });
});
