export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, apiErrorResponse, requireScope } from '@/lib/auth/authenticateRequest';
import { listJournalYears } from '@/lib/domain/journals/service';

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    requireScope(auth, 'read');
    return NextResponse.json({ years: await listJournalYears(auth) });
  } catch (error) { return apiErrorResponse(error); }
}
