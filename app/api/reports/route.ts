export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, requireScope, apiErrorResponse, ApiError } from '@/lib/auth/authenticateRequest';
import { getReport, validateFiscalYear } from '@/lib/domain/reports/service';
export async function GET(req: NextRequest) {
  try { const auth = await authenticateRequest(req); requireScope(auth, 'read');
    const q = new URL(req.url).searchParams;
    const type = q.get('type') ?? 'pl';
    if (!['pl', 'bs', 'monthly'].includes(type)) throw new ApiError('INVALID_REPORT_TYPE', 400);
    return NextResponse.json(await getReport(auth, validateFiscalYear(q.get('fiscalYear')), type as 'pl' | 'bs' | 'monthly'));
  } catch (e) { return apiErrorResponse(e); }
}
