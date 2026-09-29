import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ docs: new Map<string, Record<string, unknown>>(), id: 0 }));
vi.mock('firebase-admin/firestore', () => {
  class Ref {
    id: string;
    constructor(public path: string) { this.id = path.split('/').at(-1)!; }
    collection(name: string) { return new Col(`${this.path}/${name}`); }
  }
  class Col { constructor(public path: string) {} doc(id?: string) { return new Ref(`${this.path}/${id ?? `id-${++state.id}`}`); } }
  const db = { collection: (name: string) => new Col(name),
    runTransaction: async (fn: (tx: Record<string, (...args: any[]) => any>) => Promise<unknown>) => {
      const writes: Array<() => void> = [];
      const result = await fn({
        get: async (ref: Ref) => ({ exists: state.docs.has(ref.path), data: () => state.docs.get(ref.path) }),
        create: (ref: Ref, data: Record<string, unknown>) => writes.push(() => state.docs.set(ref.path, data)),
        update: (ref: Ref, data: Record<string, unknown>) => writes.push(() => state.docs.set(ref.path, { ...state.docs.get(ref.path), ...data })),
      });
      writes.forEach((write) => write());
      return result;
    } };
  return { getFirestore: () => db, FieldValue: { serverTimestamp: () => 'now', delete: () => '__deleted' },
    Timestamp: { fromDate: (date: Date) => ({ iso: date.toISOString().slice(0, 10) }) } };
});
vi.mock('firebase-admin/storage', () => ({ getStorage: () => ({}) }));
import { deleteEvidence, updateEvidence } from './service';
import type { AuthContext } from '@/lib/auth/authenticateRequest';
const agent: AuthContext = { userId: 'owner', actorType: 'agent', actorId: 'agent', scopes: ['evidence:write'] };
const path = 'users/owner/documents/d1';
const audit = () => Array.from(state.docs.entries()).filter(([p]) => p.includes('/auditLog/')).map(([, d]) => d);

beforeEach(() => {
  state.docs.clear(); state.id = 0;
  state.docs.set(path, { documentType: 'other', counterparty: 'Old', amount: 500, linkedJournalIds: [], isDeleted: false });
  state.docs.set('users/owner/projects/p1', { name: 'Project', isDeleted: false });
});
describe('evidence edits', () => {
  it('updates metadata, clears values and records an audit entry', async () => {
    await updateEvidence(agent, 'd1', { documentType: 'receipt', counterparty: ' Shop ', transactionDate: '2026-09-01', amount: null, projectId: 'p1' });
    expect(state.docs.get(path)).toMatchObject({ documentType: 'receipt', counterparty: 'Shop', transactionDate: { iso: '2026-09-01' },
      amount: '__deleted', projectId: 'p1', updatedBy: 'agent' });
    expect(audit()[0]).toMatchObject({ entityType: 'documents', entityId: 'd1', operationType: 'UPDATE', actorType: 'agent',
      previousValues: expect.objectContaining({ counterparty: 'Old' }) });
  });
  it('rejects invalid fields, dates, amounts and unknown projects', async () => {
    await expect(updateEvidence(agent, 'd1', { fileName: 'x' })).rejects.toThrow('INVALID_EVIDENCE_FIELD');
    await expect(updateEvidence(agent, 'd1', { linkedJournalIds: [] })).rejects.toThrow('INVALID_EVIDENCE_FIELD');
    await expect(updateEvidence(agent, 'd1', { transactionDate: '2026-02-30' })).rejects.toThrow('INVALID_DATE');
    await expect(updateEvidence(agent, 'd1', { amount: -1 })).rejects.toThrow('INVALID_AMOUNT');
    await expect(updateEvidence(agent, 'd1', { projectId: 'missing' })).rejects.toThrow('PROJECT_NOT_FOUND');
    await expect(updateEvidence(agent, 'missing', { counterparty: 'x' })).rejects.toThrow('EVIDENCE_NOT_FOUND');
  });
  it('soft-deletes unlinked evidence with a reason and refuses linked evidence', async () => {
    await expect(deleteEvidence(agent, 'd1', '')).rejects.toThrow('REASON_REQUIRED');
    state.docs.set(path, { ...state.docs.get(path), linkedJournalIds: ['j1'] });
    await expect(deleteEvidence(agent, 'd1', 'duplicate')).rejects.toThrow('EVIDENCE_LINKED');
    state.docs.set(path, { ...state.docs.get(path), linkedJournalIds: [] });
    await deleteEvidence(agent, 'd1', 'duplicate');
    expect(state.docs.get(path)?.isDeleted).toBe(true);
    expect(audit()[0]).toMatchObject({ operationType: 'DELETE', reason: 'duplicate' });
  });
});
