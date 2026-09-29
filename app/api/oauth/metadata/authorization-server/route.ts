export const dynamic = 'force-dynamic';
import type { NextRequest } from 'next/server';
import { authorizationServerMetadata, oauthJson, preflight, publicOrigin } from '@/lib/mcp/oauthHttp';

// Served at /.well-known/oauth-authorization-server and /.well-known/openid-configuration through next.config.mjs rewrites.
export const GET = (req: NextRequest) => oauthJson(authorizationServerMetadata(publicOrigin(req)));
export const OPTIONS = preflight;
