import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
const state = vi.hoisted(() => ({ records: new Map<string, Record<string, unknown>>(), tail: Promise.resolve() }));
vi.mock('firebase-admin/firestore', async (original) => {
  const actual = await original<typeof import('firebase-admin/firestore')>();
  const ref = (path: string): unknown => ({ path,
    collection: (name: string) => ({ doc: (id: string) => ref(`${path}/${name}/${id}`) }),
    get: async () => ({ data: () => state.records.get(path) }),
  });
  return { ...actual, getFirestore: () => ({
    collection: (name: string) => ({ doc: (id: string) => ref(`${name}/${id}`) }),
    runTransaction: async (work: (tx: unknown) => Promise<unknown>) => {
      let release!: () => void; const before = state.tail;
      state.tail = new Promise<void>((resolve) => { release = resolve; }); await before;
      try {
        const writes: Array<() => void> = [];
        const result = await work({ get: (r: { get: () => unknown }) => r.get(),
          set: (r: { path: string }, data: Record<string, unknown>) => writes.push(() => state.records.set(r.path, data)) });
        writes.forEach((write) => write()); return result;
      } finally { release(); }
    },
  }) };
});
vi.mock('@/lib/auth/authenticateRequest', async (original) => {
  const actual = await original<typeof import('@/lib/auth/authenticateRequest')>();
  return { ...actual, authenticateRequest: async () => ({ userId: 'owner', actorType: 'user', actorId: 'owner', scopes: [] }) };
});
import { NextRequest } from 'next/server';
import { PUT as settingsPut } from '@/app/api/settings/route';
import { PUT as deductionsPut } from '@/app/api/deductions/route';
import { POST as issuedPost } from '@/app/api/issued-documents/route';
import { getFirestore } from 'firebase-admin/firestore';
import { acquireLedgerMaintenance, assertLedgerMaintenance, releaseLedgerMaintenance, withLedgerWrite } from './writeGate';
import * as assets from '@/lib/domain/assets/service';
import * as billing from '@/lib/domain/billing/service';
import * as customers from '@/lib/domain/customers/service';
import * as evidence from '@/lib/domain/evidence/service';
import * as journals from '@/lib/domain/journals/service';
import * as projects from '@/lib/domain/projects/service';
import * as settings from '@/lib/domain/settings/service';
import { idempotentCreate } from '@/lib/domain/idempotency';
import { readFileSync } from 'node:fs';
const path = 'users/owner/_maintenance/ledger';
let db: Firestore;
beforeEach(() => { state.records.clear(); state.tail = Promise.resolve(); db = getFirestore(); });
describe('persistent ledger write exclusion', () => {
  it('blocks new writes and drains in-flight work including rollback before snapshot', async () => {
    let finish!: () => void; let entered!: () => void;
    const started = new Promise<void>((r) => { entered = r; });
    const waiting = new Promise<void>((r) => { finish = r; });
    const writing = withLedgerWrite('owner', async () => { entered(); await waiting; }, db);
    await started;
    const maintenance = acquireLedgerMaintenance(db, 'owner', 'backup');
    await new Promise((r) => setTimeout(r, 10));
    await expect(withLedgerWrite('owner', async () => { throw new Error('ran'); }, db)).rejects.toThrow('maintenance');
    let ready = false; void maintenance.then(() => { ready = true; });
    expect(ready).toBe(false); finish(); await writing;
    const token = await maintenance; await assertLedgerMaintenance(db, 'owner', token);
    await releaseLedgerMaintenance(db, 'owner', token);
    await expect(withLedgerWrite('owner', async () => 'ok', db)).resolves.toBe('ok');
  });
  it('keeps stale writers and timed-out maintenance fail-closed regardless of age', async () => {
    state.records.set(path, { writers: { crashed: '2000-01-01T00:00:00Z' } });
    await expect(acquireLedgerMaintenance(db, 'owner', 'restore', undefined, 0)).rejects.toThrow('did not drain');
    await expect(withLedgerWrite('owner', async () => 'unsafe', db)).rejects.toThrow('maintenance');
    const token = (state.records.get(path)!.maintenance as { token: string }).token;
    await expect(releaseLedgerMaintenance(db, 'owner', token)).rejects.toThrow('writers remain');
  });
  it('requires ownership and prevents concurrent maintenance acquisition', async () => {
    const token = await acquireLedgerMaintenance(db, 'owner', 'restore');
    await expect(acquireLedgerMaintenance(db, 'owner', 'backup')).rejects.toThrow('maintenance');
    await expect(releaseLedgerMaintenance(db, 'owner', 'wrong')).rejects.toThrow('ownership');
    await expect(acquireLedgerMaintenance(db, 'owner', 'backup', token)).rejects.toThrow('ownership');
    await expect(acquireLedgerMaintenance(db, 'owner', 'restore', token)).resolves.toBe(token);
  });
  it('holds one lease through nested operations and releases after an awaited failing rollback', async () => {
    let rollback = false;
    await expect(withLedgerWrite('owner', async () => {
      await withLedgerWrite('owner', async () => {
        expect(Object.keys(state.records.get(path)!.writers as object)).toHaveLength(1);
      }, db);
      try { throw new Error('failed'); } finally { await Promise.resolve(); rollback = true; }
    }, db)).rejects.toThrow('failed');
    expect(rollback).toBe(true); expect(state.records.get(path)!.writers).toEqual({});
  });
  it('isolates users', async () => {
    await acquireLedgerMaintenance(db, 'owner', 'backup');
    await expect(withLedgerWrite('other', async () => 1, db)).resolves.toBe(1);
  });
  const writers = { ...assets, ...billing, ...customers, ...evidence, ...journals, ...projects, ...settings, idempotentCreate };
  const names = ['createAsset', 'updateAsset', 'replaceAssets', 'createBillingDocument', 'updateBillingDocument', 'deleteBillingDocument',
    'createCustomer', 'updateCustomer', 'deleteCustomer', 'uploadEvidence', 'updateEvidence', 'deleteEvidence',
    'createJournal', 'createJournalBatch', 'updateJournal', 'deleteJournal', 'confirmJournals', 'updateJournalLinks',
    'createProject', 'updateProject', 'deleteProject', 'updateSettings', 'idempotentCreate'];
  it.each(names)('%s is blocked before any domain or storage mutation', async (name) => {
    await acquireLedgerMaintenance(db, 'owner', 'restore');
    const writer = writers[name as keyof typeof writers] as (auth: unknown) => Promise<unknown>;
    await expect(writer({ userId: 'owner' })).rejects.toThrow('maintenance');
  });
  it.each([
    ['settings PUT', settingsPut, {}],
    ['deductions PUT', deductionsPut, { fiscalYear: 2026, deductions: {} }],
    ['issued postToAccounting', issuedPost, { action: 'postToAccounting', documentId: 'invoice' }],
    ['issued convert', issuedPost, { action: 'convert', sourceDocumentId: 'invoice', targetKind: 'receipt' }],
  ] as const)('%s returns retryable 503 during maintenance', async (_name, handler, body) => {
    await acquireLedgerMaintenance(db, 'owner', 'restore');
    const response = await handler(new NextRequest('http://localhost/api/test', { method: 'POST', body: JSON.stringify(body) }));
    expect(response.status).toBe(503);
    expect(response.headers.get('Retry-After')).toBe('30');
    expect(await response.json()).toMatchObject({ error: { code: 'LEDGER_MAINTENANCE' } });
    expect([...state.records.keys()]).toEqual([path]);
  });
  it('covers direct route writes and both issued-document actions', () => {
    for (const route of ['settings', 'deductions']) {
      const source = readFileSync(`app/api/${route}/route.ts`, 'utf8');
      expect(source).toMatch(/await withLedgerWrite\(userId, \(\) => .*\.set\(/);
    }
    const source = readFileSync('app/api/issued-documents/route.ts', 'utf8');
    expect(source.match(/return withLedgerWrite\(userId, async \(\) =>/g)).toHaveLength(2);
    // Invoice verification and tax-return generation currently have no ledger writes.
    for (const route of ['invoice-verify', 'tax-return'])
      expect(readFileSync(`app/api/${route}/route.ts`, 'utf8')).not.toMatch(/getFirestore|getStorage/);
  });
});
