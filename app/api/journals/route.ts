export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, apiErrorResponse, requireScope } from '@/lib/auth/authenticateRequest';
import { searchJournals, createJournal, updateJournal, deleteJournal } from '@/lib/domain/journals/service';

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    requireScope(auth, 'read');
    const q = new URL(req.url).searchParams;
    return NextResponse.json({ journals: await searchJournals(auth, {
      fiscalYear: q.has('fiscalYear') ? Number(q.get('fiscalYear')) : undefined,
      fiscalMonth: q.has('fiscalMonth') ? Number(q.get('fiscalMonth')) : undefined,
      status: q.get('status') ?? undefined,
    }) });
  } catch (error) { return apiErrorResponse(error); }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    requireScope(auth, 'journals:write');
    const result = await createJournal(auth, await req.json());
    return NextResponse.json({ id: result.journalId, status: result.status }, { status: result.status === 'created' ? 201 : 200 });
  } catch (error) { return apiErrorResponse(error); }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    requireScope(auth, 'journals:write');
    const { journalId, updates, reason } = await req.json();
    await updateJournal(auth, journalId, updates, reason);
    return NextResponse.json({ success: true });
  } catch (error) { return apiErrorResponse(error); }
}

export async function DELETE(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    requireScope(auth, 'journals:write');
    const { journalId, reason } = await req.json();
    await deleteJournal(auth, journalId, reason);
    return NextResponse.json({ success: true });
  } catch (error) { return apiErrorResponse(error); }
}
