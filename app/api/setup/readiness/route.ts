export const dynamic = 'force-dynamic';
import type { NextRequest } from 'next/server';
import { ApiError, authenticateRequest, requireUser } from '@/lib/auth/authenticateRequest';
import { checkRuntime } from '@/lib/setup/readiness';
export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req); requireUser(auth);
    if (process.env.OPENTAX_ACCESS_MODE !== 'owner' || process.env.OPENTAX_OWNER_UID !== auth.userId) throw new ApiError('OWNER_MODE_REQUIRED', 403);
    const body = await req.json();
    if (body?.consent !== 'WRITE_SYNTHETIC_SETUP_DATA' || typeof body.runId !== 'string' || !/^[0-9a-f-]{36}$/.test(body.runId)) throw new ApiError('SETUP_CHECK_CONSENT_REQUIRED', 400);
    return Response.json(await checkRuntime(auth.userId, body.runId));
  } catch (error) {
    // Never return/log signed URLs or provider response bodies.
    return Response.json({ error: { code: error instanceof ApiError ? error.code : 'SETUP_CHECK_FAILED' } }, { status: error instanceof ApiError ? error.status : 503 });
  }
}
