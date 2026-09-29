import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ docs: new Map<string, Record<string, unknown>>(), id: 0 }));
vi.mock('firebase-admin/firestore', () => {
  class Ref {
    id: string;
    constructor(public path: string) { this.id = path.split('/').at(-1)!; }
    collection(name: string) { return new Col(`${this.path}/${name}`); }
    get = async () => ({ id: this.id, exists: state.docs.has(this.path), data: () => state.docs.get(this.path) });
    update = async (data: Record<string, unknown>) => { state.docs.set(this.path, { ...state.docs.get(this.path), ...data }); };
  }
  class Col {
    constructor(public path: string) {}
    doc(id?: string) { return new Ref(`${this.path}/${id ?? `id-${++state.id}`}`); }
    where() { return this; }
    limit() { return this; }
    get = async () => ({ docs: Array.from(state.docs.entries()).filter(([path]) => path.startsWith(`${this.path}/`))
      .map(([path, data]) => ({ id: path.split('/').at(-1), data: () => data })) });
  }
  const db = { collection: (name: string) => new Col(name),
    runTransaction: async (fn: (tx: Record<string, (...args: any[]) => any>) => Promise<unknown>) => fn({
      get: (ref: Ref) => ref.get(),
      set: (ref: Ref, data: Record<string, unknown>) => state.docs.set(ref.path, data),
      create: (ref: Ref, data: Record<string, unknown>) => state.docs.set(ref.path, data),
      update: (ref: Ref, data: Record<string, unknown>) => state.docs.set(ref.path, { ...state.docs.get(ref.path), ...data }),
    }) };
  return { getFirestore: () => db, FieldValue: { serverTimestamp: () => 'now' } };
});
import { createBillingDocument, deleteBillingDocument, updateBillingDocument } from './service';
import type { AuthContext } from '@/lib/auth/authenticateRequest';
const agent: AuthContext = { userId: 'u1', actorType: 'agent', actorId: 'a1', scopes: ['read', 'billing:write'] };
const input = { kind: 'invoice', projectId: 'p1', issueDate: '2026-09-29', status: 'draft',
  lineItems: [{ description: 'Consulting', quantity: 2, unitPrice: 1000, taxType: 'standard10', priceMode: 'exclusive' }],
  subtotal: 1, taxAmount: 1, totalAmount: 1, amountDue: 1 };
beforeEach(() => {
  state.docs.clear(); state.id = 0;
  state.docs.set('users/u1/projects/p1', { name: 'Project', customerId: 'c1', customerName: 'Client', isDeleted: false });
  state.docs.set('users/u1/customers/c1', { name: 'Client', isDeleted: false });
});
describe('billing draft service', () => {
  it('forces draft status and recalculates totals', async () => {
    const result = await createBillingDocument(agent, input);
    const saved = state.docs.get(`users/u1/issuedDocuments/${result.id}`)!;
    expect(saved).toMatchObject({ status: 'draft', subtotal: 2000, taxAmount: 200, totalAmount: 2200,
      amountDue: 2200, agentConnectionId: 'a1' });
    expect(Array.from(state.docs.values()).find((row) => row.entityId === result.id)).toMatchObject({ actorType: 'agent', actorId: 'a1' });
  });
  it('does not permit an agent to create or update sent and paid documents', async () => {
    await expect(createBillingDocument(agent, { ...input, status: 'paid' })).rejects.toThrow('STATUS_DENIED');
    const result = await createBillingDocument(agent, input);
    await expect(updateBillingDocument(agent, result.id, { status: 'sent' })).rejects.toThrow('STATUS_DENIED');
    state.docs.set(`users/u1/issuedDocuments/${result.id}`, { ...state.docs.get(`users/u1/issuedDocuments/${result.id}`), status: 'sent' });
    await expect(updateBillingDocument(agent, result.id, { title: 'Changed' })).rejects.toThrow('NOT_DRAFT');
  });
  it('moves a draft to another project and refreshes the customer', async () => {
    state.docs.set('users/u1/projects/p2', { name: 'Other', customerId: 'c2', isDeleted: false });
    state.docs.set('users/u1/customers/c2', { name: 'Other Client', address: 'Tokyo', isDeleted: false });
    const result = await createBillingDocument(agent, input);
    await updateBillingDocument(agent, result.id, { projectId: 'p2' });
    expect(state.docs.get(`users/u1/issuedDocuments/${result.id}`)).toMatchObject({ projectId: 'p2', projectName: 'Other',
      customerId: 'c2', customerName: 'Other Client', customerAddress: 'Tokyo' });
    await expect(updateBillingDocument(agent, result.id, { projectId: 'missing' })).rejects.toThrow('PROJECT_NOT_FOUND');
  });
  it('lets an agent delete only unposted drafts', async () => {
    const result = await createBillingDocument(agent, input);
    const path = `users/u1/issuedDocuments/${result.id}`;
    state.docs.set(path, { ...state.docs.get(path), status: 'issued' });
    await expect(deleteBillingDocument(agent, result.id)).rejects.toThrow('NOT_DRAFT');
    state.docs.set(path, { ...state.docs.get(path), status: 'draft', linkedJournalIds: ['j1'] });
    await expect(deleteBillingDocument(agent, result.id)).rejects.toThrow('NOT_DRAFT');
    state.docs.set(path, { ...state.docs.get(path), linkedJournalIds: [] });
    await deleteBillingDocument(agent, result.id);
    expect(state.docs.get(path)?.isDeleted).toBe(true);
  });
});
