import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { AGENT_SCOPES } from '@/lib/auth/scopes';
const mocks = vi.hoisted(() => ({ resolve: vi.fn(), verify: vi.fn() }));
vi.mock('@/lib/firebase/admin', () => ({ initializeAdminApp: vi.fn() }));
vi.mock('@/lib/auth/agentTokens', () => ({ resolveAgentToken: mocks.resolve }));
vi.mock('@/lib/auth/oauth', () => ({ resolveOAuthAccessToken: vi.fn() }));
vi.mock('firebase-admin/auth', () => ({ getAuth: () => ({ verifyIdToken: mocks.verify }) }));
import { GET } from '@/app/api/setup/agent-access/route';
const request = (query = '', token = 'otk_test') => GET(new NextRequest(`https://test.invalid/api/setup/agent-access${query}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} }));
beforeEach(() => {
  vi.stubEnv('OPENTAX_ACCESS_MODE', 'owner'); vi.stubEnv('OPENTAX_OWNER_UID', 'owner');
  mocks.resolve.mockReset().mockResolvedValue({ id: 'agent', userId: 'owner', scopes: ['read'] });
  mocks.verify.mockReset().mockResolvedValue({ uid: 'owner' });
});
afterEach(() => vi.unstubAllEnvs());
it('reports the authenticated token scope set with no cacheable credentials', async () => {
  const response = await request();
  expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('no-store');
  expect(await response.json()).toEqual({ actorType: 'agent', userId: 'owner', scopes: ['read'] });
  expect(mocks.resolve).toHaveBeenCalledWith('otk_test', { touch: false });
});
it('reports additional journal write access instead of filtering it away', async () => {
  mocks.resolve.mockResolvedValue({ id: 'agent', userId: 'owner', scopes: ['read', 'journals:write'] });
  expect((await (await request()).json()).scopes).toEqual(['read', 'journals:write']);
  expect((await request('?requiredScope=journals%3Awrite')).status).toBe(200);
  expect((await request('?requiredScope=settings%3Awrite')).status).toBe(403);
});
it('safely denies every write scope using GET without any business handler', async () => {
  for (const scope of AGENT_SCOPES.filter(s => s !== 'read')) {
    const response = await request(`?requiredScope=${encodeURIComponent(scope)}`);
    expect(response.status).toBe(403); expect(await response.json()).toEqual({ error: { code: 'SCOPE_DENIED' } });
  }
  expect((await request('?requiredScope=unknown')).status).toBe(400);
});
it('rejects missing/revoked/other-owner tokens and user credentials', async () => {
  expect((await request('', '')).status).toBe(401);
  mocks.resolve.mockResolvedValue(null); expect((await request()).status).toBe(401);
  mocks.resolve.mockResolvedValue({ id: 'other', userId: 'other', scopes: ['read'] }); expect((await request()).status).toBe(403);
  expect((await request('', 'firebase-id-token')).status).toBe(403);
});
it('rejects legacy mode instead of treating an arbitrary tenant as the setup owner', async () => {
  vi.stubEnv('OPENTAX_ACCESS_MODE', 'legacy');
  expect((await request()).status).toBe(403);
});
