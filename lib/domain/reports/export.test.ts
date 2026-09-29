import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';
const state = vi.hoisted(() => ({ journals: [{ status: 'pending' }] as Array<{ status: string }> }));
vi.mock('@/lib/auth/authenticateRequest', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/authenticateRequest')>();
  return { ...actual, authenticateRequest: async () => ({ userId: 'user-1', actorType: 'user', actorId: 'user-1', scopes: [] }) };
});
vi.mock('@/lib/domain/reports/service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/domain/reports/service')>();
  return { ...actual, getTaxReturnPreview: async () => ({ bundle: { pl: {}, bs: {} },
    settings: { ownerName: 'Owner', address: '', businessName: 'Shop' }, journals: state.journals }) };
});
vi.mock('@/lib/export/formBGenerator', () => ({ generateFormBXtx: () => '<formb/>' }));
vi.mock('@/lib/export/xtxGenerator', () => ({ generateXtx: () => '<xtx/>', validateFinancials: () => [] }));
import { GET as taxGet, POST as taxPost } from '@/app/api/tax-return/route';
import { GET as xtxGet } from '@/app/api/export/xtx/route';
const get = (path: string) => new Request(`http://localhost${path}`) as NextRequest;
beforeEach(() => { state.journals = [{ status: 'pending' }]; });
describe('formal tax export review gate', () => {
  it('leaves preview readable while pending exists', async () => {
    const response = await taxGet(get('/api/tax-return?fiscalYear=2026'));
    expect(response.status).toBe(200);
    expect(await response.json()).toHaveProperty('pl');
  });
  it('blocks both XTX paths while pending exists', async () => {
    const formB = await taxGet(get('/api/tax-return?fiscalYear=2026&format=formb'));
    const blue = await xtxGet(get('/api/export/xtx?fiscalYear=2026'));
    const post = await taxPost(new Request('http://localhost/api/tax-return', { method: 'POST',
      body: JSON.stringify({ fiscalYear: 2026, kind: 'blue' }) }) as NextRequest);
    for (const response of [formB, blue, post]) {
      expect(response.status).toBe(409);
      expect((await response.json()).error.code).toBe('REVIEW_REQUIRED');
    }
  });
  it('allows export when all journals are confirmed', async () => {
    state.journals = [{ status: 'confirmed' }];
    const response = await xtxGet(get('/api/export/xtx?fiscalYear=2026'));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('<xtx/>');
  });
});
