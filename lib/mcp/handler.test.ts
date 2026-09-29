import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

const mocks = vi.hoisted(() => ({ authenticate: vi.fn(), request: vi.fn(), upload: vi.fn(), tokens: [] as string[] }));
vi.mock('@/lib/auth/authenticateRequest', () => ({ authenticateRequest: mocks.authenticate }));
vi.mock('./inProcessApi', () => ({
  createInProcessApi: (_origin: string, token: string) => {
    mocks.tokens.push(token);
    return { request: mocks.request, uploadEvidenceFile: mocks.upload };
  },
}));
import { handleMcpRequest } from './handler';

const URL_ = 'https://opentax.test/api/mcp';
const agent = { userId: 'user-1', actorType: 'agent', actorId: 'conn-1', scopes: ['read', 'evidence:write'] };
const route = (input: RequestInfo | URL, init?: RequestInit) => handleMcpRequest(new NextRequest(new Request(input, init)));

async function connect(token: string) {
  const client = new Client({ name: 'remote-test', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(URL_), {
    fetch: route, requestInit: { headers: { Authorization: `Bearer ${token}` } },
  }));
  return client;
}

describe('remote MCP endpoint', () => {
  beforeEach(() => {
    delete process.env.OPENTAX_PUBLIC_URL;
    mocks.authenticate.mockReset(); mocks.request.mockReset(); mocks.upload.mockReset(); mocks.tokens.length = 0;
  });

  it('challenges unauthenticated requests with protected resource metadata', async () => {
    const response = await route(URL_, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    expect(response.status).toBe(401);
    expect(response.headers.get('WWW-Authenticate')).toBe(
      'Bearer resource_metadata="https://opentax.test/.well-known/oauth-protected-resource/api/mcp", error="invalid_token"');
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    mocks.authenticate.mockRejectedValue(new Error('UNAUTHORIZED'));
    expect((await route(URL_, { method: 'POST', headers: { Authorization: 'Bearer ota_bad' }, body: '{}' })).status).toBe(401);
  });

  it('refuses Firebase user sessions, which are not scoped', async () => {
    mocks.authenticate.mockResolvedValue({ ...agent, actorType: 'user' });
    expect((await route(URL_, { method: 'POST', headers: { Authorization: 'Bearer firebase' }, body: '{}' })).status).toBe(403);
  });

  it('serves the tools over HTTP with the caller token and base64 evidence uploads', async () => {
    mocks.authenticate.mockResolvedValue(agent);
    mocks.request.mockResolvedValue({ pl: true });
    mocks.upload.mockResolvedValue({ id: 'ev-1' });
    const client = await connect('ota_token');
    const tools = (await client.listTools()).tools;
    expect(tools).toHaveLength(30);
    const upload = tools.find((t) => t.name === 'upload_evidence')!;
    expect(Object.keys(upload.inputSchema.properties ?? {})).toEqual(expect.arrayContaining(['filename', 'content_base64']));
    expect(upload.inputSchema.properties).not.toHaveProperty('file_path');
    expect(tools.find((t) => t.name === 'get_balance_sheet')?.annotations?.readOnlyHint).toBe(true);

    const report = await client.callTool({ name: 'get_profit_and_loss', arguments: { fiscalYear: 2026 } });
    expect(report.isError).not.toBe(true);
    expect(mocks.request).toHaveBeenCalledWith('GET', '/api/reports?type=pl&fiscalYear=2026');
    expect(mocks.tokens.every((t) => t === 'ota_token')).toBe(true);

    const pdf = Buffer.from('%PDF-1.4').toString('base64');
    await client.callTool({ name: 'upload_evidence', arguments: { filename: 'C:\\tmp\\invoice.pdf', content_base64: pdf, documentType: 'invoice' } });
    const [file, name, metadata] = mocks.upload.mock.calls[0];
    expect(name).toBe('invoice.pdf');
    expect((file as Blob).type).toBe('application/pdf');
    expect(await (file as Blob).text()).toBe('%PDF-1.4');
    expect(metadata).toEqual({ documentType: 'invoice' });
    const bad = await client.callTool({ name: 'upload_evidence', arguments: { filename: 'data.csv', content_base64: pdf } });
    expect(bad.isError).toBe(true);
    await client.close();
  });
});
