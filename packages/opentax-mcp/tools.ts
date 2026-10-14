import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { evidenceMimeType, type OpenTaxApi } from './api';

const journal = z.object({
  transactionDate: z.iso.date(), debitAccount: z.string(), debitAmount: z.number().positive(),
  creditAccount: z.string(), creditAmount: z.number().positive(), counterparty: z.string(),
  description: z.string(), taxType: z.enum(['standard10', 'reduced8', 'exempt', 'non_taxable', 'export']),
  taxIncluded: z.boolean(), invoiceRegistrationNumber: z.string().optional(),
  sourceType: z.enum(['credit_card', 'bank', 'invoice', 'manual', 'issued_document']).optional(),
  sourceReference: z.string().optional(), evidenceIds: z.array(z.string()).max(20).optional(),
  reviewNote: z.string().optional(), idempotencyKey: z.string().optional(),
});
const lineItem = z.object({ description: z.string(), quantity: z.number().positive(), unitPrice: z.number().nonnegative(),
  taxType: z.enum(['standard10', 'reduced8', 'exempt', 'non_taxable', 'export']),
  priceMode: z.enum(['exclusive', 'inclusive']).optional(), withholding: z.boolean().optional() });
const id = z.object({ id: z.string() });
const year = z.object({ fiscalYear: z.number().int().optional() });
const evidenceMetadata = {
  documentType: z.enum(['credit_card_statement', 'invoice', 'bank_statement', 'receipt', 'other']).optional(),
  transactionDate: z.string().optional(), counterparty: z.string().optional(), amount: z.number().optional(),
  invoiceRegistrationNumber: z.string().optional(), projectId: z.string().optional(), sourceReference: z.string().optional(),
  idempotencyKey: z.string().optional(),
};
// Remote requests are capped by the hosting platform's body limit (about 4.5 MB on Vercel).
export const MAX_INLINE_EVIDENCE_BASE64 = 4_000_000;

type Kind = 'read' | 'write' | 'delete';
const ANNOTATIONS = {
  read: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  write: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  delete: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
} as const;

export interface CreateServerOptions {
  // stdio only: read evidence from a local path. Without it, upload_evidence takes base64 content.
  uploadEvidenceFromPath?: (filePath: string, metadata: Record<string, string>) => Promise<unknown>;
}

function decodeBase64(value: string) {
  const data = value.replace(/^data:[^;,]+;base64,/, '').replace(/\s/g, '');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(data) || data.length % 4 !== 0) throw new Error('content_base64 must be valid base64');
  return Buffer.from(data, 'base64');
}

