export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, apiErrorResponse, requireScope } from '@/lib/auth/authenticateRequest';
import { updateJournalLinks } from '@/lib/domain/journals/service';

// 仕訳と証憑・帳票の紐づけを変更する。evidenceIds は全集合、issuedDocumentId は null で解除。
export async function PUT(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    requireScope(auth, 'journals:write');
    const { journalId, evidenceIds, issuedDocumentId, reason } = await req.json();
    await updateJournalLinks(auth, journalId, { evidenceIds, issuedDocumentId }, reason);
    return NextResponse.json({ success: true });
  } catch (error) { return apiErrorResponse(error); }
}
