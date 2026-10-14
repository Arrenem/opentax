export const dynamic = 'force-dynamic';
import type { NextRequest } from 'next/server';
import { ApiError, authenticateRequest, requireScope } from '@/lib/auth/authenticateRequest';
import { AGENT_SCOPES } from '@/lib/auth/scopes';

// Inspect only the presented token. A scope probe invokes no business write handler.
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req, { touch: false });
    if (process.env.OPENTAX_ACCESS_MODE !== 'owner' || process.env.OPENTAX_OWNER_UID !== auth.userId) throw new ApiError('OWNER_MODE_REQUIRED', 403);
    if (auth.actorType !== 'agent') throw new ApiError('AGENT_REQUIRED', 403);
    const requested = req.nextUrl.searchParams.get('requiredScope');
    const scope = AGENT_SCOPES.find(value => value === requested);
    if (requested !== null && !scope) throw new ApiError('INVALID_SCOPE', 400);
    if (scope) requireScope(auth, scope);
    return Response.json({ actorType: auth.actorType, userId: auth.userId, scopes: auth.scopes }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: { code: error instanceof ApiError ? error.code : 'SETUP_ACCESS_CHECK_FAILED' } }, { status: error instanceof ApiError ? error.status : 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
