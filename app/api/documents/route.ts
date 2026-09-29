export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, requireScope, apiErrorResponse } from '@/lib/auth/authenticateRequest';
import { searchEvidence, uploadEvidence, updateEvidence, deleteEvidence } from '@/lib/domain/evidence/service';

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req); requireScope(auth, 'read');
    const q = new URL(req.url).searchParams;
    return NextResponse.json({ documents: await searchEvidence(auth, {
      counterparty: q.get('counterparty') ?? undefined,
      minAmount: q.has('minAmount') ? Number(q.get('minAmount')) : undefined,
      maxAmount: q.has('maxAmount') ? Number(q.get('maxAmount')) : undefined,
    }) });
  } catch (error) { return apiErrorResponse(error); }
}
export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req); requireScope(auth, 'evidence:write');
    return NextResponse.json(await uploadEvidence(auth, await req.formData()), { status: 201 });
  } catch (error) { return apiErrorResponse(error); }
}
export async function PATCH(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req); requireScope(auth, 'evidence:write');
    const { documentId, updates } = await req.json();
    await updateEvidence(auth, documentId, updates);
    return NextResponse.json({ success: true });
  } catch (error) { return apiErrorResponse(error); }
}
export async function DELETE(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req); requireScope(auth, 'evidence:write');
    const { documentId, reason } = await req.json();
    await deleteEvidence(auth, documentId, reason);
    return NextResponse.json({ success: true });
  } catch (error) { return apiErrorResponse(error); }
}
