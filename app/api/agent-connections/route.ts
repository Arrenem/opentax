export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, apiErrorResponse, requireUser } from '@/lib/auth/authenticateRequest';
import { createAgentConnection, listAgentConnections, revokeAgentConnection, validateScopes } from '@/lib/auth/agentTokens';

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req); requireUser(auth);
    return NextResponse.json({ connections: await listAgentConnections(auth.userId) });
  } catch (error) { return apiErrorResponse(error); }
}
export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req); requireUser(auth);
    const body = await req.json();
    const created = await createAgentConnection(auth.userId, String(body.name ?? ''), validateScopes(body.scopes), body.expiresAt ? new Date(body.expiresAt) : undefined);
    return NextResponse.json(created, { status: 201 });
  } catch (error) { return apiErrorResponse(error); }
}
export async function DELETE(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req); requireUser(auth);
    const { id } = await req.json();
    await revokeAgentConnection(auth.userId, id);
    return NextResponse.json({ success: true });
  } catch (error) { return apiErrorResponse(error); }
}