export function createServer(client: OpenTaxApi, options: CreateServerOptions = {}) {
  const server = new McpServer({ name: 'opentax', version: '0.2.0' });
  function add<S extends z.ZodRawShape>(name: string, description: string, schema: z.ZodObject<S>,
    call: (args: z.output<z.ZodObject<S>>) => Promise<unknown>, kind: Kind = 'write') {
    server.registerTool(name, { description, inputSchema: schema, annotations: ANNOTATIONS[kind] }, async (args) => {
      try { return { content: [{ type: 'text' as const, text: JSON.stringify(await call(args)) }] }; }
      catch (error) { return { isError: true, content: [{ type: 'text' as const,
        text: error instanceof Error ? error.message : 'OpenTax request failed' }] }; }
    });
  }
  const q = (params: Record<string, unknown>) => new URLSearchParams(Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => [k, String(v)])).toString();
  const strings = (metadata: Record<string, unknown>) => Object.fromEntries(Object.entries(metadata)
    .filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]));
  add('get_business_context', 'Read business settings and accounting context', z.object({}), () => client.request('GET', '/api/settings'), 'read');
  add('update_business_settings', 'Update business settings. Only the given fields change. Bank accounts can only be changed by the user.',
    z.object({ updates: z.object({ businessName: z.string().optional(), ownerName: z.string().optional(), address: z.string().optional(),
      taxOffice: z.string().optional(), invoiceRegistrationNumber: z.string().optional(), isInvoiceIssuer: z.boolean().optional(),
      fiscalYearStart: z.number().int().min(1).max(12).optional(), openingDate: z.string().optional(),
      filingType: z.enum(['blue', 'white']).optional(), eTaxFiling: z.boolean().optional(), excellentElectronicBooks: z.boolean().optional(),
      consumptionTaxStatus: z.enum(['taxable', 'exempt']).optional(),
      consumptionTaxMethod: z.enum(['standard', 'simplified', 'special20pct', 'special30pct']).optional(),
      simplifiedBusinessType: z.number().int().min(1).max(6).optional(), businessTaxCategory: z.number().int().min(1).max(3).optional(),
      homeOfficeRatio: z.number().min(0).max(100).optional(), communicationRatio: z.number().min(0).max(100).optional(),
      carUsageRatio: z.number().min(0).max(100).optional(), utilitiesRatio: z.number().min(0).max(100).optional(),
      baselineRevenue: z.number().nonnegative().optional() }) }),
    (a) => client.request('PATCH', '/api/settings', a));
  add('search_customers', 'Search customers', z.object({ query: z.string().optional() }), (a) => client.request('GET', `/api/customers?${q(a)}`), 'read');
  add('create_customer', 'Create a customer', z.object({ name: z.string(), nameKana: z.string().optional(), address: z.string().optional(),
    email: z.string().optional(), phone: z.string().optional(), invoiceRegistrationNumber: z.string().optional(),
    note: z.string().optional(), idempotencyKey: z.string().optional() }), (a) => client.request('POST', '/api/customers', a));
  add('update_customer', 'Update a customer', z.object({ customerId: z.string(), updates: z.object({ name: z.string().optional(),
    nameKana: z.string().optional(), address: z.string().optional(), email: z.string().optional(), phone: z.string().optional(),
    invoiceRegistrationNumber: z.string().optional(), note: z.string().optional() }) }), (a) => client.request('PATCH', '/api/customers', a));
  add('search_projects', 'Search projects', z.object({ query: z.string().optional(), customerId: z.string().optional(),
    status: z.enum(['active', 'completed', 'cancelled']).optional() }), (a) => client.request('GET', `/api/projects?${q(a)}`), 'read');
  add('get_project', 'Get project details', id, (a) => client.request('GET', `/api/projects?id=${encodeURIComponent(a.id)}`), 'read');
  add('create_project', 'Create a project', z.object({ name: z.string(), customerId: z.string(), description: z.string().optional(),
    status: z.enum(['active', 'completed', 'cancelled']).optional(), startDate: z.string().optional(), endDate: z.string().optional(),
    idempotencyKey: z.string().optional() }), (a) => client.request('POST', '/api/projects', a));
  add('update_project', 'Update a project', z.object({ projectId: z.string(), updates: z.record(z.string(), z.unknown()) }),
    (a) => client.request('PATCH', '/api/projects', a));
  add('search_journals', 'Search journal entries', z.object({ fiscalYear: z.number().int().optional(), fiscalMonth: z.number().int().optional(),
    status: z.enum(['pending', 'confirmed']).optional() }), (a) => client.request('GET', `/api/journals?${q(a)}`), 'read');
  add('create_journals', 'Create up to 200 pending journals. Each item should contain transactionDate, debitAccount, debitAmount, creditAccount, creditAmount, counterparty, description, taxType and taxIncluded; optional sourceReference, evidenceIds, reviewNote and idempotencyKey. Validation errors are returned per item.',
    z.object({ journals: z.array(journal).min(1).max(200) }),
    (a) => client.request('POST', '/api/journals/batch', a));
  add('update_pending_journal', 'Update a pending journal only', z.object({ journalId: z.string(), updates: journal.partial(), reason: z.string() }),
    (a) => client.request('PATCH', '/api/journals', a));
  add('delete_pending_journal', 'Delete a pending journal with a reason', z.object({ journalId: z.string(), reason: z.string() }),
    (a) => client.request('DELETE', '/api/journals', a), 'delete');
  add('update_journal_links', 'Change which evidence and billing document a journal is linked to. evidenceIds replaces the full set; issuedDocumentId null removes the billing link. On confirmed journals agents may only add links.',
    z.object({ journalId: z.string(), evidenceIds: z.array(z.string()).max(20).optional(), issuedDocumentId: z.string().nullable().optional(),
      reason: z.string() }), (a) => client.request('PUT', '/api/journals/links', a));
  const fromPath = options.uploadEvidenceFromPath;
  if (fromPath) {
    add('upload_evidence', 'Upload a local PDF, JPEG, or PNG as evidence without interpreting it',
      z.object({ file_path: z.string(), ...evidenceMetadata }),
      (a) => { const { file_path, ...metadata } = a; return fromPath(file_path, strings(metadata)); });
  } else {
    add('upload_evidence', 'Upload a PDF, JPEG, or PNG as evidence without interpreting it. Send the file bytes as base64 in content_base64 (about 3 MB of file data at most) and its name, ending in .pdf, .jpg, .jpeg or .png, in filename.',
      z.object({ filename: z.string().min(1).max(200), content_base64: z.string().min(1).max(MAX_INLINE_EVIDENCE_BASE64), ...evidenceMetadata }),
      (a) => {
        const { filename, content_base64, ...metadata } = a;
        const name = filename.split(/[\\/]/).pop() ?? '';
        const type = evidenceMimeType(name);
        if (!type) throw new Error('Unsupported evidence type');
        return client.uploadEvidenceFile(new Blob([decodeBase64(content_base64)], { type }), name, strings(metadata));
      });
  }
  add('search_evidence', 'Search stored evidence', z.object({ counterparty: z.string().optional(), minAmount: z.number().optional(),
    maxAmount: z.number().optional() }), (a) => client.request('GET', `/api/documents?${q(a)}`), 'read');
  add('update_evidence', 'Update evidence metadata. null clears transactionDate, amount or projectId. Journal links are changed with update_journal_links.',
    z.object({ documentId: z.string(), updates: z.object({
      documentType: z.enum(['credit_card_statement', 'invoice', 'bank_statement', 'receipt', 'other']).optional(),
      transactionDate: z.iso.date().nullable().optional(), amount: z.number().nonnegative().nullable().optional(),
      counterparty: z.string().optional(), invoiceRegistrationNumber: z.string().optional(),
      projectId: z.string().nullable().optional(), sourceReference: z.string().optional() }) }),
    (a) => client.request('PATCH', '/api/documents', a));
  add('delete_evidence', 'Delete evidence that is not linked to any journal (the stored file is retained)',
    z.object({ documentId: z.string(), reason: z.string() }), (a) => client.request('DELETE', '/api/documents', a), 'delete');
  add('search_billing_documents', 'Search billing documents', z.object({ projectId: z.string().optional(), kind: z.enum(['estimate','invoice','receipt']).optional(),
    status: z.enum(['draft','issued','sent','paid','cancelled']).optional() }), (a) => client.request('GET', `/api/issued-documents?${q(a)}`), 'read');
  add('get_billing_document', 'Get a billing document', id, (a) => client.request('GET', `/api/issued-documents?id=${encodeURIComponent(a.id)}`), 'read');
  add('create_billing_draft', 'Create a draft billing document; OpenTax calculates all totals', z.object({
    kind: z.enum(['estimate','invoice','receipt']), projectId: z.string(), issueDate: z.iso.date(), dueDate: z.iso.date().optional(),
    title: z.string().optional(), notes: z.string().optional(), lineItems: z.array(lineItem).min(1), idempotencyKey: z.string().optional() }),
    (a) => client.request('POST', '/api/issued-documents', a));
  add('update_billing_draft', 'Update draft content and recalculate totals', z.object({ documentId: z.string(),
    updates: z.object({ issueDate: z.iso.date().optional(), dueDate: z.iso.date().optional(), title: z.string().optional(),
      notes: z.string().optional(), lineItems: z.array(lineItem).optional(), projectId: z.string().optional(),
      customerAddress: z.string().optional() }) }), (a) => client.request('PATCH', '/api/issued-documents', a));
  add('delete_billing_draft', 'Delete a draft billing document that has not been posted to accounting',
    z.object({ documentId: z.string() }), (a) => client.request('DELETE', '/api/issued-documents', a), 'delete');
  add('list_fixed_assets', 'List fixed assets', z.object({}), () => client.request('GET', '/api/assets'), 'read');
  add('create_fixed_asset', 'Create a fixed asset', z.object({ name: z.string(), acquiredOn: z.iso.date(), acquisitionCost: z.number().nonnegative(),
    usefulLifeYears: z.number().nonnegative(), method: z.enum(['straight_line','immediate','lump_sum','none']),
    businessUseRatio: z.number().min(0).max(100), accumulatedDepreciation: z.number().nonnegative().optional(),
    isDisposed: z.boolean().optional(), note: z.string().optional(), idempotencyKey: z.string().optional() }),
    (a) => client.request('POST', '/api/assets', a));
  add('update_fixed_asset', 'Update one fixed asset', z.object({ assetId: z.string(), updates: z.record(z.string(), z.unknown()) }),
    (a) => client.request('PATCH', '/api/assets', a));
  add('get_profit_and_loss', 'Get OpenTax profit and loss report', year, (a) => client.request('GET', `/api/reports?type=pl&${q(a)}`), 'read');
  add('get_balance_sheet', 'Get OpenTax balance sheet', year, (a) => client.request('GET', `/api/reports?type=bs&${q(a)}`), 'read');
  add('get_monthly_summary', 'Get OpenTax monthly summary', year, (a) => client.request('GET', `/api/reports?type=monthly&${q(a)}`), 'read');
  add('get_tax_return_preview', 'Read tax return preview without creating an export', year,
    (a) => client.request('GET', `/api/tax-return?${q(a)}`), 'read');
  return server;
}
