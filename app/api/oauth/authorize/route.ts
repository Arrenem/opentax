export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { ApiError, apiErrorResponse, authenticateRequest, requireUser } from '@/lib/auth/authenticateRequest';
import { createAuthorizationCode, OAuthError, parseScopes, redirectWith, validateAuthorizationRequest } from '@/lib/auth/oauth';
import { publicOrigin } from '@/lib/mcp/oauthHttp';

// Backs the /oauth/authorize consent page. The page forwards the client's query string unchanged.

function authorizationError(error: unknown, state?: string | null, redirectUri?: string) {
  if (error instanceof OAuthError) {
    if (error.redirectable && redirectUri) {
      return NextResponse.json({ redirect: redirectWith(redirectUri, { error: error.code, error_description: error.description, state: state ?? undefined }) });
    }
    return NextResponse.json({ error: { code: error.code, message: error.description } }, { status: 400 });
  }
  return apiErrorResponse(error);
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  try {
    const request = await validateAuthorizationRequest(params, publicOrigin(req));
    return NextResponse.json({
      clientName: request.client.clientName,
      redirectHost: new URL(request.redirectUri).host,
      requestedScopes: request.requestedScopes,
    });
  } catch (error) { return authorizationError(error, params.get('state'), params.get('redirect_uri') ?? undefined); }
}

export async function POST(req: NextRequest) {
  let params = new URLSearchParams();
  try {
    const auth = await authenticateRequest(req); requireUser(auth);
    const body = await req.json();
    if (typeof body.query !== 'string') throw new ApiError('INVALID_REQUEST', 400);
    params = new URLSearchParams(body.query);
    const request = await validateAuthorizationRequest(params, publicOrigin(req));
    if (body.decision !== 'allow') {
      return NextResponse.json({ redirect: redirectWith(request.redirectUri, { error: 'access_denied', state: request.state }) });
    }
    const scopes = parseScopes(Array.isArray(body.scopes) ? body.scopes.join(' ') : '');
    const code = await createAuthorizationCode(auth.userId, request, scopes);
    return NextResponse.json({ redirect: redirectWith(request.redirectUri, { code, state: request.state, iss: publicOrigin(req) }) });
  } catch (error) { return authorizationError(error, params.get('state'), params.get('redirect_uri') ?? undefined); }
}
