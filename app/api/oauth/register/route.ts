export const dynamic = 'force-dynamic';
import { OAuthError, registerClient } from '@/lib/auth/oauth';
import { oauthErrorResponse, oauthJson, preflight } from '@/lib/mcp/oauthHttp';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new OAuthError('invalid_client_metadata', 'Malformed JSON body');
    return oauthJson(await registerClient(body), 201);
  } catch (error) { return oauthErrorResponse(error); }
}
export const OPTIONS = preflight;
