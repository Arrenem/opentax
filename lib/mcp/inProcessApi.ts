import { NextRequest } from 'next/server';
import { evidenceForm, readApiResponse, type OpenTaxApi } from '@/packages/opentax-mcp/api';
import * as assets from '@/app/api/assets/route';
import * as customers from '@/app/api/customers/route';
import * as documents from '@/app/api/documents/route';
import * as issuedDocuments from '@/app/api/issued-documents/route';
import * as journalBatch from '@/app/api/journals/batch/route';
import * as journalLinks from '@/app/api/journals/links/route';
import * as journals from '@/app/api/journals/route';
import * as projects from '@/app/api/projects/route';
import * as reports from '@/app/api/reports/route';
import * as settings from '@/app/api/settings/route';
import * as taxReturn from '@/app/api/tax-return/route';

type Handler = (req: NextRequest) => Promise<Response>;

// Only the routes the MCP tools use. Each call still goes through the route's own
// authentication and scope checks with the caller's token, exactly like the stdio adapter's HTTPS calls.
const ROUTES: Record<string, Record<string, unknown>> = {
  '/api/assets': assets,
  '/api/customers': customers,
  '/api/documents': documents,
  '/api/issued-documents': issuedDocuments,
  '/api/journals': journals,
  '/api/journals/batch': journalBatch,
  '/api/journals/links': journalLinks,
  '/api/projects': projects,
  '/api/reports': reports,
  '/api/settings': settings,
  '/api/tax-return': taxReturn,
};

export function createInProcessApi(origin: string, token: string): OpenTaxApi {
  async function request(method: string, path: string, data?: unknown) {
    const url = new URL(path, origin);
    const handler = ROUTES[url.pathname]?.[method] as Handler | undefined;
    if (!path.startsWith('/api/') || !handler) throw new Error('Invalid API path');
    const isForm = data instanceof FormData;
    const req = new NextRequest(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(isForm || data === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: data === undefined ? undefined : isForm ? data : JSON.stringify(data),
    });
    return readApiResponse(await handler(req));
  }
  return {
    request,
    uploadEvidenceFile: (file, name, metadata) => request('POST', '/api/documents', evidenceForm(file, name, metadata)),
  };
}
