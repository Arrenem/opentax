export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, requireUser, apiErrorResponse } from '@/lib/auth/authenticateRequest';
import { confirmJournals } from '@/lib/domain/journals/service';
export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req); requireUser(auth);
    const { journalIds, reason } = await req.json();
    await confirmJournals(auth, journalIds, reason);
    return NextResponse.json({ success: true });
  } catch (e) { return apiErrorResponse(e); }
}
