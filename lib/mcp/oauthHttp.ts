import type { NextRequest } from 'next/server';
import { AGENT_SCOPES } from '@/lib/auth/scopes';
import { MCP_RESOURCE_PATH, OAuthError } from '@/lib/auth/oauth';

// Remote MCP hosts call these endpoints from their own servers, and browser-based tools such as
// MCP Inspector call them cross-origin. Nothing here uses cookies, so a wildcard origin is safe.
export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID',
  'Access-Control-Expose-Headers': 'WWW-Authenticate, Mcp-Session-Id, Mcp-Protocol-Version',
  'Access-Control-Max-Age': '86400',
};

export function withCors(response: Response) {
  for (const [key, value] of Object.entries(CORS_HEADERS)) response.headers.set(key, value);
  return response;
}

export function preflight() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export function publicOrigin(req: NextRequest) {
  const configured = process.env.OPENTAX_PUBLIC_URL;
  return configured ? new URL(configured).origin : req.nextUrl.origin;
}

export function protectedResourceMetadataUrl(origin: string) {
  return `${origin}/.well-known/oauth-protected-resource${MCP_RESOURCE_PATH}`;
}

export function protectedResourceMetadata(origin: string) {
  return {
    resource: `${origin}${MCP_RESOURCE_PATH}`,
    authorization_servers: [origin],
    scopes_supported: [...AGENT_SCOPES],
    bearer_methods_supported: ['header'],
    resource_name: 'OpenTax',
  };
}

export function authorizationServerMetadata(origin: string) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/api/oauth/token`,
    registration_endpoint: `${origin}/api/oauth/register`,
    revocation_endpoint: `${origin}/api/oauth/revoke`,
    scopes_supported: [...AGENT_SCOPES],
    response_types_supported: ['code'],
    response_modes_supported: ['query'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
    revocation_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
    authorization_response_iss_parameter_supported: true,
  };
}

export function oauthJson(body: unknown, status = 200) {
  return withCors(Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } }));
}

export function oauthErrorResponse(error: unknown) {
  if (error instanceof OAuthError) {
    const response = oauthJson(error.toJSON(), error.status);
    if (error.status === 401) response.headers.set('WWW-Authenticate', 'Basic realm="OpenTax"');
    return response;
  }
  console.error('OpenTax OAuth error:', error);
  return oauthJson({ error: 'server_error', error_description: 'Internal server error' }, 500);
}

// Token and revocation endpoints take form bodies (RFC 6749), but some clients send JSON.
export async function readOAuthBody(req: Request): Promise<Record<string, string>> {
  const type = req.headers.get('content-type') ?? '';
  if (type.includes('application/json')) {
    const json = await req.json().catch(() => null);
    if (!json || typeof json !== 'object') throw new OAuthError('invalid_request', 'Malformed JSON body');
    return Object.fromEntries(Object.entries(json).filter(([, v]) => typeof v === 'string')) as Record<string, string>;
  }
  return Object.fromEntries(new URLSearchParams(await req.text()));
}

// Client credentials from HTTP Basic (client_secret_basic) or the body (client_secret_post / public clients).
export function clientCredentials(req: Request, body: Record<string, string>) {
  const match = /^Basic (\S+)$/i.exec(req.headers.get('authorization') ?? '');
  if (match) {
    const decoded = Buffer.from(match[1], 'base64').toString('utf8');
    const index = decoded.indexOf(':');
    if (index < 0) throw new OAuthError('invalid_client', 'Malformed Basic credentials', 401);
    return { clientId: decodeURIComponent(decoded.slice(0, index)), clientSecret: decodeURIComponent(decoded.slice(index + 1)) };
  }
  return { clientId: body.client_id, clientSecret: body.client_secret };
}
