import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ records: new Map<string, Record<string, unknown>>(), files: new Map<string, Buffer>(), id: 0 }));
vi.mock('firebase-admin/firestore', () => {
  class Ref {
    id: string;
    constructor(public path: string) { this.id = path.split('/').at(-1)!; }
    collection(name: string) { return new Col(`${this.path}/${name}`); }
    get = async () => ({ exists: state.records.has(this.path), data: () => state.records.get(this.path) });
    set = async (data: Record<string, unknown>) => { state.records.set(this.path, data); };
  }
  class Col { constructor(public path: string) {} doc(id?: string) { return new Ref(`${this.path}/${id ?? `ev-${++state.id}`}`); } }
  return { getFirestore: () => ({ collection: (name: string) => new Col(name), runTransaction: async (run: (tx: {
      get: (ref: Ref) => Promise<{ exists: boolean; data: () => Record<string, unknown> | undefined }>;
      create: (ref: Ref, data: Record<string, unknown>) => void;
    }) => Promise<unknown>) => {
      const writes: Array<() => void> = [];
      const result = await run({ get: (ref) => ref.get(), create: (ref, data) => writes.push(() => { state.records.set(ref.path, data); }) });
      writes.forEach((write) => write());
      return result;
    } }),
    FieldValue: { serverTimestamp: () => 'now' }, Timestamp: { fromDate: (date: Date) => ({ toDate: () => date }) } };
});
vi.mock('firebase-admin/storage', () => ({ getStorage: () => ({ bucket: () => ({ file: (path: string) => ({
  save: async (buffer: Buffer) => { state.files.set(path, buffer); },
  delete: async () => { state.files.delete(path); },
  getSignedUrl: async () => [`https://example.test/${path}`],
}) }) }) }));
import { uploadEvidence } from './service';
import type { AuthContext } from '@/lib/auth/authenticateRequest';
const auth: AuthContext = { userId: 'owner', actorType: 'agent', actorId: 'agent', scopes: ['evidence:write'] };
beforeEach(() => { state.records.clear(); state.files.clear(); state.id = 0; });
describe('evidence storage', () => {
  it('uploads bytes and metadata without OCR fields or a local path', async () => {
    const form = new FormData();
    form.append('file', new File([new Uint8Array([1, 2, 3])], '../invoice.pdf', { type: 'application/pdf' }));
    form.append('documentType', 'invoice'); form.append('transactionDate', '2026-09-29');
    form.append('counterparty', 'Client'); form.append('amount', '1100'); form.append('sourceReference', 'batch-1');
    const result = await uploadEvidence(auth, form);
    const saved = state.records.get(`users/owner/documents/${result.id}`)!;
    expect(saved).toMatchObject({ documentType: 'invoice', counterparty: 'Client', amount: 1100,
      sourceReference: 'batch-1', fileName: `users/owner/documents/${result.id}` });
    expect(saved).not.toHaveProperty('ocrStatus');
    expect(saved).not.toHaveProperty('ocrRawText');
    expect(Array.from(state.records.values()).find((row) => row.entityId === result.id)).toMatchObject({ actorType: 'agent', actorId: 'agent' });
    expect(state.files.get(String(saved.fileName))).toEqual(Buffer.from([1, 2, 3]));
  });
  it('rejects unsupported files and foreign projects', async () => {
    const form = new FormData(); form.append('file', new File(['x'], 'data.csv', { type: 'text/csv' }));
    await expect(uploadEvidence(auth, form)).rejects.toThrow('UNSUPPORTED_FILE_TYPE');
    const pdf = new FormData(); pdf.append('file', new File(['%PDF'], 'a.pdf', { type: 'application/pdf' }));
    pdf.append('projectId', 'other-users-project');
    await expect(uploadEvidence(auth, pdf)).rejects.toThrow('PROJECT_NOT_FOUND');
  });
  it('returns the same evidence for a repeated idempotency key and rejects changed bytes', async () => {
    const makeForm = (bytes: number[]) => {
      const form = new FormData();
      form.append('file', new File([new Uint8Array(bytes)], 'invoice.pdf', { type: 'application/pdf' }));
      form.append('idempotencyKey', 'source-42');
      return form;
    };
    const first = await uploadEvidence(auth, makeForm([1, 2, 3]));
    const second = await uploadEvidence(auth, makeForm([1, 2, 3]));
    expect(second).toMatchObject({ id: first.id, status: 'existing' });
    expect(state.files.size).toBe(1);
    await expect(uploadEvidence(auth, makeForm([4, 5, 6]))).rejects.toThrow('IDEMPOTENCY_CONFLICT');
  });
});
