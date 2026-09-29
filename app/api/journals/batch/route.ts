export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, apiErrorResponse, requireScope } from '@/lib/auth/authenticateRequest';
import { createJournalBatch } from '@/lib/domain/journals/service';

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    requireScope(auth, 'journals:write');
    const body = await req.json();
    return NextResponse.json({ results: await createJournalBatch(auth, body.journals) });
  } catch (error) { return apiErrorResponse(error); }
}
