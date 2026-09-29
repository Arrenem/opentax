import { afterEach, describe, expect, it, vi } from 'vitest';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { createServer } from './server';
import type { OpenTaxClient } from './client';

const api = { request: vi.fn(async () => ({ ok: true })), uploadEvidence: vi.fn(async () => ({ id: 'ev-1' })) };
async function connected() {
  const server = createServer(api as unknown as OpenTaxClient);
  const client = new Client({ name: 'opentax-test', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { server, client };
}
afterEach(() => { api.request.mockClear(); api.uploadEvidence.mockClear(); });
describe('MCP tool mapping', () => {
  it('advertises all v1 structured tools', async () => {
    const { server, client } = await connected();
    const names = (await client.listTools()).tools.map((tool) => tool.name);
    expect(names).toHaveLength(30);
    expect(names).toEqual(expect.arrayContaining(['get_business_context', 'create_customer', 'create_project',
      'create_journals', 'upload_evidence', 'create_billing_draft', 'create_fixed_asset',
      'get_profit_and_loss', 'get_balance_sheet', 'get_tax_return_preview']));
    expect(names).not.toContain('confirm_journal');
    await client.close(); await server.close();
  });
  it('sends journal batches to the validated API without status or actor overrides', async () => {
    const { server, client } = await connected();
    const journal = { transactionDate: '2026-09-29', debitAccount: 'SUPPLIES', debitAmount: 1100,
      creditAccount: 'BANK', creditAmount: 1100, counterparty: 'Vendor', description: 'Paper',
      taxType: 'standard10', taxIncluded: true, idempotencyKey: 'source-1' };
    const result = await client.callTool({ name: 'create_journals', arguments: { journals: [journal] } });
    expect(result.isError).not.toBe(true);
    expect(api.request).toHaveBeenCalledWith('POST', '/api/journals/batch', { journals: [journal] });
    await client.close(); await server.close();
  });
  it('routes edit, delete and link tools to their API routes', async () => {
    const { server, client } = await connected();
    await client.callTool({ name: 'update_evidence', arguments: { documentId: 'd1', updates: { amount: null, counterparty: 'Shop' } } });
    expect(api.request).toHaveBeenCalledWith('PATCH', '/api/documents', { documentId: 'd1', updates: { amount: null, counterparty: 'Shop' } });
    await client.callTool({ name: 'delete_evidence', arguments: { documentId: 'd1', reason: 'duplicate' } });
    expect(api.request).toHaveBeenCalledWith('DELETE', '/api/documents', { documentId: 'd1', reason: 'duplicate' });
    await client.callTool({ name: 'update_journal_links', arguments: { journalId: 'j1', evidenceIds: ['d1'], issuedDocumentId: null, reason: 'match' } });
    expect(api.request).toHaveBeenCalledWith('PUT', '/api/journals/links', { journalId: 'j1', evidenceIds: ['d1'], issuedDocumentId: null, reason: 'match' });
    await client.callTool({ name: 'delete_billing_draft', arguments: { documentId: 'b1' } });
    expect(api.request).toHaveBeenCalledWith('DELETE', '/api/issued-documents', { documentId: 'b1' });
    await client.callTool({ name: 'update_business_settings', arguments: { updates: { businessName: 'OpenTax' } } });
    expect(api.request).toHaveBeenCalledWith('PATCH', '/api/settings', { updates: { businessName: 'OpenTax' } });
    const tools = (await client.listTools()).tools;
    expect(tools.find((t) => t.name === 'delete_evidence')?.annotations?.destructiveHint).toBe(true);
    await client.close(); await server.close();
  });
  it('routes reporting to the same API and rejects an invalid tool input', async () => {
    const { server, client } = await connected();
    await client.callTool({ name: 'get_profit_and_loss', arguments: { fiscalYear: 2026 } });
    expect(api.request).toHaveBeenCalledWith('GET', '/api/reports?type=pl&fiscalYear=2026');
    expect((await client.callTool({ name: 'create_journals', arguments: { journals: [] } })).isError).toBe(true);
    await client.close(); await server.close();
  });
});
