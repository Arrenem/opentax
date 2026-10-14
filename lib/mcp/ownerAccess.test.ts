import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

const mocks = vi.hoisted(() => ({ userId: 'owner', request: vi.fn() }));
vi.mock('@/lib/firebase/admin', () => ({ initializeAdminApp: vi.fn() }));
vi.mock('@/lib/auth/agentTokens', () => ({ resolveAgentToken: async () => ({ id: 'agent', userId: mocks.userId, scopes: ['read'] }) }));
vi.mock('@/lib/auth/oauth', () => ({ MCP_RESOURCE_PATH: '/api/mcp', resolveOAuthAccessToken: async () => ({ connection: { id: 'oauth', userId: mocks.userId }, scopes: ['read'] }) }));
vi.mock('./inProcessApi', () => ({ createInProcessApi: () => ({ request: mocks.request }) }));
import { handleMcpRequest } from './handler';

const url = 'https://opentax.test/api/mcp';
const route = (input: RequestInfo | URL, init?: RequestInit) => handleMcpRequest(new NextRequest(new Request(input, init)));
describe('MCP through the real instance authentication boundary', () => {
  beforeEach(() => {
    vi.stubEnv('OPENTAX_ACCESS_MODE', 'owner'); vi.stubEnv('OPENTAX_OWNER_UID', 'owner');
    vi.stubEnv('OPENTAX_PUBLIC_URL', undefined); mocks.userId = 'owner'; mocks.request.mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());
  it.each(['otk_test', 'ota_test'])('denies non-owner %s before dispatching tools', async token => {
    mocks.userId = 'other';
    const res = await route(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: '{}' });
    expect(res.status).toBe(401); expect(mocks.request).not.toHaveBeenCalled();
  });
  it('initializes and reads as an owner, then denies the same session after owner change', async () => {
    mocks.request.mockResolvedValue({ balance: 0 });
    const client = new Client({ name: 'isolated-owner-test', version: '1' });
    await client.connect(new StreamableHTTPClientTransport(new URL(url), {
      fetch: route, requestInit: { headers: { Authorization: 'Bearer otk_test' } },
    }));
    const result = await client.callTool({ name: 'get_profit_and_loss', arguments: { fiscalYear: 2026 } });
    expect(result.isError).not.toBe(true); expect(mocks.request).toHaveBeenCalledOnce();
    vi.stubEnv('OPENTAX_OWNER_UID', 'new-owner');
    await expect(client.listTools()).rejects.toThrow();
    expect(mocks.request).toHaveBeenCalledOnce();
    await client.close();
  });
});
