import type { NextRequest } from 'next/server';
import { createMcpHandler, type McpHttpHandler } from '@modelcontextprotocol/server';
import { createServer } from '@/packages/opentax-mcp/tools';
import { authenticateRequest, type AuthContext } from '@/lib/auth/authenticateRequest';
import { protectedResourceMetadataUrl, publicOrigin, withCors } from './oauthHttp';
import { createInProcessApi } from './inProcessApi';

// Vercel rejects request bodies above 4.5 MB before they reach the function.
const MAX_BODY_BYTES = 4_500_000;

let handler: McpHttpHandler | undefined;
function mcpHandler() {
  handler ??= createMcpHandler(({ authInfo }) => {
    const origin = authInfo?.extra?.origin;
    if (!authInfo || typeof origin !== 'string') throw new Error('Unauthenticated MCP request');
    return createServer(createInProcessApi(origin, authInfo.token));
  }, { maxRequestBodySize: MAX_BODY_BYTES, onerror: (error) => console.error('OpenTax MCP error:', error) });
  return handler;
}

function unauthorized(origin: string, error: 'invalid_token' | 'insufficient_scope', status = 401) {
  const challenge = `Bearer resource_metadata="${protectedResourceMetadataUrl(origin)}", error="${error}"`;
  return withCors(Response.json({ error, error_description: error === 'invalid_token' ? 'Authentication required' : 'Agent token required' },
    { status, headers: { 'WWW-Authenticate': challenge } }));
}

// Remote MCP endpoint. Accepts OAuth access tokens (ota_) from hosts such as Claude and ChatGPT,
// and static agent tokens (otk_) for hosts that let you set an Authorization header.
export async function handleMcpRequest(req: NextRequest) {
  const origin = publicOrigin(req);
  const token = /^Bearer (\S+)$/i.exec(req.headers.get('Authorization') ?? '')?.[1];
  if (!token) return unauthorized(origin, 'invalid_token');
  let auth: AuthContext;
  try { auth = await authenticateRequest(req); } catch { return unauthorized(origin, 'invalid_token'); }
  // Firebase user sessions have unrestricted rights; MCP always acts as a scoped agent.
  if (auth.actorType !== 'agent') return unauthorized(origin, 'insufficient_scope', 403);
  const response = await mcpHandler().fetch(req, { authInfo: {
    token, clientId: auth.actorId, scopes: auth.scopes, extra: { origin },
  } });
  return withCors(response);
}
