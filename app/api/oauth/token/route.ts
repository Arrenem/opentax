export const dynamic = 'force-dynamic';
import { authenticateClient, exchangeAuthorizationCode, OAuthError, refreshAccessToken } from '@/lib/auth/oauth';
import { clientCredentials, oauthErrorResponse, oauthJson, preflight, readOAuthBody } from '@/lib/mcp/oauthHttp';

export async function POST(req: Request) {
  try {
    const body = await readOAuthBody(req);
    const { clientId, clientSecret } = clientCredentials(req, body);
    const client = await authenticateClient(clientId, clientSecret);
    if (body.grant_type === 'authorization_code') {
      return oauthJson(await exchangeAuthorizationCode(client, {
        code: body.code, redirectUri: body.redirect_uri, codeVerifier: body.code_verifier, resource: body.resource,
      }));
    }
    if (body.grant_type === 'refresh_token') {
      return oauthJson(await refreshAccessToken(client, { refreshToken: body.refresh_token, scope: body.scope }));
    }
    throw new OAuthError('unsupported_grant_type', 'grant_type must be authorization_code or refresh_token');
  } catch (error) { return oauthErrorResponse(error); }
}
export const OPTIONS = preflight;
