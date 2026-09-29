import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  resolve: vi.fn(), verify: vi.fn(), resolveOAuth: vi.fn(),
}));
vi.mock('./oauth', () => ({ resolveOAuthAccessToken: mocks.resolveOAuth }));
vi.mock('@/lib/firebase/admin', () => ({ initializeAdminApp: vi.fn() }));
vi.mock('./agentTokens', () => ({ resolveAgentToken: mocks.resolve, AGENT_SCOPES: ['read', 'journals:write'] }));
vi.mock('firebase-admin/auth', () => ({ getAuth: () => ({ verifyIdToken: mocks.verify }) }));
import { authenticateRequest, requireScope } from './authenticateRequest';
const request = (token: string) => ({ headers: new Headers({ Authorization: `Bearer ${token}` }) }) as NextRequest;

describe('request authentication', () => {
  beforeEach(() => { mocks.resolve.mockReset(); mocks.verify.mockReset(); });
  it('authenticates a valid agent token with its own user and scopes', async () => {
    mocks.resolve.mockResolvedValue({ id: 'agent-1', userId: 'owner-1', scopes: ['read'] });
    const auth = await authenticateRequest(request(`otk_${'x'.repeat(43)}`));
    expect(auth).toEqual({ userId: 'owner-1', actorType: 'agent', actorId: 'agent-1', scopes: ['read'] });
    expect(() => requireScope(auth, 'journals:write')).toThrowError('SCOPE_DENIED');
  });
  it('rejects unknown and revoked agent tokens', async () => {
    mocks.resolve.mockResolvedValue(null);
    await expect(authenticateRequest(request('otk_invalid'))).rejects.toThrowError('UNAUTHORIZED');
  });
  it('never takes user ownership from a request body', async () => {
    mocks.resolve.mockResolvedValue({ id: 'agent-2', userId: 'owner-2', scopes: ['read'] });
    const auth = await authenticateRequest(request(`otk_${'y'.repeat(43)}`));
    expect(auth.userId).toBe('owner-2');
    expect(auth.userId).not.toBe('owner-1');
  });
  it('authenticates OAuth access tokens as their agent connection with the granted scopes', async () => {
    mocks.resolveOAuth.mockResolvedValue({ connection: { id: 'oauth-1', userId: 'owner-3' }, scopes: ['read'] });
    expect(await authenticateRequest(request(`ota_${'z'.repeat(43)}`)))
      .toEqual({ userId: 'owner-3', actorType: 'agent', actorId: 'oauth-1', scopes: ['read'] });
    mocks.resolveOAuth.mockResolvedValue(null);
    await expect(authenticateRequest(request(`ota_${'z'.repeat(43)}`))).rejects.toThrowError('UNAUTHORIZED');
    expect(mocks.verify).not.toHaveBeenCalled();
  });
  it('authenticates Firebase users', async () => {
    mocks.verify.mockResolvedValue({ uid: 'web-1' });
    expect(await authenticateRequest(request('firebase-token'))).toMatchObject({ userId: 'web-1', actorType: 'user' });
  });
});
