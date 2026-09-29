export const dynamic = 'force-dynamic';
import { authenticateClient, revokeToken } from '@/lib/auth/oauth';
import { clientCredentials, oauthErrorResponse, preflight, readOAuthBody, withCors } from '@/lib/mcp/oauthHttp';

// RFC 7009: unknown or already revoked tokens still answer 200.
export async function POST(req: Request) {
  try {
    const body = await readOAuthBody(req);
    const { clientId, clientSecret } = clientCredentials(req, body);
    await revokeToken(await authenticateClient(clientId, clientSecret), body.token);
    return withCors(new Response(null, { status: 200 }));
  } catch (error) { return oauthErrorResponse(error); }
}
export const OPTIONS = preflight;
