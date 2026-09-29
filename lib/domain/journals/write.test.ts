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
import { createJournal, createJournalBatch, updateJournal, deleteJournal, updateJournalLinks } from './service';
import type { AuthContext } from '@/lib/auth/authenticateRequest';

const agent: AuthContext = { userId: 'owner-1', actorType: 'agent', actorId: 'connection-1', scopes: ['read', 'journals:write'] };
const valid = { transactionDate: '2026-09-29', debitAccount: 'SUPPLIES', debitAmount: 1100,
  creditAccount: 'BANK', creditAmount: 1100, counterparty: 'Vendor', description: 'Paper',
  taxType: 'standard10', taxIncluded: true };
const user: AuthContext = { userId: 'owner-1', actorType: 'user', actorId: 'owner-1', scopes: [] };
const journals = () => Array.from(state.docs.entries()).filter(([path]) => path.includes('/journals/'));

describe('journal writes', () => {
  beforeEach(() => { state.docs.clear(); state.serial = Promise.resolve(); state.id = 0; });
  it('creates pending agent entries with immutable metadata and an audit actor', async () => {
    const result = await createJournal(agent, { ...valid, id: 'forged', entryNumber: 1, fiscalYear: 1999 });
    const journal = state.docs.get(`users/owner-1/journals/${result.journalId}`)!;
    expect(journal).toMatchObject({ status: 'pending', entryOrigin: 'agent', agentConnectionId: 'connection-1',
      fiscalYear: 2026, fiscalMonth: 9, createdBy: 'connection-1' });
    expect(journal.id).not.toBe('forged');
    expect(journal.entryNumber).not.toBe(1);
    expect(Array.from(state.docs.values()).find((d) => d.journalId === result.journalId)).toMatchObject({ actorType: 'agent', actorId: 'connection-1' });
  });
  it('rejects an agent-supplied status', async () => {
    await expect(createJournal(agent, { ...valid, status: 'confirmed' })).rejects.toThrow('STATUS_DENIED');
    expect(journals()).toHaveLength(0);
  });
  it('returns an individual result when one batch item is invalid', async () => {
    const results = await createJournalBatch(agent, [valid, { ...valid, debitAmount: 99 }, { ...valid, description: 'Second' }]);
    expect(results.map((r) => r.status)).toEqual(['created', 'failed', 'created']);
    expect(journals()).toHaveLength(2);
  });
  it('deduplicates concurrent retries by key, not by matching date and amount', async () => {
    const [a, b] = await Promise.all([
      createJournal(agent, { ...valid, idempotencyKey: 'bank-row-1' }),
      createJournal(agent, { ...valid, idempotencyKey: 'bank-row-1' }),
    ]);
    expect([a.status, b.status].sort()).toEqual(['created', 'existing']);
    expect(a.journalId).toBe(b.journalId);
    await createJournal(agent, valid);
    expect(journals()).toHaveLength(2);
  });
  it('links and unlinks same-user evidence when a pending journal changes', async () => {
    state.docs.set('users/owner-1/documents/own', { uploadedBy: 'owner-1', isDeleted: false, linkedJournalIds: [] });
    const created = await createJournal(agent, { ...valid, evidenceIds: ['own'] });
    expect(state.docs.get('users/owner-1/documents/own')?.linkedJournalIds).toEqual([created.journalId]);
    await updateJournal(agent, created.journalId, { evidenceIds: [] }, 'Evidence changed');
    expect(state.docs.get('users/owner-1/documents/own')?.linkedJournalIds).toEqual([]);
  });
  it('rejects cross-user evidence links and protects confirmed entries', async () => {
    state.docs.set('users/owner-2/documents/foreign', { uploadedBy: 'owner-2', isDeleted: false });
    await expect(createJournal(agent, { ...valid, evidenceIds: ['foreign'] })).rejects.toThrow('EVIDENCE_NOT_FOUND');
    const created = await createJournal(agent, valid);
    const path = `users/owner-1/journals/${created.journalId}`;
    state.docs.set(path, { ...state.docs.get(path), status: 'confirmed' });
    await expect(updateJournal(agent, created.journalId, { description: 'Changed' }, 'reason')).rejects.toThrow('CONFIRMED_JOURNAL');
    await expect(deleteJournal(agent, created.journalId, 'reason')).rejects.toThrow('CONFIRMED_JOURNAL');
  });
  it('changes evidence and billing links on both sides with an audit entry', async () => {
    state.docs.set('users/owner-1/documents/a', { uploadedBy: 'owner-1', isDeleted: false, linkedJournalIds: [] });
    state.docs.set('users/owner-1/documents/b', { uploadedBy: 'owner-1', isDeleted: false, linkedJournalIds: [] });
    state.docs.set('users/owner-1/issuedDocuments/inv', { isDeleted: false, linkedJournalIds: [], postedToAccounting: true });
    const created = await createJournal(agent, { ...valid, evidenceIds: ['a'] });
    await updateJournalLinks(agent, created.journalId, { evidenceIds: ['b'], issuedDocumentId: 'inv' }, 'Matched receipt');
    const path = `users/owner-1/journals/${created.journalId}`;
    expect(state.docs.get(path)).toMatchObject({ evidenceIds: ['b'], sourceDocumentId: 'inv', version: 2 });
    expect(state.docs.get('users/owner-1/documents/a')?.linkedJournalIds).toEqual([]);
    expect(state.docs.get('users/owner-1/documents/b')?.linkedJournalIds).toEqual([created.journalId]);
    expect(state.docs.get('users/owner-1/issuedDocuments/inv')?.linkedJournalIds).toEqual([created.journalId]);
    expect(Array.from(state.docs.values()).find((d) => d.reason === 'Matched receipt')).toMatchObject({
      previousValues: { evidenceIds: ['a'], sourceDocumentId: null }, newValues: { evidenceIds: ['b'], sourceDocumentId: 'inv' } });
    await updateJournalLinks(user, created.journalId, { issuedDocumentId: null }, 'Wrong invoice');
    expect(state.docs.get(path)?.sourceDocumentId).toBeUndefined();
    expect(state.docs.get('users/owner-1/issuedDocuments/inv')).toMatchObject({ linkedJournalIds: [], postedToAccounting: false });
  });
  it('lets agents only add links on confirmed journals', async () => {
    state.docs.set('users/owner-1/documents/a', { uploadedBy: 'owner-1', isDeleted: false, linkedJournalIds: [] });
    state.docs.set('users/owner-1/documents/b', { uploadedBy: 'owner-1', isDeleted: false, linkedJournalIds: [] });
    const created = await createJournal(agent, { ...valid, evidenceIds: ['a'] });
    const path = `users/owner-1/journals/${created.journalId}`;
    state.docs.set(path, { ...state.docs.get(path), status: 'confirmed' });
    await updateJournalLinks(agent, created.journalId, { evidenceIds: ['a', 'b'] }, 'Second receipt');
    expect(state.docs.get(path)?.evidenceIds).toEqual(['a', 'b']);
    await expect(updateJournalLinks(agent, created.journalId, { evidenceIds: ['b'] }, 'Remove')).rejects.toThrow('CONFIRMED_JOURNAL');
    await updateJournalLinks(user, created.journalId, { evidenceIds: ['b'] }, 'Remove');
    expect(state.docs.get('users/owner-1/documents/a')?.linkedJournalIds).toEqual([]);
  });
  it('rejects missing link targets and requires a reason', async () => {
    const created = await createJournal(agent, valid);
    await expect(updateJournalLinks(agent, created.journalId, { issuedDocumentId: 'missing' }, 'x')).rejects.toThrow('ISSUED_DOCUMENT_NOT_FOUND');
    await expect(updateJournalLinks(agent, created.journalId, { evidenceIds: ['missing'] }, 'x')).rejects.toThrow('EVIDENCE_NOT_FOUND');
    await expect(updateJournalLinks(agent, created.journalId, { evidenceIds: [] }, ' ')).rejects.toThrow('INVALID_UPDATE');
  });
  it('removes the billing link when a journal is deleted', async () => {
    state.docs.set('users/owner-1/issuedDocuments/inv', { isDeleted: false, linkedJournalIds: [], postedToAccounting: false });
    const created = await createJournal(agent, valid);
    await updateJournalLinks(agent, created.journalId, { issuedDocumentId: 'inv' }, 'link');
    await deleteJournal(agent, created.journalId, 'duplicate');
    expect(state.docs.get('users/owner-1/issuedDocuments/inv')?.linkedJournalIds).toEqual([]);
  });
});
